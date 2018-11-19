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




//ROUTES

// Home Page
app.get('/', function(req, res) {
    res.render('home');
});

app.get('/helloWorld', function(req, res) {
    res.send('Hello World!');
});

app.get('/organisationDetails', function(req, res){
    
    authorizedOperation(req, res, '/organisationDetails', function(xeroClient) {
        xeroClient.core.organisations.getOrganisations()
            .then(function(organisations) {
                var firstOrg = organisations[0];
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

app.get('/manageContacts', function(req, res){
    var avatars = getAvatarURLArray();
    
    authorizedOperation(req, res, '/manageContacts', function(xeroClient) {
        var contacts = [];
        xeroClient.core.contacts.getContacts({ pager: { callback: pagerCallback } })
            .then(function() {
                res.render('manageContacts', {
                    contacts: contacts,
                    avatars: avatars,
                    active: {
                        contacts: true,
                        nav: {
                            accounting: true
                        }
                    }
                });
            })
            .catch(function(err) {
                handleErr(err, req, res, 'contacts');
            })

        function pagerCallback(err, response, cb) {
            contacts.push.apply(contacts, response.data);
            cb()
        }
    })
});



app.use('/contacts', function(req, res) {
    if (req.method == 'GET') {
        return res.redirect('/manageContacts');
    } else if (req.method == 'POST') {
        
        //get data from form
       var newContact = {
           firstName: req.body.firstName, 
           lastName: req.body.lastName,
           completeName: req.body.firstName+" "+req.body.lastName,
           address: req.body.address,
           address2: req.body.address2,
           country: req.body.country
       };
        
        authorizedOperation(req, res, '/manageContacts', function(xeroClient) {
            var contact = xeroClient.core.contacts.newContact({
                Name: newContact.completeName
            });
            contact.save()
                .then(function(ret) {
                    res.redirect('/manageContacts')
                })
                .catch(function(err) {
                    res.render('manageContacts', { outcome: 'Error', err: err })
                })
        })
    }
});

app.get('/manageInvoices', function(req, res){
    res.render('manageInvoices');
});

//API Connection Routes


app.get('/connectionSettings', function(req, res){
    var connectionStatus = connectedToXero(req);
    
    res.render('connectionSettings',
        {
            connectionStatus: connectionStatus
        }
    );
});

app.get('/initialConnect', function(req, res){
    authorizedOperation(req, res, '/connectionSettings', function(xeroClient) {
        console.log("this doesn't seem to ever execute...");
    });
});

app.get('/disconnectXero', function(req, res){
   if (req.session.token) {
       //delete token
       req.session.token = "";
   } else {
       console.log("no token to delete...");
   }
   res.redirect('/connectionSettings')
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
//MY HELPER FUNCTIONS
//


function connectedToXero(req){
    if (req.session.token) {
        return true;
    } else {
        return false;
    }
}

function getAvatarURLArray() {
    var names = [
        "elliot",
        "joe",
        "jenny",
        "chris",
        "steve",
        "helen",
        "daniel",
        "matt",
        "christian",
        "stevie",
        "ade",
        "laura"
        ]
    var arrayOfURLs = [];    

    for (var i=0; i<names.length; i++){
        var newURL = "https://semantic-ui.com/images/avatar/small/"+names[i]+".jpg";
        arrayOfURLs.push(newURL);
    }
    
    return arrayOfURLs;
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
module.exports = app.listen(3000, process.env.IP, function(){
    console.log("server started homie");
});


