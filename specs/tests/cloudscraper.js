var helper       = require('../spec_helper'),
    request      = require('request');

describe('Cloudscraper', function() {
  var sandbox,
      url             = 'http://example-site.dev/path/',
      requestedPage   = helper.getFixture('requested_page.html'),
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
    // since cloudflare requires timeout, the module relies on setTimeout. It should be proprely stubbed to avoid ut running for too long
    this.clock = sinon.useFakeTimers();
  });

  afterEach(function () {
    sandbox.restore();
    this.clock.restore();
  });

  it('should return requested page, if cloudflare is disabled for page', function(done) {
    var exprectedResponse = { statusCode: 200 };

    // Stub first call, which request makes to page. It should return requested page
    sandbox.stub(requestDefault, 'get')
           .withArgs({url: url, headers: headers})
           .callsArgWith(1, null, exprectedResponse, requestedPage);

    cloudscraper.get(url, function(error, body, response) {
      expect(error).to.be.null();
      expect(body).to.be.equal(requestedPage);
      expect(response).to.be.equal(exprectedResponse);
      done();
    }, headers);

  });

  it('should resolve challenge (version as on 21.05.2015) and then return page', function(done) {
    var jsChallengePage = helper.getFixture('js_challenge_21_05_2015.html'),
        response = helper.fakeResponseObject(503, headers, jsChallengePage, url),
        stubbed;

    // Cloudflare is enabled for site. It returns a page with js challenge
    stubbed = sandbox.stub(requestDefault, 'get')
                .withArgs({url: url, headers: headers})
                .callsArgWith(1, null, response, jsChallengePage);

    // Second call to request.get will have challenge solution
    // It should contain url, answer, headers with Referer
    stubbed.withArgs({
      url: 'http://example-site.dev/cdn-cgi/l/chk_jschl',
      qs: {
        'jschl_vc': '89cdff5eaa25923e0f26e29e5195dce9',
        'jschl_answer': 633 + 'example-site.dev'.length, // 633 is a answer to cloudflares js challenge in this particular case
        'pass': '1432194174.495-8TSfc235EQ'
      },
      headers: {
        'User-Agent': 'Chrome',
        'Referer': 'http://example-site.dev/path/'
      }
    })
    .callsArgWith(1, null, response, requestedPage);

    cloudscraper.get(url, function(error, body, response) {
      expect(error).to.be.null();
      expect(body).to.be.equal(requestedPage);
      expect(response).to.be.equal(response);
      done();
    }, headers);

    this.clock.tick(7000); // tick the timeout
  });
});
