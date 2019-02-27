'use strict';

var cloudscraper = require('../index');
var request      = require('request');
var helper       = require('./helper');

var sinon   = require('sinon');
var expect  = require('chai').expect;

describe('Cloudscraper', function() {
  var uri = helper.defaultParams.uri;
  var sandbox;
  var Request;

  beforeEach(function () {
    sandbox = sinon.createSandbox();
    // Prepare stubbed Request for each test
    Request = sandbox.stub(request, 'Request');
    // setTimeout should be properly stubbed to prevent the unit test from running too long.
    this.clock = sinon.useFakeTimers();
  });

  afterEach(function () {
    sandbox.restore();
    this.clock.restore();
  });

  it('should return error if it was thrown by request', function(done) {
    var fakeError = new Error('fake error');

    Request.callsFake(helper.fakeRequest({ error: fakeError }));

    cloudscraper.get(uri, function(error) {
      // errorType 0, means it is some kind of system error
      expect(error).to.be.an('object');
      expect(error).to.be.eql({ errorType: 0, error: fakeError });
      expect(error.error).to.be.an('error');

      expect(Request).to.be.calledOnce;
      expect(Request.firstCall).to.be.calledWithExactly(helper.defaultParams);
      done();
    });

  });

  it('should return error if captcha is served by cloudflare', function(done) {
    var onlyResponse = helper.fakeResponse({
      statusCode: 503,
      body: helper.getFixture('captcha.html')
    });

    Request.callsFake(helper.fakeRequest({ response: onlyResponse }));

    cloudscraper.get(uri, function(error, response, body) {
      // errorType 1, means captcha is served
      expect(error).to.be.an('object');
      expect(error).to.be.eql({ errorType: 1 });

      expect(Request).to.be.calledOnce;
      expect(Request.firstCall).to.be.calledWithExactly(helper.defaultParams);

      expect(response).to.be.equal(onlyResponse);
      expect(body).to.be.equal(onlyResponse.body);
      done();
    });
  });

  it('should return error if cloudflare returned some inner error', function(done) {
    // https://support.cloudflare.com/hc/en-us/sections/200038216-CloudFlare-Error-Messages
    // Error codes: 1012, 1011, 1002, 1000, 1004, 1010, 1006, 1007, 1008

    var onlyResponse = helper.fakeResponse({
      statusCode: 500,
      body: helper.getFixture('access_denied.html')
    });

    Request.callsFake(helper.fakeRequest({ response: onlyResponse }));

    cloudscraper.get(uri, function(error, response, body) {
      // errorType 2, means inner cloudflare error
      expect(error).to.be.an('object');
      expect(error).to.be.eql({ errorType: 2, error: 1006 });

      expect(Request).to.be.calledOnce;
      expect(Request.firstCall).to.be.calledWithExactly(helper.defaultParams);

      expect(response).to.be.equal(onlyResponse);
      expect(body).to.be.equal(onlyResponse.body);
      done();
    });
  });
  
  it('should return error if cf presented more than 3 challenges in a row', function(done) {
    // The expected params for all subsequent calls to Request
    var expectedParams = helper.extendParams({
      uri: 'http://example-site.dev/cdn-cgi/l/chk_jschl',
    });

    // Perform less strict matching on headers and qs to simplify this test
    Object.assign(expectedParams, {
      headers: sinon.match.object,
      qs: sinon.match.object
    });

    // Cloudflare is enabled for site. It returns a page with js challenge
    var expectedResponse = helper.fakeResponse({
      statusCode: 503,
      body: helper.getFixture('js_challenge_09_06_2016.html')
    });

    Request.callsFake(helper.fakeRequest({ response: expectedResponse }));

    cloudscraper.get(uri, function(error, response, body) {
      expect(error).to.be.an('object');
      expect(error).to.be.eql({ errorType: 4 });

      expect(Request.callCount).to.be.equal(4);
      expect(Request.firstCall).to.be.calledWithExactly(helper.defaultParams);

      var total = helper.defaultParams.challengesToSolve + 1;
      for (var i = 1; i < total; i++) {
        // Decrement the number of challengesToSolve to match actual params
        expectedParams.challengesToSolve -= 1;
        expect(Request.getCall(i)).to.be.calledWithExactly(expectedParams);
      }

      expect(response).to.be.equal(expectedResponse);
      expect(body).to.be.equal(expectedResponse.body);
      done();
    });

    this.clock.tick(200000); // tick the timeout
  });
  it('should return error if body is undefined', function(done) {
    // https://support.cloudflare.com/hc/en-us/sections/200038216-CloudFlare-Error-Messages
    // Error codes: 1012, 1011, 1002, 1000, 1004, 1010, 1006, 1007, 1008

    Request.callsFake(helper.fakeRequest({
      response: { statusCode: 500}
    }));

    cloudscraper.get(uri, function(error, response, body) {
      // errorType 2, means inner cloudflare error
      expect(error).to.be.an('object');
      expect(error).to.be.eql({ errorType: 0, error: null });

      expect(Request).to.be.calledOnce;
      expect(Request.firstCall).to.be.calledWithExactly(helper.defaultParams);

      expect(body).to.be.equal(undefined);
      done();
    });
  });

  it('should return error if challenge page failed to be parsed', function(done) {
    var onlyResponse = helper.fakeResponse({
      body: helper.getFixture('invalid_js_challenge.html')
    });

    Request.callsFake(helper.fakeRequest({ response: onlyResponse }));

    cloudscraper.get(uri, function(error, response, body) {
      // errorType 3, means parsing failed
      expect(error).to.be.an('object');
      expect(error).to.own.include({ errorType: 3 });

      expect(Request).to.be.calledOnce;
      expect(Request).to.be.calledWithExactly(helper.defaultParams);

      expect(response).to.be.equal(onlyResponse);
      expect(body).to.be.equal(onlyResponse.body);
      done();
    });

    this.clock.tick(7000); // tick the timeout
  });

  it('should return error if it was thrown by request when solving challenge', function(done) {
    var onlyResponse = helper.fakeResponse({
      statusCode: 503,
      body: helper.getFixture('js_challenge_21_05_2015.html')
    });

    var fakeError = Object.assign(new Error('read ECONNRESET'), {
      code: 'ECONNRESET', errno: 'ECONNRESET', syscall: 'read'
    });

    // Cloudflare is enabled for site. It returns a page with js challenge
    Request.onFirstCall()
        .callsFake(helper.fakeRequest({ response: onlyResponse }));

    Request.onSecondCall()
        .callsFake(helper.fakeRequest({ error: fakeError }));

    cloudscraper.get(uri, function(error) {
      // errorType 0, a connection error for example
      expect(error).to.be.an('object');
      expect(error).to.be.eql({ errorType: 0, error: fakeError });
      expect(error.error).to.be.an('error');

      expect(Request).to.be.calledTwice;
      expect(Request.firstCall).to.be.calledWithExactly(helper.defaultParams);
      done();
    });

    // tick the timeout
    this.clock.tick(7000);
  });

  it('should properly handle a case when after a challenge another one is returned', function(done) {
    // Cloudflare is enabled for site. It returns a page with js challenge
    var firstResponse = helper.fakeResponse({
      statusCode: 503,
      body: helper.getFixture('js_challenge_09_06_2016.html')
    });

    Request.onFirstCall()
        .callsFake(helper.fakeRequest({ response: firstResponse }));

    // Second call to request.get returns recaptcha
    var secondParams = helper.extendParams({
      uri: 'http://example-site.dev/cdn-cgi/l/chk_jschl',
      challengesToSolve: 2
    });

    // Perform less strict matching on headers and qs to simplify this test
    Object.assign(secondParams, {
      headers: sinon.match.object,
      qs: sinon.match.object
    });

    var secondResponse = helper.fakeResponse({
      body: helper.getFixture('captcha.html')
    });

    Request.onSecondCall()
        .callsFake(helper.fakeRequest({ response: secondResponse }));

    cloudscraper.get(uri, function(error, response, body) {
      // errorType 1, means captcha is served
      expect(error).to.be.an('object');
      expect(error).to.be.eql({ errorType: 1 });

      expect(Request).to.be.calledTwice;
      expect(Request.firstCall).to.be.calledWithExactly(helper.defaultParams);
      expect(Request.secondCall).to.be.calledWithExactly(secondParams);

      expect(response).to.be.equal(secondResponse);
      expect(body).to.be.equal(secondResponse.body);
      done();
    });

    this.clock.tick(7000); // tick the timeout
  });
});
