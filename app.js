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


//
//MY Variables
//

var connectedToXero = false;
var connectedXeroOrgName = "";
var orgData = {
    name: "",
    countryCode: ""
}



//ROUTES

// Home Page
app.get('/', function(req, res) {
    
//pass setOrgData to authorizedOperation, PUT RENDER IN CALLBACK
    
    // //authorizedOperation(req, res, "/", setOrgData);
    // setOrgData(getXeroClient(req.session));
    
    // //pass org data object into render of home page so you can display data in ejs on the home page
    
    res.render('home', {
        active: {
            overview: true
        }
    });
    
    
    
//code to get organisation data (from sample app) isn't working below
    
    // authorizedOperation(req, res, '/', function(xeroClient) {
    //     xeroClient.core.organisations.getOrganisations()
    //         .then(function(organisations) {
    //             orgData.name = organisations[0].name;
    //             console.log("org name set in orgData to: "+orgData.name);
    //             console.log("organisations object: \n"+ organisations.toString());
    //             res.render('home', {
    //                 organisations: organisations,
    //                 active: {
    //                     organisations: true,
    //                 }});
    //         })
    //         .catch(function(err) {
    //             handleErr(err, req, res, 'organisations');
    //         })
    // });
});


app.get('/organisationDetails', function(req, res){
    console.log("loading organisation details page...");
    //res.render('organisationDetails');
    
    authorizedOperation(req, res, '/organisationDetails', function(xeroClient) {
        xeroClient.core.organisations.getOrganisations()
            .then(function(organisations) {
                console.log("organisation.length is: "+organisations.length);
                console.log("\norganisations object: \n"+organisations+"\n");
                
                var firstOrg = organisations[0];
                var orgName = firstOrg.Name;
                console.log("firstOrg.Name is: "+orgName);
                
                
                
                res.render('organisationDetails', {
                    organisations: organisations,
                    theOrg: firstOrg,
                    active: {
                        organisations: true,
                        nav: {
                            accounting: true
                        }
                    }
                });
            })
            .catch(function(err) {
                handleErr(err, req, res, 'organisationDetails');
            })
    })
    
});


app.get('/initialConnect', function(req, res){
    authorizedOperation(req, res, '/', function(xeroClient) {
        console.log("this doesn't seem to ever execute...");
    });
});

// Redirected from xero with oauth results
app.get('/access', function(req, res) {
    var xeroClient = getXeroClient();

    if (req.query.oauth_verifier && req.query.oauth_token == req.session.oauthRequestToken) {
        xeroClient.setAccessToken(req.session.oauthRequestToken, req.session.oauthRequestSecret, req.query.oauth_verifier)
            .then(function(token) {
                req.session.token = token.results;
                console.log(req.session);

                var returnTo = req.session.returnto;
                res.redirect(returnTo || '/');
            })
            .catch(function(err) {
                handleErr(err, req, res, 'error');
            })
    }
});


app.get('/error', function(req, res) {
    console.log(req.query.error);
    res.render('home', { error: req.query.error });
})


//
//MY HELPERS
//

function setOrgData(xeroClient) {
    //try just printing it first
    console.log("about to print some org data from setOrgData function...");
}



//XERO Helpers

function getXeroClient(session) {
    //get the config details from file or env
    try {
        metaConfig = require('./config.json');
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

//OAuth to Xero
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
        console.log("already OAuthed to Xero, passing xeroClient to callback function");
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




//start server
app.listen(process.env.PORT, process.env.IP, function(){
    console.log("server started homie");
});