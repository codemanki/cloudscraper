'use strict';

var cloudscraper = require('../index');
var request      = require('request-promise');
var errors = require('../errors');
var helper       = require('./helper');

var sinon   = require('sinon');
var expect  = require('chai').expect;
var assert = require('chai').assert;

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
    var fakeError = new Error('fake');

    Request.callsFake(helper.fakeRequest({ error: fakeError }));

    var promise = cloudscraper.get(uri, function (error) {
      expect(error).to.be.instanceOf(errors.RequestError);
      expect(error).to.have.property('error', fakeError);
      expect(error).to.have.property('errorType', 0);

      expect(Request).to.be.calledOnceWithExactly(helper.defaultParams);
    });

    expect(promise).to.be.rejectedWith(errors.RequestError).and.notify(done);
  });

  it('should return error if captcha is served by cloudflare', function(done) {
    var expectedResponse = helper.fakeResponse({
      statusCode: 503,
      body: helper.getFixture('captcha.html')
    });

    Request.callsFake(helper.fakeRequest({ response: expectedResponse }));

    var promise = cloudscraper.get(uri, function (error, response, body) {
      // errorType 1, means captcha is served
      expect(error).to.be.instanceOf(errors.CaptchaError);
      expect(error).to.have.property('error', 'captcha');
      expect(error).to.have.property('errorType', 1);

      expect(Request).to.be.calledOnceWithExactly(helper.defaultParams);

      expect(response).to.be.equal(expectedResponse);
      expect(body).to.be.equal(expectedResponse.body);
    });

    expect(promise).to.be.rejectedWith(errors.CaptchaError).and.notify(done);
  });

  it('should return error if cloudflare returned some inner error', function(done) {
    // https://support.cloudflare.com/hc/en-us/sections/200038216-CloudFlare-Error-Messages
    // Error codes: 1012, 1011, 1002, 1000, 1004, 1010, 1006, 1007, 1008

    var expectedResponse = helper.fakeResponse({
      statusCode: 500,
      body: helper.getFixture('access_denied.html')
    });

    Request.callsFake(helper.fakeRequest({ response: expectedResponse }));

    var promise = cloudscraper.get(uri, function (error, response, body) {
      // errorType 2, means inner cloudflare error
      expect(error).to.be.instanceOf(errors.CloudflareError);
      expect(error).to.have.property('error', 1006);
      expect(error).to.have.property('errorType', 2);

      expect(Request).to.be.calledOnceWithExactly(helper.defaultParams);

      expect(response).to.be.equal(expectedResponse);
      expect(body).to.be.equal(expectedResponse.body);
    });

    expect(promise).to.be.rejectedWith(errors.CloudflareError).and.notify(done);
  });

  it('should return error if cf presented more than 3 challenges in a row', function(done) {
    // The expected params for all subsequent calls to Request
    var expectedParams = helper.extendParams({
      uri: 'http://example-site.dev/cdn-cgi/l/chk_jschl'
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

    var promise = cloudscraper.get(uri, function (error, response, body) {
      expect(error).to.be.instanceOf(errors.CloudflareError);
      expect(error).to.have.property('error', 'Cloudflare challenge loop');
      expect(error).to.have.property('errorType', 4);

      assert.equal(Request.callCount, 4, 'Request call count');
      expect(Request.firstCall).to.be.calledWithExactly(helper.defaultParams);

      var total = helper.defaultParams.challengesToSolve + 1;
      for (var i = 1; i < total; i++) {
        // Decrement the number of challengesToSolve to match actual params
        expectedParams.challengesToSolve -= 1;
        expect(Request.getCall(i)).to.be.calledWithExactly(expectedParams);
      }

      expect(response).to.be.equal(expectedResponse);
      expect(body).to.be.equal(expectedResponse.body);
    });

    expect(promise).to.be.rejectedWith(errors.CloudflareError).and.notify(done);

    // Tick the timeout
    this.clock.tick(200000);
  });

  it('should return error if body is undefined', function(done) {
    // https://support.cloudflare.com/hc/en-us/sections/200038216-CloudFlare-Error-Messages
    // Error codes: 1012, 1011, 1002, 1000, 1004, 1010, 1006, 1007, 1008

    Request.callsFake(helper.fakeRequest({
      response: {statusCode: 500}
    }));

    var promise = cloudscraper.get(uri, function (error, response, body) {
      expect(error).to.be.instanceOf(errors.RequestError);
      expect(error).to.have.property('error', null);
      expect(error).to.have.property('errorType', 0);

      expect(Request).to.be.calledOnceWithExactly(helper.defaultParams);

      expect(body).to.be.equal(undefined);
    });

    expect(promise).to.be.rejectedWith(errors.RequestError).and.notify(done);
  });

  it('should return error if challenge page failed to be parsed', function(done) {
    var expectedResponse = helper.fakeResponse({
      body: helper.getFixture('invalid_js_challenge.html')
    });

    Request.callsFake(helper.fakeRequest({ response: expectedResponse }));

    var promise = cloudscraper.get(uri, function (error, response, body) {
      expect(error).to.be.instanceOf(errors.ParserError);
      expect(error).to.have.property('error').that.is.ok;
      expect(error).to.have.property('errorType', 3);

      expect(Request).to.be.calledOnceWithExactly(helper.defaultParams);

      expect(response).to.be.equal(expectedResponse);
      expect(body).to.be.equal(expectedResponse.body);
    });

    expect(promise).to.be.rejectedWith(errors.ParserError).and.notify(done);

    this.clock.tick(7000); // tick the timeout
  });

  it('should return error if js challenge has error during evaluation', function(done) {
    var expectedResponse = helper.fakeResponse({
      statusCode: 503,
      body: helper.getFixture('js_challenge_03_12_2018_1.html')
    });

    // Adds a syntax error near the end of line 37
    expectedResponse.body = expectedResponse.body.replace(/\.toFixed/gm, '..toFixed');

    Request.callsFake(helper.fakeRequest({ response: expectedResponse }));

    var promise = cloudscraper.get(uri, function (error, response, body) {
      expect(error).to.be.instanceOf(errors.ParserError);
      expect(error).to.have.property('error').that.is.an('error');
      expect(error).to.have.property('errorType', 3);
      expect(error.message).to.include('Challenge evaluation failed');

      expect(Request).to.be.calledOnceWithExactly(helper.defaultParams);

      expect(response).to.be.equal(expectedResponse);
      expect(body).to.be.equal(expectedResponse.body);
    });

    expect(promise).to.be.rejectedWith(errors.ParserError).and.notify(done);

    this.clock.tick(7000); // tick the timeout
  });

  it('should return error if challengeId extraction fails', function(done) {
    var expectedResponse = helper.fakeResponse({
      statusCode: 503,
      body: helper.getFixture('js_challenge_03_12_2018_1.html')
    });

    expectedResponse.body = expectedResponse.body.replace(/name="jschl_vc"/gm, '');

    Request.callsFake(helper.fakeRequest({ response: expectedResponse }));

    var promise = cloudscraper.get(uri, function (error, response, body) {
      expect(error).to.be.instanceOf(errors.ParserError);
      expect(error).to.have.property('error', 'challengeId (jschl_vc) extraction failed');
      expect(error).to.have.property('errorType', 3);

      expect(Request).to.be.calledOnceWithExactly(helper.defaultParams);

      expect(response).to.be.equal(expectedResponse);
      expect(body).to.be.equal(expectedResponse.body);
    });

    expect(promise).to.be.rejectedWith(errors.ParserError).and.notify(done);

    this.clock.tick(7000); // tick the timeout
  });


  it('should return error if it was thrown by request when solving challenge', function(done) {
    var expectedResponse = helper.fakeResponse({
      statusCode: 503,
      body: helper.getFixture('js_challenge_21_05_2015.html')
    });

    var fakeError = Object.assign(new Error('read ECONNRESET'), {
      code: 'ECONNRESET', errno: 'ECONNRESET', syscall: 'read'
    });

    // Cloudflare is enabled for site. It returns a page with js challenge
    Request.onFirstCall()
        .callsFake(helper.fakeRequest({ response: expectedResponse }));

    Request.onSecondCall()
        .callsFake(helper.fakeRequest({ error: fakeError }));

    var promise = cloudscraper.get(uri, function (error) {
      // errorType 0, a connection error for example
      expect(error).to.be.instanceOf(errors.RequestError);
      expect(error).to.have.property('error', fakeError);
      expect(error).to.have.property('errorType', 0);

      expect(Request).to.be.calledTwice;
      expect(Request.firstCall).to.be.calledWithExactly(helper.defaultParams);
    });

    expect(promise).to.be.rejectedWith(errors.RequestError).and.notify(done);

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

    var promise = cloudscraper.get(uri, function (error, response, body) {
      // errorType 1, means captcha is served
      expect(error).to.be.instanceOf(errors.CaptchaError);
      expect(error).to.have.property('error', 'captcha');
      expect(error).to.have.property('errorType', 1);

      expect(Request).to.be.calledTwice;
      expect(Request.firstCall).to.be.calledWithExactly(helper.defaultParams);
      expect(Request.secondCall).to.be.calledWithExactly(secondParams);

      expect(response).to.be.equal(secondResponse);
      expect(body).to.be.equal(secondResponse.body);
    });

    expect(promise).to.be.rejectedWith(errors.CaptchaError).and.notify(done);

    this.clock.tick(7000); // tick the timeout
  });

  it('should return error if challenge page cookie extraction fails', function(done) {
    // Cloudflare is enabled for site.
    // It returns a redirecting page if a (session) cookie is unset.
    var expectedResponse = helper.fakeResponse({
      statusCode: 503,
      // The cookie extraction codes looks for the `S` variable assignment
      body: helper.getFixture('js_challenge_cookie.html').replace(/S=/gm, 'Z=')
    });

    Request.callsFake(helper.fakeRequest({ response: expectedResponse }));

    var promise = cloudscraper.get(uri, function (error, response, body) {
      expect(error).to.be.instanceOf(errors.ParserError);
      expect(error).to.have.property('error', 'Cookie code extraction failed');
      expect(error).to.have.property('errorType', 3);

      expect(Request).to.be.calledOnceWithExactly(helper.defaultParams);

      expect(response).to.be.equal(expectedResponse);
      expect(body).to.be.equal(expectedResponse.body);
    });

    expect(promise).to.be.rejectedWith(errors.ParserError).and.notify(done);
  });

  it('should throw a TypeError if callback is not a function', function(done) {
    var spy = sinon.spy(function() {
      cloudscraper.get(uri);
    });

    expect(spy).to.throw(TypeError, /Expected a callback function/);
    done();
  });

  it('should throw a TypeError if requester is not a function', function (done) {
    var spy = sinon.spy(function () {
      cloudscraper.get({ requester: null });
    });

    expect(spy).to.throw(TypeError, /`requester` option .*function/);
    done();
  });

  it('should throw a TypeError if challengesToSolve is not a number', function(done) {
    var spy = sinon.spy(function() {
      var options = { uri: uri, challengesToSolve: 'abc' };

      cloudscraper.get(options, function(){});
    });

    expect(spy).to.throw(TypeError, /`challengesToSolve` option .*number/);
    done();
  });

  it('should detect captcha in response body\'s real encoding', function (done) {
    var firstParams = helper.extendParams({
      realEncoding: 'fake-encoding'
    });

    var expectedResponse = helper.fakeResponse({
      statusCode: 503,
      body: {
        toString: function(encoding) {
          if (encoding === 'fake-encoding') {
            return helper.getFixture('captcha.html');
          }

          return 'fake response body';
        }
      }
    });

    Request.callsFake(helper.fakeRequest({ response: expectedResponse }));

    var options = { uri: uri, encoding: 'fake-encoding' };

    var promise = cloudscraper.get(options, function (error, response, body) {
      // errorType 1, means captcha is served
      expect(error).to.be.instanceOf(errors.CaptchaError);
      expect(error).to.have.property('error', 'captcha');
      expect(error).to.have.property('errorType', 1);

      expect(Request).to.be.calledOnceWithExactly(firstParams);

      expect(response).to.be.equal(expectedResponse);
      expect(body).to.be.equal(expectedResponse.body.toString('fake-encoding'));
    });

    expect(promise).to.be.rejectedWith(errors.CaptchaError).and.notify(done);

    this.clock.tick(7000); // tick the timeout
  });

  it('should return error if cookie setting code evaluation fails', function(done) {
    // Change the cookie setting code so the vm will throw an error
    var html = helper.getFixture('js_challenge_cookie.html');
    var b64 = (new Buffer('throw new Error(\'vm eval failed\');')).toString('base64');

    var expectedResponse = helper.fakeResponse({
      statusCode: 503,
      body: html.replace(/S='([^']+)'/, 'S=\'' + b64 + '\'')
    });

    Request.callsFake(helper.fakeRequest({ response: expectedResponse }));

    var promise = cloudscraper.get(uri, function (error, response, body) {
      expect(error).to.be.instanceOf(errors.ParserError);
      expect(error).to.have.property('error').that.is.an('error');
      expect(error).to.have.property('errorType', 3);
      expect(error.message).to.include('vm eval failed');

      expect(Request).to.be.calledOnceWithExactly(helper.defaultParams);

      expect(response).to.be.equal(expectedResponse);
      expect(body).to.be.equal(expectedResponse.body);
    });

    expect(promise).to.be.rejectedWith(errors.ParserError).and.notify(done);

    this.clock.tick(7000); // tick the timeout
  });
});
