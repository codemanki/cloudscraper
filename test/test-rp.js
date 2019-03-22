/* eslint-disable promise/always-return,promise/catch-or-return,promise/no-callback-in-promise */
/* eslint-env node, mocha */
'use strict';

var cloudscraper = require('../index');
var request      = require('request-promise');
var helper       = require('./helper');

var sinon  = require('sinon');
var expect = require('chai').expect;

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

  it('should resolve with response body', function () {
    helper.router.get('/test', function (req, res) {
      res.send(requestedPage);
    });

    var expectedParams = helper.extendParams({ callback: undefined });

    return cloudscraper.get(uri).then(function (body) {
      expect(Request).to.be.calledOnceWithExactly(expectedParams);
      expect(body).to.be.equal(requestedPage);
    });
  });

  it('should resolve with full response', function () {
    helper.router.get('/test', function (req, res) {
      res.send(requestedPage);
    });

    var expectedParams = helper.extendParams({
      callback: undefined,
      resolveWithFullResponse: true
    });

    // The method is implicitly GET
    delete expectedParams.method;

    var options = {
      uri: uri,
      resolveWithFullResponse: true
    };

    return cloudscraper(options).then(function (response) {
      expect(Request).to.be.calledOnceWithExactly(expectedParams);
      expect(response.body).to.be.equal(requestedPage);
    });
  });

  // The helper calls the fake request callback synchronously. This results
  // in the promise being rejected before we catch it in the test.
  // This can be noticeable if we return the promise instead of calling done.
  it('should define catch', function (done) {
    helper.router.get('/test', function (req, res) {
      res.endAbruptly();
    });

    var caught = false;

    cloudscraper(uri)
      .catch(function () {
        caught = true;
      })
      .then(function () {
        if (caught) done();
      });
  });

  it('should define finally', function (done) {
    helper.router.get('/test', function (req, res) {
      res.endAbruptly();
    });

    var caught = false;

    cloudscraper(uri)
      .then(function () {
        caught = true;
      })
      .finally(function () {
        if (!caught) done();
      })
      .catch(function () {});
  });
});
