var helper       = require('../spec_helper'),
    request      = require('request');

describe('Cloudscraper', function() {
  var sandbox,
      url               = 'http://example-site.dev/path/',
      captchaPage       = helper.getFixture('captcha.html'),
      accessDenied      = helper.getFixture('access_denied.html'),
      invalidChallenge  = helper.getFixture('invalid_js_challenge.html'),
      headers           = {'User-Agent': 'Chrome'},

      // Since request.defaults returns new wrapper, create one global instance and then stub it in beforeEach
      requestDefault  = request.defaults({jar: true}),
      cloudscraper;

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
      .withArgs({method: 'GET', url: url, headers: headers, encoding: null, realEncoding: 'utf8'})
      .callsArgWith(1, fakeError, response, '');

    cloudscraper.get(url, function(error) {
      expect(error).to.be.eql({errorType: 0, error: fakeError}); // errorType 0, means it is some kind of system error
      done();
    }, headers);

  });

  it('should return error if captcha is served by cloudflare', function(done){
    var response = { statusCode: 503 };

    sandbox.stub(requestDefault, 'get')
      .withArgs({method: 'GET', url: url, headers: headers, encoding: null, realEncoding: 'utf8'})
      .callsArgWith(1, null, response, captchaPage);

    cloudscraper.get(url, function(error, body) {
      expect(error).to.be.eql({errorType: 1}); // errorType 1, means captcha is served
      expect(body).to.be.eql(captchaPage);
      done();
    }, headers);
  });

  it('should return error if cloudflare returned some inner error', function(done){
    //https://support.cloudflare.com/hc/en-us/sections/200038216-CloudFlare-Error-Messages error codes: 1012, 1011, 1002, 1000, 1004, 1010, 1006, 1007, 1008
    var response = { statusCode: 500 };

    sandbox.stub(requestDefault, 'get')
      .withArgs({method:'GET', url: url, headers: headers, encoding: null, realEncoding: 'utf8'})
      .callsArgWith(1, null, response, accessDenied);

    cloudscraper.get(url, function(error, body) {
      expect(error).to.be.eql({errorType: 2, error: 1006}); // errorType 2, means inner cloudflare error
      expect(body).to.be.eql(accessDenied);
      done();
    }, headers);
  });

  it('should return error if body is undefined', function(done){
    //https://support.cloudflare.com/hc/en-us/sections/200038216-CloudFlare-Error-Messages error codes: 1012, 1011, 1002, 1000, 1004, 1010, 1006, 1007, 1008
    var response = { statusCode: 500 };

    sandbox.stub(requestDefault, 'get')
      .withArgs({method:'GET', url: url, headers: headers, encoding: null, realEncoding: 'utf8'})
      .callsArgWith(1, null, response, undefined);

    cloudscraper.get(url, function(error, body) {
      expect(error).to.be.eql({errorType: 0, error: null}); // errorType 2, means inner cloudflare error
      expect(body).to.be.eql(undefined);
      done();
    }, headers);
  });

  it('should return error if challenge page failed to be parsed', function(done) {
    var response = helper.fakeResponseObject(200, headers, invalidChallenge, url);
    sandbox.stub(requestDefault, 'get')
      .withArgs({method: 'GET', url: url, headers: headers, encoding: null, realEncoding: 'utf8'})
      .callsArgWith(1, null, response, invalidChallenge);

    cloudscraper.get(url, function(error, body) {
      expect(error.errorType).to.be.eql(3); // errorType 3, means parsing failed
      expect(body).to.be.eql(invalidChallenge);
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
      .withArgs({method: 'GET', url: url, headers: headers, encoding: null, realEncoding: 'utf8'})
      .callsArgWith(1, null, response, jsChallengePage);

    // Second call to request.get returns recaptcha
    stubbed.withArgs({
      method: 'GET',
      url: 'http://example-site.dev/cdn-cgi/l/chk_jschl',
      qs: sinon.match.any,
      headers: sinon.match.any,
      encoding: null,
      realEncoding: 'utf8'
    })
    .callsArgWith(1, null, pageWithCaptchaResponse, captchaPage);

    cloudscraper.get(url, function(error, response, body) {
      expect(error).to.be.eql({errorType: 1}); // errorType 1, means captcha is served
      expect(body).to.be.eql(captchaPage);
      done();
    }, headers);

    this.clock.tick(7000); // tick the timeout
  });
});
