var request = require("supertest");

var app = require("../app.js");

describe('GET /', function() {
    it('displays "Hello World!"', function(done) {
      // The line below is the core test of our app.
      request(app).get('/helloWorld').expect('Hello World!', done);
    });
  });