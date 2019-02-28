var request = require('request-promise');
var sinon   = require('sinon');
var fs      = require('fs');
var url     = require('url');
var path    = require('path');

var defaultParams = {
  // Since cloudscraper wraps the callback, just ensure callback is a function
  callback: sinon.match.func,
  requester: request,
  jar: request.jar(),
  uri: 'http://example-site.dev/path/',
  headers: {
    "User-Agent": "Ubuntu Chromium/34.0.1847.116 Chrome/34.0.1847.116 Safari/537.36",
    "Cache-Control": "private",
    "Accept": "application/xml,application/xhtml+xml,text/html;q=0.9, text/plain;q=0.8,image/png,*/*;q=0.5"
  },
  method: 'GET',
  encoding: null,
  realEncoding: 'utf8',
  followAllRedirects: true,
  cloudflareTimeout: 6000,
  challengesToSolve: 3
};

// Cache fixtures so they're not read from the fs but once
var cache = {};

module.exports = {
  getFixture: function(fileName) {
    if (cache[fileName] === undefined) {
      // noinspection JSUnresolvedVariable
      cache[fileName] = fs.readFileSync(path.join(__dirname, 'fixtures', fileName), 'utf8');
    }
    return cache[fileName];
  },
  defaultParams: defaultParams,
  // This method returns properly faked response object for request lib, which is used inside cloudscraper library
  fakeResponse: function(template) {
    var fake = Object.assign({
      statusCode: 200,
      headers: defaultParams.headers,
      body: '',
    }, template);

    // The uri property of the fake response is only for tests to simplify fake request creation.
    var uri = url.parse(fake.uri || defaultParams.uri);
    // The actual request object is more complicated but this library only uses the uri parts.
    fake.request = {
      host: uri.host,
      uri: uri
    };

    return fake;
  },
  extendParams: function(params) {
    // Extend target with the default params and provided params
    var target = Object.assign({}, defaultParams, params);
    // Extend target.headers with defaults headers and provided headers
    target.headers = Object.assign({}, defaultParams.headers, params.headers);
    return target;
  },
  fakeRequest: function(template) {
    // In this context, fake is the request result
    var fake = Object.assign({
      error: null,
      // Set the default fake statusCode to 500 if an error is provided
      response: { statusCode: template.error ? 500 : 200 },
    }, template);

    // Use the body from fake response if the template doesn't provide it
    if (!('body' in fake)) {
      fake.body = fake.response.body;
    }

    return function Request(params) {
      return Object.defineProperty({}, 'callback', {
        get: function() {
          // Return the callback function that is to be replaced.
          return params.callback;
        },
        set: function(callback) {
          // Don't callback until after cloudscraper replaces the callback function.
          callback(fake.error, fake.response, fake.body);
        }
      });
    };
  }
};
