/* eslint-disable no-unused-expressions */
/* eslint-env node, mocha */
'use strict';

const cloudscraper = require('../index');
const request      = require('request-promise');
const helper       = require('./helper');
const brotli       = require('../lib/brotli');
const errors       = require('../errors');

const sinon  = require('sinon');
const expect = require('chai').expect;
const assert = require('chai').assert;

describe('Cloudscraper', function () {
  let sandbox;
  let Request;
  let uri;

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

  it('should return error if it was thrown by request', function (done) {
    helper.router.get('/test', function (req, res) {
      res.endAbruptly();
    });

    const promise = cloudscraper.get(uri, function (error) {
      expect(error).to.be.instanceOf(errors.RequestError);
      expect(error.error).to.be.an('error');
      expect(error).to.have.property('errorType', 0);

      expect(Request).to.be.calledOnceWithExactly(helper.defaultParams);
      expect(promise).to.be.rejectedWith(errors.RequestError).and.notify(done);
    });
  });

  it('should return error if cloudflare response is empty', function (done) {
    helper.router.get('/test', function (req, res) {
      res.cloudflare().status(504).end();
    });

    const promise = cloudscraper.get(uri, function (error) {
      // errorType 1, means captcha is served
      expect(error).to.be.instanceOf(errors.CloudflareError);
      expect(error).to.have.property('error', 504);
      expect(error).to.have.property('errorType', 2);
      expect(error.message).to.be.equal('504, Gateway Timeout');

      expect(Request).to.be.calledOnceWithExactly(helper.defaultParams);

      expect(error.response.body).to.be.eql(Buffer.alloc(0));
      expect(promise).to.be.rejectedWith(errors.CloudflareError).and.notify(done);
    });
  });

  it('should return error if captcha is served by cloudflare', function (done) {
    helper.router.get('/test', function (req, res) {
      res.sendChallenge('captcha.html');
    });

    const promise = cloudscraper.get(uri, function (error) {
      // errorType 1, means captcha is served
      expect(error).to.be.instanceOf(errors.CaptchaError);
      expect(error).to.have.property('error', 'captcha');
      expect(error).to.have.property('errorType', 1);

      expect(Request).to.be.calledOnceWithExactly(helper.defaultParams);
      expect(promise).to.be.rejectedWith(errors.CaptchaError).and.notify(done);
    });
  });

  it('should return error if cloudflare returned some inner error', function (done) {
    // https://support.cloudflare.com/hc/en-us/sections/200820298-Error-Pages
    // Error codes: 1012, 1011, 1002, 1000, 1004, 1010, 1006, 1007, 1008
    // Error codes can also be the same as the HTTP status code in the 5xx range.

    helper.router.get('/test', function (req, res) {
      res.cloudflare().status(500).sendFixture('access_denied.html');
    });

    const promise = cloudscraper.get(uri, function (error) {
      // errorType 2, means inner cloudflare error
      expect(error).to.be.instanceOf(errors.CloudflareError);
      expect(error).to.have.property('error', 1006);
      expect(error.message).to.equal('1006, Access Denied: Your IP address has been banned');
      expect(error).to.have.property('errorType', 2);

      expect(Request).to.be.calledOnceWithExactly(helper.defaultParams);
      expect(promise).to.be.rejectedWith(errors.CloudflareError).and.notify(done);
    });
  });

  it('should add a description to 5xx range cloudflare errors', function (done) {
    const html = helper.getFixture('access_denied.html').toString('utf8');

    helper.router.get('/test', function (req, res) {
      res.cloudflare().status(504).send(html.replace('1006', '504'));
    });

    const promise = cloudscraper.get(uri, function (error) {
      // errorType 2, means inner cloudflare error
      expect(error).to.be.instanceOf(errors.CloudflareError);
      expect(error).to.have.property('error', 504);
      expect(error.message).to.equal('504, Gateway Timeout');
      expect(error).to.have.property('errorType', 2);

      expect(Request).to.be.calledOnceWithExactly(helper.defaultParams);
      expect(promise).to.be.rejectedWith(errors.CloudflareError).and.notify(done);
    });
  });

  it('should not error if error description is unavailable', function (done) {
    const html = helper.getFixture('access_denied.html').toString('utf8');

    helper.router.get('/test', function (req, res) {
      res.cloudflare().status(500).send(html.replace('1006', '5111'));
    });

    const promise = cloudscraper.get(uri, function (error) {
      // errorType 2, means inner cloudflare error
      expect(error).to.be.instanceOf(errors.CloudflareError);
      expect(error).to.have.property('error', 5111);
      expect(error.message).to.equal('5111');
      expect(error).to.have.property('errorType', 2);

      expect(Request).to.be.calledOnceWithExactly(helper.defaultParams);
      expect(promise).to.be.rejectedWith(errors.CloudflareError).and.notify(done);
    });
  });

  it('should return error if cf presented more than 3 challenges in a row', function (done) {
    helper.router.get('*', function (req, res) {
      res.sendChallenge('js_challenge_09_06_2016.html');
    });

    // The expected params for all subsequent calls to Request
    const expectedParams = helper.extendParams({
      uri: helper.resolve('/cdn-cgi/l/chk_jschl')
    });

    // Perform less strict matching on headers and qs to simplify this test
    Object.assign(expectedParams, {
      headers: sinon.match.object,
      qs: sinon.match.object
    });

    const promise = cloudscraper.get(uri, function (error) {
      expect(error).to.be.instanceOf(errors.CloudflareError);
      expect(error).to.have.property('error', 'Cloudflare challenge loop');
      expect(error).to.have.property('errorType', 4);

      assert.equal(Request.callCount, 4, 'Request call count');
      expect(Request.firstCall).to.be.calledWithExactly(helper.defaultParams);

      const total = helper.defaultParams.challengesToSolve + 1;
      // noinspection ES6ConvertVarToLetConst
      for (var i = 1; i < total; i++) {
        // Decrement the number of challengesToSolve to match actual params
        expectedParams.challengesToSolve -= 1;
        expect(Request.getCall(i)).to.be.calledWithExactly(expectedParams);
      }

      expect(promise).to.be.rejectedWith(errors.CloudflareError).and.notify(done);
    });
  });

  it('should return error if body is undefined', function (done) {
    helper.router.get('/test', function (req, res) {
      res.status(503).end();
    });

    const expectedParams = helper.extendParams({ json: true });
    const options = { uri: uri, json: true };

    const promise = cloudscraper.get(options, function (error) {
      expect(error).to.be.instanceOf(errors.RequestError);
      expect(error).to.have.property('error', null);
      expect(error).to.have.property('errorType', 0);

      assert.equal(error.response.statusCode, 503, 'status code');

      expect(error.response.body).to.be.equal(undefined);
      expect(Request).to.be.calledOnceWithExactly(expectedParams);
      expect(promise).to.be.rejectedWith(errors.RequestError).and.notify(done);
    });
  });

  (brotli.isAvailable ? it.skip : it)('should return error if content-type is brotli and missing dep', function (done) {
    // Brotli compressed JSON: {"a":"test"}
    const compressed = Buffer.from([
      0x8b, 0x05, 0x80, 0x7b, 0x22, 0x61, 0x22, 0x3a,
      0x22, 0x74, 0x65, 0x73, 0x74, 0x22, 0x7d, 0x03
    ]);

    helper.router.get('/test', function (req, res) {
      res.set('content-encoding', 'br');
      res.status(503).end(compressed, 'binary');
    });

    const expectedParams = helper.extendParams({ json: true });
    const options = { uri: uri, json: true };

    const promise = cloudscraper.get(options, function (error) {
      expect(error).to.be.instanceOf(errors.RequestError);
      expect(error).to.have.property('error').that.is.ok;
      expect(error).to.have.property('errorType', 0);

      assert.equal(error.response.statusCode, 503, 'status code');

      assert(Buffer.isBuffer(error.response.body), 'response type');
      expect(error.response.body).to.be.eql(compressed);
      expect(Request).to.be.calledOnceWithExactly(expectedParams);
      expect(promise).to.be.rejectedWith(errors.RequestError).and.notify(done);
    });
  });

  it('should return error if challenge page failed to be parsed', function (done) {
    helper.router.get('/test', function (req, res) {
      res.sendChallenge('invalid_js_challenge.html');
    });

    const promise = cloudscraper.get(uri, function (error) {
      expect(error).to.be.instanceOf(errors.ParserError);
      expect(error).to.have.property('error').that.is.ok;
      expect(error).to.have.property('errorType', 3);

      expect(Request).to.be.calledOnceWithExactly(helper.defaultParams);
      expect(promise).to.be.rejectedWith(errors.ParserError).and.notify(done);
    });
  });

  it('should return error if js challenge has error during evaluation', function (done) {
    const html = helper.getFixture('js_challenge_03_12_2018_1.html');

    helper.router.get('/test', function (req, res) {
      // Adds a syntax error near the end of line 37
      res.cloudflare().status(503).send(html.replace(/\.toFixed/gm, '..toFixed'));
    });

    const promise = cloudscraper.get(uri, function (error) {
      expect(error).to.be.instanceOf(errors.ParserError);
      expect(error).to.have.property('error').that.is.an('error');
      expect(error).to.have.property('errorType', 3);
      expect(error.message).to.include('Challenge evaluation failed');

      expect(Request).to.be.calledOnceWithExactly(helper.defaultParams);
      expect(promise).to.be.rejectedWith(errors.ParserError).and.notify(done);
    });
  });

  it('should return error if pass extraction fails', function (done) {
    const html = helper.getFixture('js_challenge_03_12_2018_1.html');

    helper.router.get('/test', function (req, res) {
      res.cloudflare().status(503).send(html.replace(/name="pass"/gm, ''));
    });

    const promise = cloudscraper.get(uri, function (error) {
      expect(error).to.be.instanceOf(errors.ParserError);
      expect(error).to.have.property('error', 'Attribute (pass) value extraction failed');
      expect(error).to.have.property('errorType', 3);

      expect(Request).to.be.calledOnceWithExactly(helper.defaultParams);
      expect(promise).to.be.rejectedWith(errors.ParserError).and.notify(done);
    });
  });

  it('should return error if challengeId extraction fails', function (done) {
    const html = helper.getFixture('js_challenge_03_12_2018_1.html');

    helper.router.get('/test', function (req, res) {
      res.cloudflare().status(503).send(html.replace(/name="jschl_vc"/gm, ''));
    });

    const promise = cloudscraper.get(uri, function (error) {
      expect(error).to.be.instanceOf(errors.ParserError);
      expect(error).to.have.property('error', 'challengeId (jschl_vc) extraction failed');
      expect(error).to.have.property('errorType', 3);

      expect(Request).to.be.calledOnceWithExactly(helper.defaultParams);
      expect(promise).to.be.rejectedWith(errors.ParserError).and.notify(done);
    });
  });

  it('should return error if challenge answer is not a number', function (done) {
    const html = helper.getFixture('js_challenge_03_12_2018_1.html');

    helper.router.get('/test', function (req, res) {
      res.cloudflare().status(503)
        .send(html.replace(/a.value.*/, 'a.value="abc" + t.length'));
    });

    const promise = cloudscraper.get(uri, function (error) {
      expect(error).to.be.instanceOf(errors.ParserError);
      expect(error).to.have.property('error', 'Challenge answer is not a number');
      expect(error).to.have.property('errorType', 3);

      expect(Request).to.be.calledOnceWithExactly(helper.defaultParams);
      expect(promise).to.be.rejectedWith(errors.ParserError).and.notify(done);
    });
  });

  it('should return error if it was thrown by request when solving challenge', function (done) {
    helper.router
      .get('/test', function (req, res) {
        res.sendChallenge('js_challenge_21_05_2015.html');
      })
      .get('/cdn-cgi/l/chk_jschl', function (req, res) {
        res.endAbruptly();
      });

    const promise = cloudscraper.get(uri, function (error) {
      // errorType 0, a connection error for example
      expect(error).to.be.instanceOf(errors.RequestError);
      expect(error.error).to.be.an('error');
      expect(error).to.have.property('errorType', 0);

      expect(Request).to.be.calledTwice;
      expect(Request.firstCall).to.be.calledWithExactly(helper.defaultParams);
      expect(promise).to.be.rejectedWith(errors.RequestError).and.notify(done);
    });
  });

  it('should properly handle a case when after a challenge another one is returned', function (done) {
    helper.router
      .get('/test', function (req, res) {
        res.sendChallenge('js_challenge_09_06_2016.html');
      })
      .get('/cdn-cgi/l/chk_jschl', function (req, res) {
        res.sendChallenge('captcha.html');
      });

    // Second call to request.get returns recaptcha
    const expectedParams = helper.extendParams({
      uri: helper.resolve('/cdn-cgi/l/chk_jschl'),
      challengesToSolve: 2
    });

    // Perform less strict matching on headers and qs to simplify this test
    Object.assign(expectedParams, {
      headers: sinon.match.object,
      qs: sinon.match.object
    });

    const promise = cloudscraper.get(uri, function (error) {
      // errorType 1, means captcha is served
      expect(error).to.be.instanceOf(errors.CaptchaError);
      expect(error).to.have.property('error', 'captcha');
      expect(error).to.have.property('errorType', 1);

      expect(Request).to.be.calledTwice;
      expect(Request.firstCall).to.be.calledWithExactly(helper.defaultParams);
      expect(Request.secondCall).to.be.calledWithExactly(expectedParams);
      expect(promise).to.be.rejectedWith(errors.CaptchaError).and.notify(done);
    });
  });

  it('should return error if challenge page cookie extraction fails', function (done) {
    const html = helper.getFixture('sucuri_waf_18_08_2016.html').toString('utf8');

    helper.router.get('/test', function (req, res) {
      // The cookie extraction codes looks for the `S` variable assignment
      res.cloudflare().status(503).send(html.replace(/S=/gm, 'Z='));
    });

    const promise = cloudscraper.get(uri, function (error) {
      expect(error).to.be.instanceOf(errors.ParserError);
      expect(error).to.have.property('error', 'Cookie code extraction failed');
      expect(error).to.have.property('errorType', 3);

      expect(Request).to.be.calledOnceWithExactly(helper.defaultParams);
      expect(promise).to.be.rejectedWith(errors.ParserError).and.notify(done);
    });
  });

  it('should throw a TypeError if callback is not a function', function (done) {
    const spy = sinon.spy(function () {
      // request-promise always provides a callback so change requester
      const options = { uri: uri, requester: require('request') };
      cloudscraper.get(options);
    });

    expect(spy).to.throw(TypeError, /Expected a callback function/);
    done();
  });

  it('should throw a TypeError if requester is not a function', function (done) {
    const spy = sinon.spy(function () {
      cloudscraper.get({ requester: null });
    });

    expect(spy).to.throw(TypeError, /`requester` option .*function/);
    done();
  });

  it('should throw a TypeError if challengesToSolve is not a number', function (done) {
    const spy = sinon.spy(function () {
      const options = { uri: uri, challengesToSolve: 'abc' };

      cloudscraper.get(options);
    });

    expect(spy).to.throw(TypeError, /`challengesToSolve` option .*number/);
    done();
  });

  it('should throw a TypeError if cloudflareMaxTimeout is not a number', function (done) {
    const spy = sinon.spy(function () {
      const options = { uri: uri, cloudflareMaxTimeout: 'abc' };

      cloudscraper.get(options, function () {});
    });

    expect(spy).to.throw(TypeError, /`cloudflareMaxTimeout` option .*number/);
    done();
  });

  it('should return error if cookie setting code evaluation fails', function (done) {
    // Change the cookie setting code so the vm will throw an error
    const html = helper.getFixture('sucuri_waf_18_08_2016.html').toString('utf8');
    const b64 = Buffer.from('throw new Error(\'vm eval failed\');').toString('base64');

    helper.router.get('/test', function (req, res) {
      res.cloudflare().status(503).send(html.replace(/S='([^']+)'/, 'S=\'' + b64 + '\''));
    });

    const promise = cloudscraper.get(uri, function (error) {
      expect(error).to.be.instanceOf(errors.ParserError);
      expect(error).to.have.property('error').that.is.an('error');
      expect(error).to.have.property('errorType', 3);
      expect(error.message).to.include('vm eval failed');

      expect(Request).to.be.calledOnceWithExactly(helper.defaultParams);
      expect(promise).to.be.rejectedWith(errors.ParserError).and.notify(done);
    });
  });

  it('should not error if Error.captureStackTrace is undefined', function () {
    const desc = Object.getOwnPropertyDescriptor(Error, 'captureStackTrace');

    Object.defineProperty(Error, 'captureStackTrace', {
      configurable: true,
      value: undefined
    });

    const spy = sinon.spy(function () {
      throw new errors.RequestError();
    });

    try {
      expect(spy).to.throw(errors.RequestError);
    } finally {
      Object.defineProperty(Error, 'captureStackTrace', desc);
    }
  });
});
