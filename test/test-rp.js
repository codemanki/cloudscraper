/* eslint-disable promise/always-return,promise/catch-or-return,promise/no-callback-in-promise */
/* eslint-env node, mocha */
'use strict';

var cloudscraper = require('../index');
var request      = require('request-promise');
var helper       = require('./helper');

var sinon  = require('sinon');
var expect = require('chai').expect;

describe('Cloudscraper promise', function () {
  var requestedPage = helper.getFixture('requested_page.html');
  var uri = helper.defaultParams.uri;
  var sandbox;
  var Request;

  beforeEach(function () {
    helper.defaultParams.jar = request.jar();
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

  it('should resolve with response body', function () {
    var expectedResponse = helper.fakeResponse({ body: requestedPage });
    var expectedParams = helper.extendParams({ callback: undefined });

    Request.callsFake(helper.fakeRequest({ response: expectedResponse }));

    var promise = cloudscraper.get(uri);

    return promise.then(function (body) {
      expect(Request).to.be.calledOnceWithExactly(expectedParams);
      expect(body).to.be.equal(requestedPage);
    });
  });

  it('should resolve with full response', function () {
    var expectedResponse = helper.fakeResponse({
      statusCode: 200,
      body: requestedPage
    });

    var expectedParams = helper.extendParams({
      callback: undefined,
      resolveWithFullResponse: true
    });

    // The method is implicitly GET
    delete expectedParams.method;

    Request.callsFake(helper.fakeRequest({ response: expectedResponse }));

    var promise = cloudscraper({
      uri: uri,
      resolveWithFullResponse: true
    });

    return promise.then(function (response) {
      expect(Request).to.be.calledOnceWithExactly(expectedParams);

      expect(response).to.be.equal(expectedResponse);
      expect(response.body).to.be.equal(requestedPage);
    });
  });

  // The helper calls the fake request callback synchronously. This results
  // in the promise being rejected before we catch it in the test.
  // This can be noticeable if we return the promise instead of calling done.
  it('should define catch', function (done) {
    var expectedResponse = helper.fakeResponse({ error: new Error('fake') });

    Request.callsFake(helper.fakeRequest({ response: expectedResponse }));

    var caught = false;
    var promise = cloudscraper(uri);

    promise.catch(function () {
      caught = true;
    }).then(function () {
      if (caught) done();
    });
  });

  it('should define finally', function (done) {
    var expectedResponse = helper.fakeResponse({ error: new Error('fake') });

    Request.callsFake(helper.fakeRequest({ response: expectedResponse }));

    var caught = false;
    var promise = cloudscraper(uri);

    promise.then(function () {
      caught = true;
    }).finally(function () {
      if (!caught) done();
    });
  });
});
