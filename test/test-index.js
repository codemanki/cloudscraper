'use strict';

var cloudscraper = require('../index');
var request      = require('request-promise');
var helper       = require('./helper');

var sinon   = require('sinon');
var expect  = require('chai').expect;

describe('Cloudscraper', function() {
  var requestedPage   = helper.getFixture('requested_page.html');
  var uri             = helper.defaultParams.uri;
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

  it('should return requested page, if cloudflare is disabled for page', function(done) {
    var onlyResponse = helper.fakeResponse({
      statusCode: 200,
      body: requestedPage
    });
    
    Request.callsFake(helper.fakeRequest({ response: onlyResponse }));

    cloudscraper.get(uri, function(error, response, body) {
      expect(error).to.be.null;

      expect(Request).to.be.calledOnce;
      expect(Request.firstCall).to.be.calledWithExactly(helper.defaultParams);

      expect(response).to.be.equal(onlyResponse);
      expect(body).to.be.equal(onlyResponse.body);
      done();
    });

  });

  it('should not trigger any error if recaptcha is present in page not protected by CF', function(done) {
    var onlyResponse = helper.fakeResponse({
      statusCode: 200,
      body: helper.getFixture('page_with_recaptcha.html')
    });

    Request.callsFake(helper.fakeRequest({ response: onlyResponse }));

    cloudscraper.get(uri, function(error, response, body) {
      expect(error).to.be.null;

      expect(Request).to.be.calledOnce;
      expect(Request.firstCall).to.be.calledWithExactly(helper.defaultParams);

      expect(response).to.be.equal(onlyResponse);
      expect(body).to.be.equal(onlyResponse.body);
      done();
    });

  });

  it('should resolve challenge (version as on 21.05.2015) and then return page', function(done) {
    // Cloudflare is enabled for site. It returns a page with js challenge
    var firstResponse = helper.fakeResponse({
      statusCode: 503,
      body: helper.getFixture('js_challenge_21_05_2015.html')
    });

    Request.onFirstCall()
        .callsFake(helper.fakeRequest({ response: firstResponse }));

    var secondParams = helper.extendParams({
      uri: 'http://example-site.dev/cdn-cgi/l/chk_jschl',
      qs: {
        'jschl_vc': '89cdff5eaa25923e0f26e29e5195dce9',
        // 633 is a answer to cloudflare's js challenge in this particular case
        'jschl_answer': 633 + 'example-site.dev'.length,
        'pass': '1432194174.495-8TSfc235EQ'
      },
      headers: {
        'Referer': 'http://example-site.dev/path/'
      },
      challengesToSolve: 2
    });

    // Second call to Request will have challenge solution
    // It should contain uri, answer, headers with Referer
    var secondResponse = helper.fakeResponse({ body: requestedPage });

    Request.onSecondCall()// Cloudflare is enabled for site. It returns a page with js challenge
        .callsFake(helper.fakeRequest({ response: secondResponse}));

    cloudscraper.get(uri, function(error, response, body) {
      expect(error).to.be.null;

      expect(Request).to.be.calledTwice;
      expect(Request.firstCall).to.be.calledWithExactly(helper.defaultParams);
      expect(Request.secondCall).to.be.calledWithExactly(secondParams);

      expect(response).to.be.equal(secondResponse);
      expect(body).to.be.equal(secondResponse.body);
      done();
    });

    // tick the timeout
    this.clock.tick(7000);
  });

  it('should resolve challenge (version as on 09.06.2016) and then return page', function(done) {
    // Cloudflare is enabled for site. It returns a page with js challenge
    var firstResponse = helper.fakeResponse({
      statusCode: 503,
      body: helper.getFixture('js_challenge_09_06_2016.html')
    });

    Request.onFirstCall()
        .callsFake(helper.fakeRequest({ response: firstResponse }));

    var secondParams = helper.extendParams({
      uri: 'http://example-site.dev/cdn-cgi/l/chk_jschl',
      qs: {
        'jschl_vc': '346b959db0cfa38f9938acc11d6e1e6e',
        // 6632 is a answer to cloudflares js challenge in this particular case
        'jschl_answer': 6632 + 'example-site.dev'.length,
        'pass': '1465488330.6-N/NbGTg+IM'
      },
      headers: {
        'Referer': 'http://example-site.dev/path/'
      },
      challengesToSolve: 2
    });

    // Second call to Request will have challenge solution
    // It should contain uri, answer, headers with Referer
    var secondResponse = helper.fakeResponse({ body: requestedPage });

    Request.onSecondCall()
        .callsFake(helper.fakeRequest({ response: secondResponse }));

    cloudscraper.get(uri, function(error, response, body) {
        expect(error).to.be.null;

        expect(Request).to.be.called;
        expect(Request.firstCall).to.be.calledWithExactly(helper.defaultParams);
        expect(Request).to.be.calledTwice;
        expect(Request.secondCall).to.be.calledWithExactly(secondParams);

        expect(response).to.be.equal(secondResponse);
        expect(body).to.be.equal(secondResponse.body);
        done();
    });

    this.clock.tick(7000); // tick the timeout
  });

  it('should resolve 2 consequent challenges', function(done) {
    // First call and CF returns a challenge
    var firstResponse = helper.fakeResponse({
      statusCode: 503,
      body: helper.getFixture('js_challenge_03_12_2018_1.html')
    });

    Request.onFirstCall()
        .callsFake(helper.fakeRequest({ response: firstResponse }));

    var secondParams = helper.extendParams({
      uri: 'http://example-site.dev/cdn-cgi/l/chk_jschl',
      qs: {
        'jschl_vc': '427c2b1cd4fba29608ee81b200e94bfa',
        'jschl_answer': -5.33265406 + 'example-site.dev'.length, // -5.33265406 is a answer to cloudflares js challenge in this particular case
        'pass': '1543827239.915-44n9IE20mS'
      },
      headers: {
        'Referer': 'http://example-site.dev/path/'
      },
      challengesToSolve: 2
    });

    // We submit a solution to the first challenge, but CF decided to give us a second one
    var secondResponse = helper.fakeResponse({
      statusCode: 503,
      body: helper.getFixture('js_challenge_03_12_2018_2.html')
    });

    Request.onSecondCall()
        .callsFake(helper.fakeRequest({ response: secondResponse }));

    var thirdParams = helper.extendParams({
      uri: 'http://example-site.dev/cdn-cgi/l/chk_jschl',
      qs: {
        'jschl_vc': 'a41fee3a9f041fea01f0cbf3e8e4d29b',
        // 1.9145049856 is a answer to cloudflares js challenge in this particular case
        'jschl_answer': -1.9145049856 + 'example-site.dev'.length,
        'pass': '1543827246.024-hvxyNA3rOg'
      },
      headers: {
        'Referer': 'http://example-site.dev/path/'
      },
      challengesToSolve: 1
    });

    var thirdResponse = helper.fakeResponse({ body: requestedPage });

    // We submit a solution to the second challenge and CF returns requested page
    Request.onThirdCall()
        .callsFake(helper.fakeRequest({ response: thirdResponse }));

    cloudscraper.get(uri, function(error, response, body) {
      expect(error).to.be.null;

      expect(Request).to.be.calledThrice;
      expect(Request.firstCall).to.be.calledWithExactly(helper.defaultParams);
      expect(Request.secondCall).to.be.calledWithExactly(secondParams);
      expect(Request.thirdCall).to.be.calledWithExactly(thirdParams);

      expect(response).to.be.equal(thirdResponse);
      expect(body).to.be.equal(thirdResponse.body);
      done();
    });

    this.clock.tick(14000); // tick the timeout
  });

  it('should make post request with formData', function(done) {
    var formData = { some: 'data' };

    var firstParams = helper.extendParams({
      method: 'POST',
      formData: formData
    });
    // Stub first call, which request makes to page. It should return requested page
    var onlyResponse = helper.fakeResponse({ body: requestedPage });

    Request.callsFake(helper.fakeRequest({ response: onlyResponse }));

    var options = { uri: uri, formData: formData };

    cloudscraper.post(options, function(error, response, body) {
      expect(error).to.be.null;

      expect(Request).to.be.calledOnce;
      expect(Request.firstCall).to.be.calledWithExactly(firstParams);

      expect(response).to.be.equal(onlyResponse);
      expect(body).to.be.equal(onlyResponse.body);
      done();
    });
  });

  it('should make delete request', function(done) {
    var firstParams = helper.extendParams({ method: 'DELETE' });
    // Stub first call, which request makes to page. It should return requested page
    var onlyResponse = helper.fakeResponse({ body: requestedPage });

    Request.callsFake(helper.fakeRequest({ response: onlyResponse }));

    cloudscraper.delete(uri, function(error, response, body) {
      expect(error).to.be.null;

      expect(Request).to.be.calledOnce;
      expect(Request.firstCall).to.be.calledWithExactly(firstParams);

      expect(response).to.be.equal(onlyResponse);
      expect(body).to.be.equal(onlyResponse.body);
      done();
    });
  });

  it('should return raw data when encoding is null', function(done) {
    var firstParams = helper.extendParams({ realEncoding: null });
    // Stub first call, which request makes to page. It should return requested page
    var onlyResponse = helper.fakeResponse({
      body: new Buffer('R0lGODlhDwAPAKECAAAAzMzM/////wAAACwAAAAADwAPAAACIISPeQHsrZ5ModrLlN48CXF8m2iQ3YmmKqVlRtW4MLwWACH+H09wdGltaXplZCBieSBVbGVhZCBTbWFydFNhdmVyIQAAOw==', 'base64')
    });

    Request.callsFake(helper.fakeRequest({ response: onlyResponse }));

    var options = { uri: uri, encoding: null };

    cloudscraper.get(options, function(error, response, body) {
      expect(error).to.be.null;

      expect(Request).to.be.calledOnce;
      expect(Request.firstCall).to.be.calledWithExactly(firstParams);

      expect(response).to.be.equal(onlyResponse);
      expect(body).to.be.equal(onlyResponse.body);
      done();
    });
  });

  it('should set the given cookie and then return page', function(done) {
    var firstResponse = helper.fakeResponse({
      body: helper.getFixture('js_challenge_cookie.html')
    });

    // Cloudflare is enabled for site.
    // It returns a redirecting page if a (session) cookie is unset.
    Request.onFirstCall()
        .callsFake(helper.fakeRequest({ response: firstResponse }));

    var secondParams = helper.extendParams({ challengesToSolve: 2 });
    var secondResponse = helper.fakeResponse({ body: requestedPage });

    // Only callback with the second response if the cookie string matches
    var matchCookie = sinon.match(function(params) {
      return params.jar.getCookieString(uri) === 'sucuri_cloudproxy_uuid_575ef0f62=16cc0aa4400d9c6961cce3ce380ce11a';
    });

    // Prevent a matching error if for some reason params.jar is missing or invalid.
    var matchParams = sinon.match.has('jar', sinon.match.object).and(matchCookie);

    Request.withArgs(matchParams)
        .callsFake(helper.fakeRequest({ response: secondResponse }));

    // We need to override cloudscraper's default jar for this test
    var options = { uri: uri, jar: helper.defaultParams.jar };

    cloudscraper.get(options, function(error, response, body) {
      expect(error).to.be.null;

      expect(Request).to.be.calledTwice;
      expect(Request.firstCall).to.be.calledWithExactly(helper.defaultParams);
      expect(Request.secondCall).to.be.calledWithExactly(secondParams);

      expect(response).to.be.equal(secondResponse);
      expect(body).to.be.equal(secondResponse.body);
      done();
    });
  });

  it('should define custom defaults function', function (done) {
    expect(cloudscraper.defaults).to.not.equal(request.defaults);

    var custom = cloudscraper.defaults({ challengesToSolve: 5 });
    expect(custom.defaults).to.equal(cloudscraper.defaults);
    done();
  });
});
