var express = require("express");
var app = express();
var bodyParser = require("body-parser");
var mongoose = require("mongoose");

//add Xero
const xero = require('xero-node');
const fs = require('fs');
const config = require("./config.json");



//general setup
// mongoose.connect("mongodb://localhost/xero_test");
app.set("view engine", "ejs");
app.use(express.static("public"));
app.use(bodyParser.urlencoded({extended: true}));


app.get("/", function(req, res){
    res.render("home");
});


//start server
app.listen(process.env.PORT, process.env.IP, function(){
    console.log("server started homie");
});