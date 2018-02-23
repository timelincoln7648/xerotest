var express = require("express");
var session = require('express-session');
var bodyParser = require("body-parser");
var mongoose = require("mongoose");



//add Xero
const xero = require('xero-node');
const fs = require('fs');
const config = require("./config.json");

//from xero-node sample app
var xeroClient;
var eventReceiver;
var metaConfig = {};

var app = express();

//from xero-node sample app
app.set('trust proxy', 1);
app.use(session({
    secret: 'something crazy',
    resave: false,
    saveUninitialized: true,
    cookie: { secure: false }
}));

//general setup
// mongoose.connect("mongodb://localhost/xero_test");
app.set("view engine", "ejs");
app.use(express.static("public"));
app.use(bodyParser.urlencoded({extended: true}));


//SETUP XERO

function getXeroClient(session) {
    try {
        metaConfig = require('config.json');
    } catch (ex) {
        if (process && process.env && process.env.APPTYPE) {
            //no config file found, so check the process.env.
            metaConfig.APPTYPE = process.env.APPTYPE;
            metaConfig[metaConfig.APPTYPE.toLowerCase()] = {
                authorizeCallbackUrl: process.env.authorizeCallbackUrl,
                userAgent: process.env.userAgent,
                consumerKey: process.env.consumerKey,
                consumerSecret: process.env.consumerSecret
            }
        } else {
            throw "Config not found";
        }
    }
  
    var APPTYPE = metaConfig.APPTYPE;
    var config = metaConfig[APPTYPE.toLowerCase()];

    if (session && session.token) {
        config.accessToken = session.token.oauth_token;
        config.accessSecret = session.token.oauth_token_secret;
    }

    if (config.privateKeyPath && !config.privateKey) {
        try {
            //Try to read from the path
            config.privateKey = fs.readFileSync(config.privateKeyPath);
        } catch (ex) {
            //It's not a path, so use the consumer secret as the private key
            config.privateKey = "";
        }
    }

    switch (APPTYPE) {
        case "PUBLIC":
            xeroClient = new xero.PublicApplication(config);
            break;
        case "PARTNER":
            xeroClient = new xero.PartnerApplication(config);
            eventReceiver = xeroClient.eventEmitter;
            eventReceiver.on('xeroTokenUpdate', function(data) {
                //Store the data that was received from the xeroTokenRefresh event
                console.log("Received xero token refresh: ", data);
            });
            break;
        default:
            throw "No App Type Set!!"
    }
    return xeroClient;
}

function authorizeRedirect(req, res, returnTo) {
    var xeroClient = getXeroClient(req.session, returnTo);
    xeroClient.getRequestToken(function(err, token, secret) {
        if (!err) {
            req.session.oauthRequestToken = token;
            req.session.oauthRequestSecret = secret;
            req.session.returnto = returnTo;

            //Note: only include this scope if payroll is required for your application.
            var PayrollScope = 'payroll.employees,payroll.payitems,payroll.timesheets';
            var AccountingScope = '';

            var authoriseUrl = xeroClient.buildAuthorizeUrl(token, {
                scope: AccountingScope
            });
            res.redirect(authoriseUrl);
        } else {
            res.redirect('/error');
        }
    })
}

function authorizedOperation(req, res, returnTo, callback) {
    if (req.session.token) {
      callback(getXeroClient(req.session));
    } else {
      authorizeRedirect(req, res, returnTo);
    }
}

function handleErr(err, req, res, returnTo) {
    console.log(err);
    if (err.data && err.data.oauth_problem && err.data.oauth_problem == "token_rejected") {
        authorizeRedirect(req, res, returnTo);
    } else {
        res.redirect('error', err);
    }
}


//ROUTES

app.get('/error', function(req, res) {
    console.log(req.query.error);
    res.render('home', { error: req.query.error });
})

// app.get("/", function(req, res){
//     res.render("home");
// });

// Home Page
app.get('/', function(req, res) {
    res.render('home', {
        active: {
            overview: true
        }
    });
});





//start server
app.listen(process.env.PORT, process.env.IP, function(){
    console.log("server started homie");
});