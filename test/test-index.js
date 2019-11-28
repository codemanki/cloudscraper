/* eslint-disable no-unused-expressions */
/* eslint-env node, mocha */
'use strict';

const cloudscraper = require('../index');
const request      = require('request-promise');
const helper       = require('./helper');
const brotli       = require('../lib/brotli');
const querystring  = require('querystring');

const sinon   = require('sinon');
const expect  = require('chai').expect;

describe('Cloudscraper', function () {
  let sandbox;
  let Request;
  let uri;

  const requestedPage = helper.getFixture('requested_page.html');

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
    const expectedBody = Buffer.from(requestedPage).toString('utf16le');

    helper.router.get('/test', function (req, res) {
      res.send(requestedPage);
    });

    const expectedParams = helper.extendParams({ realEncoding: 'utf16le' });
    const options = { uri: uri, encoding: 'utf16le' };

    const promise = cloudscraper.get(options, function (error, response, body) {
      expect(error).to.be.null;
      expect(Request).to.be.calledOnceWithExactly(expectedParams);
      expect(body).to.be.equal(expectedBody);
      expect(promise).to.eventually.equal(expectedBody).and.notify(done);
    });
  });

  it('should return parsed JSON', function (done) {
    const expectedBody = { a: 'test' };

    helper.router.get('/test', function (req, res) {
      res.send(expectedBody);
    });

    const expectedParams = helper.extendParams({ json: true });
    const options = { uri: uri, json: true };

    const promise = cloudscraper.get(options, function (error, response, body) {
      expect(error).to.be.null;
      expect(Request).to.be.calledOnceWithExactly(expectedParams);
      expect(body).to.be.eql(expectedBody);
      expect(promise).to.eventually.eql(expectedBody).and.notify(done);
    });
  });

  (brotli.isAvailable ? it : it.skip)('should decompress Brotli and return parsed JSON', function (done) {
    const expectedBody = { a: 'test' };

    const compressed = Buffer.from([
      0x8b, 0x05, 0x80, 0x7b, 0x22, 0x61, 0x22, 0x3a,
      0x22, 0x74, 0x65, 0x73, 0x74, 0x22, 0x7d, 0x03
    ]);

    helper.router.get('/test', function (req, res) {
      res.set('content-encoding', 'br');
      res.end(compressed, 'binary');
    });

    const expectedParams = helper.extendParams({ json: true });
    const options = { uri: uri, json: true };

    const promise = cloudscraper.get(options, function (error, response, body) {
      expect(error).to.be.null;
      expect(Request).to.be.calledOnceWithExactly(expectedParams);
      expect(body).to.be.eql(expectedBody);
      expect(promise).to.eventually.eql(expectedBody).and.notify(done);
    });
  });

  it('should return requested data, if cloudflare is disabled for page', function (done) {
    helper.router.get('/test', function (req, res) {
      res.status(500).send('xyz');
    });

    // Disable status code checking
    const expectedParams = helper.extendParams({ simple: false });
    const options = { uri: uri, simple: false };

    const promise = cloudscraper.get(options, function (error, response, body) {
      expect(error).to.be.null;
      expect(Request).to.be.calledOnceWithExactly(expectedParams);
      expect(body).to.be.equal('xyz');
      expect(promise).to.eventually.equal('xyz').and.notify(done);
    });
  });

  it('should return requested page, if cloudflare is disabled for page', function (done) {
    helper.router.get('/test', function (req, res) {
      res.send(requestedPage);
    });

    const promise = cloudscraper.get(uri, function (error, response, body) {
      expect(error).to.be.null;
      expect(Request).to.be.calledOnceWithExactly(helper.defaultParams);
      expect(body).to.be.equal(requestedPage);
      expect(promise).to.eventually.equal(requestedPage).and.notify(done);
    });
  });

  it('should not trigger any error if recaptcha is present in page not protected by CF', function (done) {
    const expectedBody = helper.getFixture('page_with_recaptcha.html');

    helper.router.get('/test', function (req, res) {
      res.send(expectedBody);
    });

    const promise = cloudscraper.get(uri, function (error, response, body) {
      expect(error).to.be.null;
      expect(Request).to.be.calledOnceWithExactly(helper.defaultParams);
      expect(body).to.be.equal(expectedBody);
      expect(promise).to.eventually.equal(expectedBody).and.notify(done);
    });
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
    const expectedParams = helper.extendParams({
      uri: helper.resolve('/cdn-cgi/l/chk_jschl'),
      qs: {
        jschl_vc: '89cdff5eaa25923e0f26e29e5195dce9',
        // 633 is a answer to cloudflare's JS challenge in this particular case
        jschl_answer: 633 + helper.uri.hostname.length,
        pass: '1432194174.495-8TSfc235EQ'
      },
      headers: {
        Referer: uri
      },
      challengesToSolve: 2
    });

    const promise = cloudscraper.get(uri, function (error, response, body) {
      expect(error).to.be.null;

      expect(Request).to.be.calledTwice;
      expect(Request.firstCall).to.be.calledWithExactly(helper.defaultParams);
      expect(Request.secondCall).to.be.calledWithExactly(expectedParams);

      expect(body).to.be.equal(requestedPage);
      expect(promise).to.eventually.equal(requestedPage).and.notify(done);
    });
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
    const expectedParams = helper.extendParams({
      uri: helper.resolve('/cdn-cgi/l/chk_jschl'),
      qs: {
        jschl_vc: '346b959db0cfa38f9938acc11d6e1e6e',
        // 6632 is a answer to Cloudflare's JS challenge in this particular case
        jschl_answer: 6632 + helper.uri.hostname.length,
        pass: '1465488330.6-N/NbGTg+IM'
      },
      headers: {
        Referer: uri
      },
      challengesToSolve: 2
    });

    const promise = cloudscraper.get(uri, function (error, response, body) {
      expect(error).to.be.null;

      expect(Request).to.be.calledTwice;
      expect(Request.firstCall).to.be.calledWithExactly(helper.defaultParams);
      expect(Request.secondCall).to.be.calledWithExactly(expectedParams);

      expect(body).to.be.equal(requestedPage);
      expect(promise).to.eventually.equal(requestedPage).and.notify(done);
    });
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
    const expectedParams = helper.extendParams({
      uri: helper.resolve('/cdn-cgi/l/chk_jschl'),
      qs: {
        jschl_vc: '18e0eb4e7cc844880cd9822df9d8546e',
        // 6632 is a answer to Cloudflare's JS challenge in this particular case
        jschl_answer: (22.587957833300003 + helper.uri.hostname.length).toFixed(10),
        pass: '1552499230.142-MOc6blXorq'
      },
      headers: {
        Referer: uri
      },
      challengesToSolve: 2
    });

    const promise = cloudscraper.get(uri, function (error, response, body) {
      expect(error).to.be.null;

      expect(Request).to.be.calledTwice;
      expect(Request.firstCall).to.be.calledWithExactly(helper.defaultParams);
      expect(Request.secondCall).to.be.calledWithExactly(expectedParams);

      expect(body).to.be.equal(requestedPage);
      expect(promise).to.eventually.equal(requestedPage).and.notify(done);
    });
  });

  it('should resolve challenge (version as on 21.03.2019) and then return page', function (done) {
    helper.router
      .get('/test', function (req, res) {
        res.sendChallenge('js_challenge_21_03_2019.html');
      })
      .get('/cdn-cgi/l/chk_jschl', function (req, res) {
        res.send(requestedPage);
      });

    // Second call to Request will have challenge solution
    const expectedParams = helper.extendParams({
      uri: helper.resolve('/cdn-cgi/l/chk_jschl'),
      qs: {
        s: '08ee9f79382c9f784ef868f239a0984261a28b2f-1553213547-1800-AXjMT2d0Sx0fifn2gHCBp7sjO3hmbH5Pab9lPE92HxBLetotfG2HQ0U8ioQ2CJwOMGV5pmmBmffUDmmyxIyCuRCBOxecZXzYCBZZReVFCTXgIlpXL8ZcztRhE9Bm3BNGfg==',
        jschl_vc: '56dea7618ea1879d5c357e2f36d8cc73',
        jschl_answer: String(4.0802397597999995 + helper.uri.hostname.length),
        pass: '1553213551.122-8cmVkvFy7Q'
      },
      headers: {
        Referer: uri
      },
      challengesToSolve: 2
    });

    const promise = cloudscraper.get(uri, function (error, response, body) {
      expect(error).to.be.null;

      expect(Request).to.be.calledTwice;
      expect(Request.firstCall).to.be.calledWithExactly(helper.defaultParams);
      expect(Request.secondCall).to.be.calledWithExactly(expectedParams);

      expect(body).to.be.equal(requestedPage);
      expect(promise).to.eventually.equal(requestedPage).and.notify(done);
    });
  });

  it('should resolve challenge (version as on 10.04.2019) and then return page', function (done) {
    helper.router
      .get('/test', function (req, res) {
        res.sendChallenge('js_challenge_10_04_2019.html');
      })
      .get('/cdn-cgi/l/chk_jschl', function (req, res) {
        res.send(requestedPage);
      });

    const expectedParams = helper.extendParams({
      uri: helper.resolve('/cdn-cgi/l/chk_jschl'),
      qs: {
        s: 'f3b4838af97b6cb02b3c8b1e0f149daf27dbee61-1555369946-1800-AakWW8TP/PRVIBQ2t2QmkJFEmb8TAmeIE7/GS7OUCF+d/7LncO0Zwye3YaCZyfhCfRyQogtebFuSWk2ANVV0pDSXqJ/q5qe0URcQQ2NNaGVMuPVrLh/OrUqD2QUPn0dWGA==',
        jschl_vc: '686d6bea02e6d172aa64f102a684228c',
        jschl_answer: String(9.8766929385 + helper.uri.hostname.length),
        pass: '1555369950.717-6S1r4kzOYK'
      },
      headers: {
        Referer: uri
      },
      challengesToSolve: 2
    });

    const promise = cloudscraper.get(uri, function (error, response, body) {
      expect(error).to.be.null;

      expect(Request).to.be.calledTwice;
      expect(Request.firstCall).to.be.calledWithExactly(helper.defaultParams);
      expect(Request.secondCall).to.be.calledWithExactly(expectedParams);

      expect(body).to.be.equal(requestedPage);
      expect(promise).to.eventually.equal(requestedPage).and.notify(done);
    });
  });

  it('should resolve challenge (version as on 28.11.2019) and then return page', function (done) {
    helper.router
      .get('/test', function (req, res) {
        res.sendChallenge('js_challenge_28_11_2019.html');
      })
      .post('/', function (req, res) {
        res.send(requestedPage);
      });

    const expectedParams = helper.extendParams({
      uri: helper.resolve('/?__cf_chl_jschl_tk__=xxxxx'),
      method: 'POST',
      form: {
        r: '9dbc5c7ec65cb42893f2fd063ca80a2185ad6b6b-1574931141',
        jschl_vc: '44a73ed828ddcd806a342f7c289cc438',
        jschl_answer: String(20.2553376255 + helper.uri.hostname.length),
        pass: '1574931145.541-UbeyT63kjo'
      },
      headers: {
        Referer: uri
      },
      challengesToSolve: 2
    });

    const promise = cloudscraper.get(uri, function (error, response, body) {
      expect(error).to.be.null;

      expect(Request).to.be.calledTwice;
      expect(Request.firstCall).to.be.calledWithExactly(helper.defaultParams);
      expect(Request.secondCall).to.be.calledWithExactly(expectedParams);

      expect(body).to.be.equal(requestedPage);
      expect(promise).to.eventually.equal(requestedPage).and.notify(done);
    });
  });

  it('should resolve 2 consequent challenges', function (done) {
    // Cloudflare is enabled for site. It returns a page with JS challenge
    let additionalChallenge = true;

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

    const firstParams  = helper.extendParams({ resolveWithFullResponse: true });
    const secondParams = helper.extendParams({
      resolveWithFullResponse: true,
      uri: helper.resolve('/cdn-cgi/l/chk_jschl'),
      qs: {
        jschl_vc: '427c2b1cd4fba29608ee81b200e94bfa',
        pass: '1543827239.915-44n9IE20mS',
        // -5.33265406 is a answer to Cloudflare's JS challenge in this particular case
        jschl_answer: -5.33265406 + helper.uri.hostname.length
      },
      headers: {
        Referer: uri
      },
      challengesToSolve: 2
    });

    const thirdParams = helper.extendParams({
      resolveWithFullResponse: true,
      uri: helper.resolve('/cdn-cgi/l/chk_jschl'),
      qs: {
        jschl_vc: 'a41fee3a9f041fea01f0cbf3e8e4d29b',
        pass: '1543827246.024-hvxyNA3rOg',
        // 1.9145049856 is a answer to Cloudflare's JS challenge in this particular case
        jschl_answer: -1.9145049856 + helper.uri.hostname.length
      },
      headers: {
        Referer: helper.resolve('/cdn-cgi/l/chk_jschl?' +
          querystring.stringify(secondParams.qs))
      },
      challengesToSolve: 1
    });

    const options = { uri: uri, resolveWithFullResponse: true };

    const promise = cloudscraper.get(options, function (error, response, body) {
      expect(error).to.be.null;

      expect(Request).to.be.calledThrice;
      expect(Request.firstCall).to.be.calledWithExactly(firstParams);
      expect(Request.secondCall).to.be.calledWithExactly(secondParams);
      expect(Request.thirdCall).to.be.calledWithExactly(thirdParams);

      expect(body).to.be.equal(requestedPage);
      expect(promise).to.eventually.haveOwnProperty('body', requestedPage).and.notify(done);
    });
  });

  it('should make post request with formData', function (done) {
    helper.router.post('/test', function (req, res) {
      res.send(requestedPage);
    });

    const formData = { some: 'data' };

    const expectedParams = helper.extendParams({
      method: 'POST',
      formData: formData
    });

    const options = { uri: uri, formData: formData };

    const promise = cloudscraper.post(options, function (error, response, body) {
      expect(error).to.be.null;
      expect(Request).to.be.calledOnceWithExactly(expectedParams);
      expect(body).to.be.equal(requestedPage);
      expect(promise).to.eventually.equal(requestedPage).and.notify(done);
    });
  });

  it('should make delete request', function (done) {
    helper.router.delete('/test', function (req, res) {
      res.send(requestedPage);
    });

    const expectedParams = helper.extendParams({ method: 'DELETE' });

    const promise = cloudscraper.delete(uri, function (error, response, body) {
      expect(error).to.be.null;
      expect(Request).to.be.calledOnceWithExactly(expectedParams);
      expect(body).to.be.equal(requestedPage);
      expect(promise).to.eventually.equal(requestedPage).and.notify(done);
    });
  });

  it('should return raw data when encoding is null', function (done) {
    helper.router.get('/test', function (req, res) {
      res.send(requestedPage);
    });

    const expectedBody = Buffer.from(requestedPage, 'utf8');
    const expectedParams = helper.extendParams({ realEncoding: null });

    const options = { uri: uri, encoding: null };

    const promise = cloudscraper.get(options, function (error, response, body) {
      expect(error).to.be.null;
      expect(Request).to.be.calledOnceWithExactly(expectedParams);
      expect(body).to.be.eql(expectedBody);
      expect(promise).to.eventually.eql(expectedBody).and.notify(done);
    });
  });

  it('should resolve sucuri WAF (version as on 18.08.2016) and then return page', function (done) {
    helper.router.get('/test', function (req, res) {
      if (req.headers.cookie === 'sucuri_cloudproxy_uuid_575ef0f62=16cc0aa4400d9c6961cce3ce380ce11a') {
        res.send(requestedPage);
      } else {
        // It returns a redirecting page if a (session) cookie is unset.
        res.sendChallenge('sucuri_waf_18_08_2016.html');
      }
    });

    const expectedParams = helper.extendParams({ challengesToSolve: 2 });

    // We need to override cloudscraper's default jar for this test
    const options = { uri: uri, jar: helper.defaultParams.jar };

    const promise = cloudscraper.get(options, function (error, response, body) {
      expect(error).to.be.null;

      expect(Request).to.be.calledTwice;
      expect(Request.firstCall).to.be.calledWithExactly(helper.defaultParams);
      expect(Request.secondCall).to.be.calledWithExactly(expectedParams);

      expect(body).to.be.equal(requestedPage);
    });

    expect(promise).to.eventually.equal(requestedPage).and.notify(done);
  });

  it('should resolve sucuri WAF (version as on 11.08.2019) and then return page', function (done) {
    helper.router.get('/test', function (req, res) {
      if (req.headers.cookie === 'sucuri_cloudproxy_uuid_4d78c121f=a275131d1f983b25c7aeecd2f8c79b0d') {
        res.send(requestedPage);
      } else {
        // It returns a redirecting page if a (session) cookie is unset.
        res.sendChallenge('sucuri_waf_11_08_2019.html');
      }
    });

    const expectedParams = helper.extendParams({ challengesToSolve: 2 });

    // We need to override cloudscraper's default jar for this test
    const options = { uri: uri, jar: helper.defaultParams.jar };

    const promise = cloudscraper.get(options, function (error, response, body) {
      expect(error).to.be.null;

      expect(Request).to.be.calledTwice;
      expect(Request.firstCall).to.be.calledWithExactly(helper.defaultParams);
      expect(Request.secondCall).to.be.calledWithExactly(expectedParams);

      expect(body).to.be.equal(requestedPage);
      expect(promise).to.eventually.equal(requestedPage).and.notify(done);
    });
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

    const firstParams  = helper.extendParams({
      proxy: helper.uri.href,
      uri: 'http://example-site.dev/test'
    });

    const secondParams = helper.extendParams({
      proxy: helper.uri.href,
      uri: 'http://example-site.dev/cdn-cgi/l/chk_jschl',
      qs: {
        jschl_vc: '427c2b1cd4fba29608ee81b200e94bfa',
        // -5.33265406 is a answer to Cloudflare's JS challenge in this particular case
        jschl_answer: -5.33265406 + 'example-site.dev'.length,
        pass: '1543827239.915-44n9IE20mS'
      },
      headers: {
        Referer: 'http://example-site.dev/test'
      },
      challengesToSolve: 2
    });

    const options = {
      proxy: helper.uri.href,
      uri: 'http://example-site.dev/test'
    };

    const promise = cloudscraper.get(options, function (error, response, body) {
      expect(error).to.be.null;

      expect(Request).to.be.calledTwice;
      expect(Request.firstCall).to.be.calledWithExactly(firstParams);
      expect(Request.secondCall).to.be.calledWithExactly(secondParams);

      expect(body).to.be.equal(requestedPage);
      expect(promise).to.eventually.equal(requestedPage).and.notify(done);
    });
  });

  it('should reuse the provided cookie jar', function (done) {
    helper.router.get('/test', function (req, res) {
      if (req.headers.cookie === 'sucuri_cloudproxy_uuid_575ef0f62=16cc0aa4400d9c6961cce3ce380ce11a') {
        res.send(requestedPage);
      } else {
        // It returns a redirecting page if a (session) cookie is unset.
        res.sendChallenge('sucuri_waf_18_08_2016.html');
      }
    });

    const customJar = request.jar();

    const firstParams  = helper.extendParams({ jar: customJar });
    const secondParams = helper.extendParams({
      jar: customJar,
      challengesToSolve: 2
    });

    // We need to override cloudscraper's default jar for this test
    const options = { uri: uri, jar: customJar };

    customJar.setCookie('custom cookie', 'http://custom-site.dev/');

    cloudscraper.get(options, function (error, response, body) {
      expect(error).to.be.null;

      expect(Request).to.be.calledTwice;
      expect(Request.firstCall).to.be.calledWithExactly(firstParams);
      expect(Request.secondCall).to.be.calledWithExactly(secondParams);

      expect(body).to.be.equal(requestedPage);

      let customCookie = customJar.getCookieString('http://custom-site.dev/');
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

    const custom = cloudscraper.defaults({ challengesToSolve: 5 });
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

    const cf = cloudscraper.defaults({ decodeEmails: true });

    const firstParams = helper.extendParams({ decodeEmails: true });

    const promise = cf.get(uri, function (error, response, body) {
      expect(error).to.be.null;

      expect(Request).to.be.calledTwice;
      expect(Request.firstCall).to.be.calledWithExactly(firstParams);

      expect(body).to.include('cloudscraper@example-site.dev');
      expect(promise).to.eventually.include('cloudscraper@example-site.dev').and.notify(done);
    });
  });

  it('should not error when using the baseUrl option', function (done) {
    helper.router
      .get('/test', function (req, res) {
        res.sendChallenge('js_challenge_13_03_2019.html');
      })
      .get('/cdn-cgi/l/chk_jschl', function (req, res) {
        res.send(requestedPage);
      });

    const cf = cloudscraper.defaults({ baseUrl: helper.uri.href });

    const firstParams = helper.extendParams({
      baseUrl: helper.uri.href,
      uri: '/test'
    });

    const promise = cf.get('/test', function (error, response, body) {
      expect(error).to.be.null;

      expect(Request).to.be.calledTwice;
      expect(Request.firstCall).to.be.calledWithExactly(firstParams);
      expect(Request.secondCall.args[0]).to.not.have.property('baseUrl');

      expect(body).to.be.equal(requestedPage);
      expect(promise).to.eventually.equal(requestedPage).and.notify(done);
    });
  });

  it('should use the provided cloudflare timeout', function (done) {
    helper.router
      .get('/test', function (req, res) {
        res.sendChallenge('js_challenge_03_12_2018_1.html');
      })
      .get('/cdn-cgi/l/chk_jschl', function (req, res) {
        res.send(requestedPage);
      });

    const expectedParams = helper.extendParams({ cloudflareTimeout: 50 });

    const start = Date.now();
    const options = { uri: uri, cloudflareTimeout: 50 };

    const promise = cloudscraper.get(options, function (error) {
      expect(error).to.be.null;
      expect(Request.firstCall).to.be.calledWithExactly(expectedParams);

      const elapsed = Date.now() - start;
      // Aiming to be within ~450ms of specified timeout
      expect(elapsed >= 50 && elapsed <= 500).to.be.ok;
      expect(promise).to.eventually.equal(requestedPage).and.notify(done);
    });
  });

  it('sandbox.document.getElementById should not error', function (done) {
    const html = helper.getFixture('js_challenge_21_03_2019.html');
    const statements = 'document.getElementById("missing");'.repeat(2);

    helper.router
      .get('/test', function (req, res) {
        // Inserts new statements (getElementById) before 'a.value'
        res.cloudflare().status(503).send(html.replace('a.value', statements + 'a.value'));
      })
      .get('/cdn-cgi/l/chk_jschl', function (req, res) {
        res.send(requestedPage);
      });

    const promise = cloudscraper.get(uri, function (error, response, body) {
      expect(error).to.be.null;
      expect(Request).to.be.calledTwice;
      expect(promise).to.eventually.equal(requestedPage).and.notify(done);
    });
  });
});
