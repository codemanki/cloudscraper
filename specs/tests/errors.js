var helper       = require('../spec_helper');
var request      = require('request');

describe('Cloudscraper', function() {
  var sandbox;
  var captchaPage       = helper.getFixture('captcha.html');
  var accessDenied      = helper.getFixture('access_denied.html');
  var invalidChallenge  = helper.getFixture('invalid_js_challenge.html');
  var url = helper.testDefaults.url;
  var headers = helper.testDefaults.headers;

  // Since request.defaults returns new wrapper, create one global instance and then stub it in beforeEach
  var requestDefault  = request.defaults({jar: true});
  var defaultWithArgs = helper.requestParams({});

  var cloudscraper;
  before(function() {
    helper.dropCache();
  });

  beforeEach(function () {
    sandbox = sinon.sandbox.create();
    sandbox.stub(request, 'defaults').returns(requestDefault);
    cloudscraper = require('../../index');
    // since cloudflare requires timeout, the module relies on setTimeout. It should be proprely stubbed to avoid ut running for too long
    this.clock = sinon.useFakeTimers();
  });

  afterEach(function () {
    sandbox.restore();
    this.clock.restore();
  });

  it('should return error if it was thrown by request', function(done) {
    var response = { statusCode: 500 },
        fakeError = {fake: 'error'}; //not real request error, but it doesn't matter

    sandbox.stub(requestDefault, 'get')
      .withArgs(defaultWithArgs)
      .callsArgWith(1, fakeError, response, '');

    cloudscraper.get(url, function(error) {
      expect(error).to.be.eql({errorType: 0, error: fakeError}); // errorType 0, means it is some kind of system error
      done();
    }, headers);

  });

  it('should return error if captcha is served by cloudflare', function(done){
    var response = { statusCode: 503 };

    sandbox.stub(requestDefault, 'get')
      .withArgs(defaultWithArgs)
      .callsArgWith(1, null, response, captchaPage);

    cloudscraper.get(url, function(error, body, response) {
      expect(error).to.be.eql({errorType: 1}); // errorType 1, means captcha is served
      expect(response).to.be.eql(captchaPage);
      done();
    }, headers);
  });

  it('should return error if cloudflare returned some inner error', function(done){
    //https://support.cloudflare.com/hc/en-us/sections/200038216-CloudFlare-Error-Messages error codes: 1012, 1011, 1002, 1000, 1004, 1010, 1006, 1007, 1008
    var response = { statusCode: 500 };

    sandbox.stub(requestDefault, 'get')
      .withArgs(defaultWithArgs)
      .callsArgWith(1, null, response, accessDenied);

    cloudscraper.get(url, function(error, body, response) {
      expect(error).to.be.eql({errorType: 2, error: 1006}); // errorType 2, means inner cloudflare error
      expect(response).to.be.eql(accessDenied);
      done();
    }, headers);
  });
  
  it('should return errior if cf presented more than 3 challenges in a row', function(done) {
    var jsChallengePage = helper.getFixture('js_challenge_09_06_2016.html');
    var response = helper.fakeResponseObject(503, headers, jsChallengePage, url);
    var stubbed;

    var pageWithCaptchaResponse = { statusCode: 200 };
    // Cloudflare is enabled for site. It returns a page with js challenge
    stubbed = sandbox.stub(requestDefault, 'get')
      .withArgs(helper.requestParams({url: url, headers: headers}))
      .callsArgWith(1, null, response, jsChallengePage);

    // Second call to request.get returns challenge
    stubbed.withArgs({
      method: 'GET',
      url: 'http://example-site.dev/cdn-cgi/l/chk_jschl',
      qs: sinon.match.any,
      headers: sinon.match.any,
      encoding: null,
      realEncoding: 'utf8',
      followAllRedirects: true,
      challengesToSolve: 2
    })
    .callsArgWith(1, null, response, jsChallengePage);

    // Third call to request.get returns challenge
    stubbed.withArgs({
      method: 'GET',
      url: 'http://example-site.dev/cdn-cgi/l/chk_jschl',
      qs: sinon.match.any,
      headers: sinon.match.any,
      encoding: null,
      realEncoding: 'utf8',
      followAllRedirects: true,
      challengesToSolve: 1
    })
    .callsArgWith(1, null, response, jsChallengePage);

    // Fourth call to request.get still returns a challenge
    stubbed.withArgs({
      method: 'GET',
      url: 'http://example-site.dev/cdn-cgi/l/chk_jschl',
      qs: sinon.match.any,
      headers: sinon.match.any,
      encoding: null,
      realEncoding: 'utf8',
      followAllRedirects: true,
      challengesToSolve: 0
    })
    .callsArgWith(1, null, response, jsChallengePage);

    cloudscraper.get(url, function(error, body, response) {
      expect(error).to.be.eql({errorType: 4}); // errorType 1, means captcha is served
      expect(response).to.be.eql(jsChallengePage);
      done();
    }, headers);

    this.clock.tick(200000); // tick the timeout
  });
  it('should return error if body is undefined', function(done){
    //https://support.cloudflare.com/hc/en-us/sections/200038216-CloudFlare-Error-Messages error codes: 1012, 1011, 1002, 1000, 1004, 1010, 1006, 1007, 1008
    var response = { statusCode: 500 };

    sandbox.stub(requestDefault, 'get')
      .withArgs(defaultWithArgs)
      .callsArgWith(1, null, response, undefined);

    cloudscraper.get(url, function(error, body, response) {
      expect(error).to.be.eql({errorType: 0, error: null}); // errorType 2, means inner cloudflare error
      expect(response).to.be.eql(undefined);
      done();
    }, headers);
  });

  it('should return error if challenge page failed to be parsed', function(done) {
    var response = helper.fakeResponseObject(200, headers, invalidChallenge, url);
    sandbox.stub(requestDefault, 'get')
      .withArgs(defaultWithArgs)
      .callsArgWith(1, null, response, invalidChallenge);

    cloudscraper.get(url, function(error, body, response) {
      expect(error.errorType).to.be.eql(3); // errorType 3, means parsing failed
      expect(response).to.be.eql(invalidChallenge);
      done();
    }, headers);

    this.clock.tick(7000); // tick the timeout
  });

  it('should return error if it was thrown by request when solving challenge', function(done) {
    var jsChallengePage = helper.getFixture('js_challenge_21_05_2015.html'),
        response = helper.fakeResponseObject(503, headers, jsChallengePage, url),
        connectionError = {error: 'ECONNRESET'},
        stubbed;

    // Cloudflare is enabled for site. It returns a page with js challenge
    stubbed = sandbox.stub(requestDefault, 'get')
      .onCall(0)
      .callsArgWith(1, null, response, jsChallengePage);

    stubbed
      .onCall(1)
      .callsArgWith(1, connectionError);

    cloudscraper.get(url, function(error) {
      expect(error).to.be.eql({errorType: 0, error: connectionError}); // errorType 0, connection eror for example
      done();
    }, headers);

    this.clock.tick(7000); // tick the timeout
  });

  it('should properly handle a case when after a challenge another one is returned', function(done) {
    var jsChallengePage = helper.getFixture('js_challenge_09_06_2016.html');
    var response = helper.fakeResponseObject(503, headers, jsChallengePage, url);
    var stubbed;

    var pageWithCaptchaResponse = { statusCode: 200 };
    // Cloudflare is enabled for site. It returns a page with js challenge
    stubbed = sandbox.stub(requestDefault, 'get')
      .withArgs(helper.requestParams({url: url, headers: headers}))
      .callsArgWith(1, null, response, jsChallengePage);

    // Second call to request.get returns recaptcha
    stubbed.withArgs({
      method: 'GET',
      url: 'http://example-site.dev/cdn-cgi/l/chk_jschl',
      qs: sinon.match.any,
      headers: sinon.match.any,
      encoding: null,
      realEncoding: 'utf8',
      followAllRedirects: true,
      challengesToSolve: 2
    })
    .callsArgWith(1, null, pageWithCaptchaResponse, captchaPage);

    cloudscraper.get(url, function(error, body, response) {
      expect(error).to.be.eql({errorType: 1}); // errorType 1, means captcha is served
      expect(response).to.be.eql(captchaPage);
      done();
    }, headers);

    this.clock.tick(7000); // tick the timeout
  });
});
