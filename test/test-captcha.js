/* eslint-disable no-unused-expressions */
/* eslint-env node, mocha */
'use strict';

const cloudscraper = require('../index');
const request      = require('request-promise');
const errors       = require('../errors');
const helper       = require('./helper');
const http         = require('http');

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

  it('should handle onCaptcha promise being rejected with a falsy error', function (done) {
    helper.router.get('/test', function (req, res) {
      res.sendCaptcha('cf_recaptcha_15_04_2019.html');
    });

    const options = {
      uri,
      onCaptcha: function () {
        // eslint-disable-next-line prefer-promise-reject-errors
        return Promise.reject();
      }
    };

    const promise = cloudscraper.get(options, function (error) {
      expect(error).to.be.instanceOf(errors.CaptchaError);
      expect(error.error).to.be.an('error');
      expect(error).to.have.property('errorType', 1);
      expect(error.message).to.include('Falsy error');
      expect(promise).to.be.rejectedWith(errors.CaptchaError).and.notify(done);
    });
  });

  for (let stage = 0; stage < 4; stage++) {
    const desc = {
      0: 'should resolve reCAPTCHA (version as on 10.04.2019) when user calls captcha.submit()',
      1: 'should callback with an error if user calls captcha.submit(error)',
      2: 'should resolve reCAPTCHA (version as on 10.04.2019) when the onCaptcha promise resolves',
      3: 'should callback with an error if the onCaptcha promise is rejected'
    };

    // Run this test 4 times
    it(desc[stage], function (done) {
      const secret = '6b132d85d185a8255f2451d48fe6a8bee7154ea2-1555377580-1800-AQ1azEkeDOnQP5ByOpwUU/RdbKrmMwHYpkaenRvjPXtB0w8Vbjn/Ceg62tfpp/lT799kjDLEMMuDkEMqQ7iO51kniWCQm00BQvDGl+D0h/WvXDWO96YXOUD3qrqUTuzO7QbUOinc8y8kedvOQkr4c0o=';
      const siteKey = '6LfBixYUAAAAABhdHynFUIMA_sa4s-XsJvnjtgB0';
      const expectedError = new Error('anti-captcha failed!');

      helper.router
        .get('/test', function (req, res) {
          res.sendCaptcha('cf_recaptcha_15_04_2019.html');
        })
        .get('/cdn-cgi/l/chk_captcha', function (req, res) {
          res.send(requestedPage);
        });

      const onCaptcha = sinon.spy(function (options, response, body) {
        expect(options).to.be.an('object');
        expect(response).to.be.instanceof(http.IncomingMessage);
        expect(body).to.be.a('string');

        sinon.assert.match(response, {
          isCloudflare: true,
          isHTML: true,
          isCaptcha: true,
          captcha: sinon.match.object
        });

        sinon.assert.match(response.captcha, {
          url: uri, // <-- Deprecated
          uri: sinon.match.same(response.request.uri),
          form: { s: secret },
          siteKey: siteKey,
          submit: sinon.match.func
        });

        // Simulate what the user should do here
        response.captcha.form['g-recaptcha-response'] = 'foobar';

        switch (stage) {
          case 0:
            // User green lights form submission
            response.captcha.submit();
            break;
          case 1:
            // User reports an error when solving the reCAPTCHA
            response.captcha.submit(expectedError);
            break;
          case 2:
            // User green lights form submission by resolving the returned promise
            return Promise.resolve();
          case 3:
            // User reports an error by rejecting the returned promise
            return Promise.reject(expectedError);
        }
      });

      const firstParams = helper.extendParams({ onCaptcha, uri });
      const secondParams = helper.extendParams({
        onCaptcha,
        method: 'GET',
        uri: helper.resolve('/cdn-cgi/l/chk_captcha'),
        headers: {
          Referer: uri
        },
        qs: {
          s: secret,
          'g-recaptcha-response': 'foobar'
        }
      });

      const options = { onCaptcha, uri };

      const promise = cloudscraper.get(options, function (error, response, body) {
        switch (stage) {
          case 0:
          case 2:
            expect(error).to.be.null;

            expect(onCaptcha).to.be.calledOnce;

            expect(Request).to.be.calledTwice;
            expect(Request.firstCall).to.be.calledWithExactly(firstParams);
            expect(Request.secondCall).to.be.calledWithExactly(secondParams);

            expect(body).to.be.equal(requestedPage);
            expect(promise).to.eventually.equal(requestedPage).and.notify(done);
            break;
          case 1:
          case 3:
            expect(error).to.be.instanceOf(errors.CaptchaError);
            expect(error.error).to.be.an('error');
            expect(error).to.have.property('errorType', 1);
            expect(error.message).to.include(expectedError.message);
            expect(promise).to.be.rejectedWith(errors.CaptchaError).and.notify(done);
            break;
        }
      });
    });
  }
});
