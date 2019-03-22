/* eslint-disable no-unused-expressions */
/* eslint-env node, mocha */
'use strict';

var cloudscraper = require('../index');
var request      = require('request-promise');
var helper       = require('./helper');
var querystring  = require('querystring');

var sinon   = require('sinon');
var expect  = require('chai').expect;

describe('Cloudscraper', function () {
  var sandbox;
  var Request;
  var uri;

  var requestedPage = helper.getFixture('requested_page.html');

  before(function (done) {
    helper.listen(function () {
      uri = helper.resolve('/test');

      // Speed up tests
      cloudscraper.defaultParams.cloudflareTimeout = 1;
      done();
    });
  });

  after(function () {
    helper.server.close();
  });

  beforeEach(function () {
    // Prepare stubbed Request
    sandbox = sinon.createSandbox();
    Request = sandbox.spy(request, 'Request');
  });

  afterEach(function () {
    helper.reset();
    sandbox.restore();
  });

  it('should return requested page, in the specified encoding', function (done) {
    var expectedBody = Buffer.from(requestedPage).toString('utf16le');

    helper.router.get('/test', function (req, res) {
      res.send(requestedPage);
    });

    var expectedParams = helper.extendParams({ realEncoding: 'utf16le' });
    var options = { uri: uri, encoding: 'utf16le' };

    var promise = cloudscraper.get(options, function (error, response, body) {
      expect(error).to.be.null;
      expect(Request).to.be.calledOnceWithExactly(expectedParams);
      expect(body).to.be.equal(expectedBody);
    });

    expect(promise).to.eventually.equal(expectedBody).and.notify(done);
  });

  it('should return json', function (done) {
    var expectedBody = { a: 'test' };

    helper.router.get('/test', function (req, res) {
      res.send(expectedBody);
    });

    var expectedParams = helper.extendParams({ json: true });
    var options = { uri: uri, json: true };

    var promise = cloudscraper.get(options, function (error, response, body) {
      expect(error).to.be.null;
      expect(Request).to.be.calledOnceWithExactly(expectedParams);
      expect(body).to.be.eql(expectedBody);
    });

    expect(promise).to.eventually.eql(expectedBody).and.notify(done);
  });

  it('should return requested data, if cloudflare is disabled for page', function (done) {
    helper.router.get('/test', function (req, res) {
      res.status(500).send('xyz');
    });

    // Disable status code checking
    var expectedParams = helper.extendParams({ simple: false });
    var options = { uri: uri, simple: false };

    var promise = cloudscraper.get(options, function (error, response, body) {
      expect(error).to.be.null;
      expect(Request).to.be.calledOnceWithExactly(expectedParams);
      expect(body).to.be.equal('xyz');
    });

    expect(promise).to.eventually.equal('xyz').and.notify(done);
  });

  it('should return requested page, if cloudflare is disabled for page', function (done) {
    helper.router.get('/test', function (req, res) {
      res.send(requestedPage);
    });

    var promise = cloudscraper.get(uri, function (error, response, body) {
      expect(error).to.be.null;
      expect(Request).to.be.calledOnceWithExactly(helper.defaultParams);
      expect(body).to.be.equal(requestedPage);
    });

    expect(promise).to.eventually.equal(requestedPage).and.notify(done);
  });

  it('should not trigger any error if recaptcha is present in page not protected by CF', function (done) {
    var expectedBody = helper.getFixture('page_with_recaptcha.html');

    helper.router.get('/test', function (req, res) {
      res.send(expectedBody);
    });

    var promise = cloudscraper.get(uri, function (error, response, body) {
      expect(error).to.be.null;
      expect(Request).to.be.calledOnceWithExactly(helper.defaultParams);
      expect(body).to.be.equal(expectedBody);
    });

    expect(promise).to.eventually.equal(expectedBody).and.notify(done);
  });

  it('should resolve challenge (version as on 21.05.2015) and then return page', function (done) {
    helper.router
      .get('/test', function (req, res) {
        res.sendChallenge('js_challenge_21_05_2015.html');
      })
      .get('/cdn-cgi/l/chk_jschl', function (req, res) {
        res.send(requestedPage);
      });

    // Second call to Request will have challenge solution
    var expectedParams = helper.extendParams({
      uri: helper.resolve('/cdn-cgi/l/chk_jschl'),
      qs: {
        'jschl_vc': '89cdff5eaa25923e0f26e29e5195dce9',
        // 633 is a answer to cloudflare's JS challenge in this particular case
        'jschl_answer': 633 + helper.uri.hostname.length,
        'pass': '1432194174.495-8TSfc235EQ'
      },
      headers: {
        'Referer': uri
      },
      challengesToSolve: 2
    });

    var promise = cloudscraper.get(uri, function (error, response, body) {
      expect(error).to.be.null;

      expect(Request).to.be.calledTwice;
      expect(Request.firstCall).to.be.calledWithExactly(helper.defaultParams);
      expect(Request.secondCall).to.be.calledWithExactly(expectedParams);

      expect(body).to.be.equal(requestedPage);
    });

    expect(promise).to.eventually.equal(requestedPage).and.notify(done);
  });

  it('should resolve challenge (version as on 09.06.2016) and then return page', function (done) {
    // Cloudflare is enabled for site. It returns a page with JS challenge
    helper.router
      .get('/test', function (req, res) {
        res.sendChallenge('js_challenge_09_06_2016.html');
      })
      .get('/cdn-cgi/l/chk_jschl', function (req, res) {
        res.send(requestedPage);
      });

    // Second call to Request will have challenge solution
    var expectedParams = helper.extendParams({
      uri: helper.resolve('/cdn-cgi/l/chk_jschl'),
      qs: {
        'jschl_vc': '346b959db0cfa38f9938acc11d6e1e6e',
        // 6632 is a answer to Cloudflare's JS challenge in this particular case
        'jschl_answer': 6632 + helper.uri.hostname.length,
        'pass': '1465488330.6-N/NbGTg+IM'
      },
      headers: {
        'Referer': uri
      },
      challengesToSolve: 2
    });

    var promise = cloudscraper.get(uri, function (error, response, body) {
      expect(error).to.be.null;

      expect(Request).to.be.calledTwice;
      expect(Request.firstCall).to.be.calledWithExactly(helper.defaultParams);
      expect(Request.secondCall).to.be.calledWithExactly(expectedParams);

      expect(body).to.be.equal(requestedPage);
    });

    expect(promise).to.eventually.equal(requestedPage).and.notify(done);
  });

  it('should resolve challenge (version as on 13.03.2019) and then return page', function (done) {
    // Cloudflare is enabled for site. It returns a page with JS challenge
    helper.router
      .get('/test', function (req, res) {
        res.sendChallenge('js_challenge_13_03_2019.html');
      })
      .get('/cdn-cgi/l/chk_jschl', function (req, res) {
        res.send(requestedPage);
      });

    // Second call to Request will have challenge solution
    var expectedParams = helper.extendParams({
      uri: helper.resolve('/cdn-cgi/l/chk_jschl'),
      qs: {
        'jschl_vc': '18e0eb4e7cc844880cd9822df9d8546e',
        // 6632 is a answer to Cloudflare's JS challenge in this particular case
        'jschl_answer': (22.587957833300003 + helper.uri.hostname.length).toFixed(10),
        'pass': '1552499230.142-MOc6blXorq'
      },
      headers: {
        'Referer': uri
      },
      challengesToSolve: 2
    });

    var promise = cloudscraper.get(uri, function (error, response, body) {
      expect(error).to.be.null;

      expect(Request).to.be.calledTwice;
      expect(Request.firstCall).to.be.calledWithExactly(helper.defaultParams);
      expect(Request.secondCall).to.be.calledWithExactly(expectedParams);

      expect(body).to.be.equal(requestedPage);
    });

    expect(promise).to.eventually.equal(requestedPage).and.notify(done);
  });

  it('should resolve 2 consequent challenges', function (done) {
    // Cloudflare is enabled for site. It returns a page with JS challenge
    var additionalChallenge = true;

    helper.router
      .get('/test', function (req, res) {
        res.sendChallenge('js_challenge_03_12_2018_1.html');
      })
      .get('/cdn-cgi/l/chk_jschl', function (req, res) {
        if (additionalChallenge) {
          additionalChallenge = false;
          // We submit a solution to the first challenge, but CF decided to give us a second one
          res.sendChallenge('js_challenge_03_12_2018_2.html');
        } else {
          res.send(requestedPage);
        }
      });

    var firstParams  = helper.extendParams({ resolveWithFullResponse: true });
    var secondParams = helper.extendParams({
      resolveWithFullResponse: true,
      uri: helper.resolve('/cdn-cgi/l/chk_jschl'),
      qs: {
        'jschl_vc': '427c2b1cd4fba29608ee81b200e94bfa',
        // -5.33265406 is a answer to Cloudflare's JS challenge in this particular case
        'jschl_answer': -5.33265406 + helper.uri.hostname.length,
        'pass': '1543827239.915-44n9IE20mS'
      },
      headers: {
        'Referer': uri
      },
      challengesToSolve: 2
    });

    var thirdParams = helper.extendParams({
      resolveWithFullResponse: true,
      uri: helper.resolve('/cdn-cgi/l/chk_jschl'),
      qs: {
        'jschl_vc': 'a41fee3a9f041fea01f0cbf3e8e4d29b',
        // 1.9145049856 is a answer to Cloudflare's JS challenge in this particular case
        'jschl_answer': -1.9145049856 + helper.uri.hostname.length,
        'pass': '1543827246.024-hvxyNA3rOg'
      },
      headers: {
        'Referer': helper.resolve('/cdn-cgi/l/chk_jschl?' +
          querystring.stringify(secondParams.qs))
      },
      challengesToSolve: 1
    });

    var options = { uri: uri, resolveWithFullResponse: true };

    var promise = cloudscraper.get(options, function (error, response, body) {
      expect(error).to.be.null;

      expect(Request).to.be.calledThrice;
      expect(Request.firstCall).to.be.calledWithExactly(firstParams);
      expect(Request.secondCall).to.be.calledWithExactly(secondParams);
      expect(Request.thirdCall).to.be.calledWithExactly(thirdParams);

      expect(body).to.be.equal(requestedPage);
    });

    expect(promise).to.eventually.haveOwnProperty('body', requestedPage).and.notify(done);
  });

  it('should make post request with formData', function (done) {
    helper.router.post('/test', function (req, res) {
      res.send(requestedPage);
    });

    var formData = { some: 'data' };

    var expectedParams = helper.extendParams({
      method: 'POST',
      formData: formData
    });

    var options = { uri: uri, formData: formData };

    var promise = cloudscraper.post(options, function (error, response, body) {
      expect(error).to.be.null;
      expect(Request).to.be.calledOnceWithExactly(expectedParams);
      expect(body).to.be.equal(requestedPage);
    });

    expect(promise).to.eventually.equal(requestedPage).and.notify(done);
  });

  it('should make delete request', function (done) {
    helper.router.delete('/test', function (req, res) {
      res.send(requestedPage);
    });

    var expectedParams = helper.extendParams({ method: 'DELETE' });

    var promise = cloudscraper.delete(uri, function (error, response, body) {
      expect(error).to.be.null;
      expect(Request).to.be.calledOnceWithExactly(expectedParams);
      expect(body).to.be.equal(requestedPage);
    });

    expect(promise).to.eventually.equal(requestedPage).and.notify(done);
  });

  it('should return raw data when encoding is null', function (done) {
    helper.router.get('/test', function (req, res) {
      res.send(requestedPage);
    });

    var expectedBody = Buffer.from(requestedPage, 'utf8');
    var expectedParams = helper.extendParams({ realEncoding: null });

    var options = { uri: uri, encoding: null };

    var promise = cloudscraper.get(options, function (error, response, body) {
      expect(error).to.be.null;
      expect(Request).to.be.calledOnceWithExactly(expectedParams);
      expect(body).to.be.eql(expectedBody);
    });

    expect(promise).to.eventually.eql(expectedBody).and.notify(done);
  });

  it('should set the given cookie and then return page', function (done) {
    helper.router.get('/test', function (req, res) {
      if (req.headers.cookie === 'sucuri_cloudproxy_uuid_575ef0f62=16cc0aa4400d9c6961cce3ce380ce11a') {
        res.send(requestedPage);
      } else {
        // It returns a redirecting page if a (session) cookie is unset.
        res.sendChallenge('js_challenge_cookie.html');
      }
    });

    var expectedParams = helper.extendParams({ challengesToSolve: 2 });

    // We need to override cloudscraper's default jar for this test
    var options = { uri: uri, jar: helper.defaultParams.jar };

    var promise = cloudscraper.get(options, function (error, response, body) {
      expect(error).to.be.null;

      expect(Request).to.be.calledTwice;
      expect(Request.firstCall).to.be.calledWithExactly(helper.defaultParams);
      expect(Request.secondCall).to.be.calledWithExactly(expectedParams);

      expect(body).to.be.equal(requestedPage);
    });

    expect(promise).to.eventually.equal(requestedPage).and.notify(done);
  });

  it('should not use proxy\'s uri', function (done) {
    helper.router
      .get('/test', function (req, res) {
        if (req.headers.host === 'example-site.dev') {
          res.sendChallenge('js_challenge_03_12_2018_1.html');
        }
      })
      .get('/cdn-cgi/l/chk_jschl', function (req, res) {
        if (req.headers.host === 'example-site.dev') {
          res.send(requestedPage);
        }
      });

    var firstParams  = helper.extendParams({
      proxy: helper.uri.href,
      uri: 'http://example-site.dev/test'
    });

    var secondParams = helper.extendParams({
      proxy: helper.uri.href,
      uri: 'http://example-site.dev/cdn-cgi/l/chk_jschl',
      qs: {
        'jschl_vc': '427c2b1cd4fba29608ee81b200e94bfa',
        // -5.33265406 is a answer to Cloudflare's JS challenge in this particular case
        'jschl_answer': -5.33265406 + 'example-site.dev'.length,
        'pass': '1543827239.915-44n9IE20mS'
      },
      headers: {
        'Referer': 'http://example-site.dev/test'
      },
      challengesToSolve: 2
    });

    var options = {
      proxy: helper.uri.href,
      uri: 'http://example-site.dev/test'
    };

    var promise = cloudscraper.get(options, function (error, response, body) {
      expect(error).to.be.null;

      expect(Request).to.be.calledTwice;
      expect(Request.firstCall).to.be.calledWithExactly(firstParams);
      expect(Request.secondCall).to.be.calledWithExactly(secondParams);

      expect(body).to.be.equal(requestedPage);
    });

    expect(promise).to.eventually.equal(requestedPage).and.notify(done);
  });

  it('should reuse the provided cookie jar', function (done) {
    helper.router.get('/test', function (req, res) {
      if (req.headers.cookie === 'sucuri_cloudproxy_uuid_575ef0f62=16cc0aa4400d9c6961cce3ce380ce11a') {
        res.send(requestedPage);
      } else {
        // It returns a redirecting page if a (session) cookie is unset.
        res.sendChallenge('js_challenge_cookie.html');
      }
    });

    var customJar = request.jar();

    var firstParams  = helper.extendParams({ jar: customJar });
    var secondParams = helper.extendParams({
      jar: customJar,
      challengesToSolve: 2
    });

    // We need to override cloudscraper's default jar for this test
    var options = { uri: uri, jar: customJar };

    customJar.setCookie('custom cookie', 'http://custom-site.dev/');

    cloudscraper.get(options, function (error, response, body) {
      expect(error).to.be.null;

      expect(Request).to.be.calledTwice;
      expect(Request.firstCall).to.be.calledWithExactly(firstParams);
      expect(Request.secondCall).to.be.calledWithExactly(secondParams);

      expect(body).to.be.equal(requestedPage);

      var customCookie = customJar.getCookieString('http://custom-site.dev/');
      expect(customCookie).to.equal('custom cookie');

      cloudscraper.get(options, function (error) {
        expect(error).to.be.null;

        expect(Request.thirdCall.args[0].jar).to.equal(customJar);
        customCookie = customJar.getCookieString('http://custom-site.dev/');
        expect(customCookie).to.equal('custom cookie');

        done();
      });
    });
  });

  it('should define custom defaults function', function (done) {
    expect(cloudscraper.defaults).to.not.equal(request.defaults);

    var custom = cloudscraper.defaults({ challengesToSolve: 5 });
    expect(custom.defaults).to.equal(cloudscraper.defaults);
    done();
  });

  it('should decode emails', function (done) {
    helper.router
      .get('/test', function (req, res) {
        res.sendChallenge('js_challenge_13_03_2019.html');
      })
      .get('/cdn-cgi/l/chk_jschl', function (req, res) {
        res.sendFixture('page_with_emails.html');
      });

    var cf = cloudscraper.defaults({ decodeEmails: true });

    var firstParams = helper.extendParams({ decodeEmails: true });

    var promise = cf.get(uri, function (error, response, body) {
      expect(error).to.be.null;

      expect(Request).to.be.calledTwice;
      expect(Request.firstCall).to.be.calledWithExactly(firstParams);

      expect(body).to.include('cloudscraper@example-site.dev');
    });

    expect(promise).to.eventually.include('cloudscraper@example-site.dev').and.notify(done);
  });

  it('should not error when using the baseUrl option', function (done) {
    helper.router
      .get('/test', function (req, res) {
        res.sendChallenge('js_challenge_13_03_2019.html');
      })
      .get('/cdn-cgi/l/chk_jschl', function (req, res) {
        res.send(requestedPage);
      });

    var cf = cloudscraper.defaults({ baseUrl: helper.uri.href });

    var firstParams = helper.extendParams({
      baseUrl: helper.uri.href,
      uri: '/test'
    });

    var promise = cf.get('/test', function (error, response, body) {
      expect(error).to.be.null;

      expect(Request).to.be.calledTwice;
      expect(Request.firstCall).to.be.calledWithExactly(firstParams);
      expect(Request.secondCall.args[0]).to.not.have.property('baseUrl');

      expect(body).to.be.equal(requestedPage);
    });

    expect(promise).to.eventually.equal(requestedPage).and.notify(done);
  });

  it('should use the provided cloudflare timeout', function (done) {
    helper.router
      .get('/test', function (req, res) {
        res.sendChallenge('js_challenge_03_12_2018_1.html');
      })
      .get('/cdn-cgi/l/chk_jschl', function (req, res) {
        res.send(requestedPage);
      });

    var expectedParams = helper.extendParams({ cloudflareTimeout: 50 });

    var start = Date.now();
    var options = { uri: uri, cloudflareTimeout: 50 };

    var promise = cloudscraper.get(options, function (error) {
      expect(error).to.be.null;
      expect(Request.firstCall).to.be.calledWithExactly(expectedParams);

      var elapsed = Date.now() - start;
      // Aiming to be within ~150ms of specified timeout
      expect(elapsed >= 50 && elapsed <= 200).to.be.ok;
    });

    expect(promise).to.eventually.equal(requestedPage).and.notify(done);
  });
});
