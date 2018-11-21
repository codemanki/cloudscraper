var helper       = require('../spec_helper'),
    request      = require('request');

describe('Cloudscraper', function() {
  var sandbox,
      url             = 'http://example-site.dev/path/',
      requestedPage   = helper.getFixture('requested_page.html'),
      headers         = {'User-Agent': 'Chrome'},

      // Since request.jar returns new cookie jar instance, create one global instance and then stub it in beforeEach
      jar             = request.jar(),
      // Since request.defaults returns new wrapper, create one global instance and then stub it in beforeEach
      requestDefault  = request.defaults({jar: jar}),
      cloudscraper;

  before(function() {
    helper.dropCache();
  });

  beforeEach(function () {
    sandbox = sinon.sandbox.create();
    sandbox.stub(request, 'jar').returns(jar);
    sandbox.stub(request, 'defaults').returns(requestDefault);
    cloudscraper = require('../../index');
    // since cloudflare requires timeout, the module relies on setTimeout. It should be proprely stubbed to avoid ut running for too long
    this.clock = sinon.useFakeTimers();
  });

  afterEach(function () {
    sandbox.restore();
    this.clock.restore();
  });

  it('should return requested page, if cloudflare is disabled for page', function(done) {
    var expectedResponse = { statusCode: 200 };

    // Stub first call, which request makes to page. It should return requested page
    sandbox.stub(requestDefault, 'get')
      .withArgs({method: 'GET', url: url, headers: headers, encoding: null, realEncoding: 'utf8'})
      .callsArgWith(1, null, expectedResponse, requestedPage);

    cloudscraper.get(url, function(error, response, body) {
      expect(error).to.be.null();
      expect(body).to.be.equal(requestedPage);
      expect(response).to.be.equal(expectedResponse);
      done();
    }, headers);

  });

  it('should not trigged any error if recaptcha is present in page not protected by CF', function(done) {
    var expectedResponse = { statusCode: 200 };
    var pageWithCaptcha = helper.getFixture('page_with_recaptcha.html');

    sandbox.stub(requestDefault, 'get')
      .withArgs({method: 'GET', url: url, headers: headers, encoding: null, realEncoding: 'utf8'})
      .callsArgWith(1, null, expectedResponse, pageWithCaptcha);

    cloudscraper.get(url, function(error, response, body) {
      expect(error).to.be.null();
      expect(body).to.be.equal(pageWithCaptcha);
      expect(response).to.be.equal(expectedResponse);
      done();
    }, headers);

  });

  it('should resolve challenge (version as on 21.05.2015) and then return page', function(done) {
    var jsChallengePage = helper.getFixture('js_challenge_21_05_2015.html'),
        response = helper.fakeResponseObject(503, headers, jsChallengePage, url),
        stubbed;

    // Cloudflare is enabled for site. It returns a page with js challenge
    stubbed = sandbox.stub(requestDefault, 'get')
      .withArgs({method: 'GET', url: url, headers: headers, encoding: null, realEncoding: 'utf8'})
      .callsArgWith(1, null, response, jsChallengePage);

    // Second call to request.get will have challenge solution
    // It should contain url, answer, headers with Referer
    stubbed.withArgs({
      method: 'GET',
      url: 'http://example-site.dev/cdn-cgi/l/chk_jschl',
      qs: {
        'jschl_vc': '89cdff5eaa25923e0f26e29e5195dce9',
        'jschl_answer': 633 + 'example-site.dev'.length, // 633 is a answer to cloudflares js challenge in this particular case
        'pass': '1432194174.495-8TSfc235EQ'
      },
      headers: {
        'User-Agent': 'Chrome',
        'Referer': 'http://example-site.dev/path/',
        'Cache-Control': 'private',
        'Accept': 'application/xml,application/xhtml+xml,text/html;q=0.9, text/plain;q=0.8,image/png,*/*;q=0.5'
      },
      encoding: null,
      realEncoding: 'utf8'
    })
    .callsArgWith(1, null, response, requestedPage);

    cloudscraper.get(url, function(error, response, body) {
      expect(error).to.be.null();
      expect(body).to.be.equal(requestedPage);
      expect(response).to.be.equal(response);
      done();
    }, headers);

    this.clock.tick(7000); // tick the timeout
  });

  it('should resolve challenge (version as on 09.06.2016) and then return page', function(done) {
    var jsChallengePage = helper.getFixture('js_challenge_09_06_2016.html'),
        response = helper.fakeResponseObject(503, headers, jsChallengePage, url),
        stubbed;

    // Cloudflare is enabled for site. It returns a page with js challenge
    stubbed = sandbox.stub(requestDefault, 'get')
      .withArgs({method: 'GET', url: url, headers: headers, encoding: null, realEncoding: 'utf8'})
      .callsArgWith(1, null, response, jsChallengePage);

    // Second call to request.get will have challenge solution
    // It should contain url, answer, headers with Referer
    stubbed.withArgs({
      method: 'GET',
      url: 'http://example-site.dev/cdn-cgi/l/chk_jschl',
      qs: {
        'jschl_vc': '346b959db0cfa38f9938acc11d6e1e6e',
        'jschl_answer': 6632 + 'example-site.dev'.length, // 6632 is a answer to cloudflares js challenge in this particular case
        'pass': '1465488330.6-N/NbGTg+IM'
      },
      headers: {
        'User-Agent': 'Chrome',
        'Referer': 'http://example-site.dev/path/',
        'Cache-Control': 'private',
        'Accept': 'application/xml,application/xhtml+xml,text/html;q=0.9, text/plain;q=0.8,image/png,*/*;q=0.5'
      },
      encoding: null,
      realEncoding: 'utf8'
    })
    .callsArgWith(1, null, response, requestedPage);

    cloudscraper.get(url, function(error, response, body) {
      expect(error).to.be.null();
      expect(body).to.be.equal(requestedPage);
      expect(response).to.be.equal(response);
      done();
    }, headers);

    this.clock.tick(7000); // tick the timeout
  });

  it('should make post request with body as string', function(done) {
    var expectedResponse = { statusCode: 200 },
        body = 'form-data-body',
        postHeaders = headers;

    postHeaders['Content-Type'] = 'application/x-www-form-urlencoded; charset=UTF-8';
    postHeaders['Content-Length'] = body.length;


    // Stub first call, which request makes to page. It should return requested page
    sandbox.stub(requestDefault, 'post')
      .withArgs({method: 'POST', url: url, headers: postHeaders, body: body, encoding: null, realEncoding: 'utf8'})
      .callsArgWith(1, null, expectedResponse, requestedPage);

    cloudscraper.post(url, body, function(error, response, body) {
      expect(error).to.be.null();
      expect(body).to.be.equal(requestedPage);
      expect(response).to.be.equal(expectedResponse);
      done();
    }, headers);
  });

  it('should make post request with body as object', function(done) {
    var expectedResponse = { statusCode: 200 },
        rawBody = {a: '1', b: 2},
        encodedBody = 'a=1&b=2',
        postHeaders = headers;

    postHeaders['Content-Type'] = 'application/x-www-form-urlencoded; charset=UTF-8';
    postHeaders['Content-Length'] = encodedBody.length;

    // Stub first call, which request makes to page. It should return requested page
    sandbox.stub(requestDefault, 'post')
      .withArgs({method: 'POST', url: url, headers: postHeaders, body: encodedBody, encoding: null, realEncoding: 'utf8'})
      .callsArgWith(1, null, expectedResponse, requestedPage);

    cloudscraper.post(url, rawBody, function(error, response, body) {
      expect(error).to.be.null();
      expect(body).to.be.equal(requestedPage);
      expect(response).to.be.equal(expectedResponse);
      done();
    }, headers);
  });

  it('should return raw data when encoding is null', function(done) {
    var expectedResponse = { statusCode: 200 };
    var requestedData = new Buffer('R0lGODlhDwAPAKECAAAAzMzM/////wAAACwAAAAADwAPAAACIISPeQHsrZ5ModrLlN48CXF8m2iQ3YmmKqVlRtW4MLwWACH+H09wdGltaXplZCBieSBVbGVhZCBTbWFydFNhdmVyIQAAOw==', 'base64');

    sandbox.stub(requestDefault, 'get')
      .withArgs({method: 'GET', url: url, headers: headers, encoding: null, realEncoding: null})
      .callsArgWith(1, null, expectedResponse, requestedData);

    var options = {
      method: 'GET',
      url: url,
      encoding: null,
      headers: headers
    };

    cloudscraper.request(options, function(error, response, body) {
      expect(error).to.be.null();
      expect(response).to.be.equal(expectedResponse);
      expect(body).to.be.equal(requestedData);
      done();
    });
  });

  it('should set the given cookie and then return page', function(done) {
    var jsChallengePage = helper.getFixture('js_challenge_cookie.html'),
        response = helper.fakeResponseObject(200, headers, jsChallengePage, url),
        stubbed;

    // Cloudflare is enabled for site.
    // It returns a redirecting page if a (session) cookie is unset.
    sandbox.stub(requestDefault, 'get', function fakeGet(options, cb) {
      if (options.url === url) {
        var cookieString = jar.getCookieString(url);
        if (cookieString === 'sucuri_cloudproxy_uuid_575ef0f62=16cc0aa4400d9c6961cce3ce380ce11a') {
          cb(null, response, requestedPage);
        } else {
          cb(null, response, jsChallengePage);
        }
      } else {
        cb(new Error("Unexpected request"));
      }
    });

    cloudscraper.get(url, function(error, response, body) {
      expect(error).to.be.null();
      expect(body).to.be.equal(requestedPage);
      done();
    }, headers);
  });
});
