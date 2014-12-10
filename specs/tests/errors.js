var helper       = require('../spec_helper'),
    request      = require('request');

describe('Cloudscraper', function() {
  var sandbox,
      url             = 'http://example-site.dev/path/',
      captchaPage     = helper.getFixture('captcha.html'),
      accessDenied    = helper.getFixture('access_denied.html'),
      headers         = {'User-Agent': 'Chrome'},

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
  });

  afterEach(function () {
    sandbox.restore();
  });

  it('should return error if it was thrown by request', function(done) {
    var response = { statusCode: 500 },
        fakeError = {fake: 'error'}; //not real request error, but it doesn't matter

    sandbox.stub(requestDefault, 'get')
           .withArgs({url: url, headers: headers})
           .callsArgWith(1, fakeError, response, '');

    cloudscraper.get(url, function(error) {
      expect(error).to.be.eql({errorType: 0, error: fakeError}); //errorType 0, means it is some kind of system error
      done();
    }, headers);

  });

});
