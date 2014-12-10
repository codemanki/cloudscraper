var helper       = require('../spec_helper'),
    request      = require('request');

describe('Cloudscraper', function() {
  var sandbox,
      url             = 'http://example-site.dev/path/',
      requestedPage   = helper.getFixture('requested_page.html'),
      jsChallengePage = helper.getFixture('js_challenge.html'),
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

  it('should return requested page, if cloudflare is disabled for page', function(done) {
    var response = { statusCode: 200 };

    // Stub first call, which request makes to page. It should return requested page
    sandbox.stub(requestDefault, 'get')
           .withArgs({url: url, headers: headers})
           .callsArgWith(1, null, response, requestedPage);

    cloudscraper.get(url, function(error, body, response) {
      expect(error).to.be.null();
      expect(body).to.be.equal(requestedPage);
      expect(response).to.be.equal(response);
      done();
    }, headers);

  });


  it('should resolve challenge and then return page', function(done) {
    var response = helper.fakeResponseObject(200, headers, jsChallengePage, url),
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
        'jschl_vc': '989bdb1d5d5c427471cf8051f4d2daff',
        'jschl_answer': 55072 + 'example-site.dev'.length // 55072 is a answer to cloudflares js challenge in this particular case
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
  });
});
