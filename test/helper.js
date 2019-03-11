var request  = require('./rp');
var sinon    = require('sinon');
var fs       = require('fs');
var path     = require('path');
var caseless = require('caseless');

var defaultParams = {
  // Since cloudscraper wraps the callback, just ensure callback is a function
  callback: sinon.match.func,
  requester: sinon.match.func,
  jar: request.jar(),
  uri: 'http://example-site.dev/path/',
  headers: {
    'User-Agent': 'Ubuntu Chromium/34.0.1847.116 Chrome/34.0.1847.116 Safari/537.36',
    'Cache-Control': 'private',
    'Accept': 'application/xml,application/xhtml+xml,text/html;q=0.9, text/plain;q=0.8,image/png,*/*;q=0.5'
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
  getFixture: function (fileName) {
    if (cache[fileName] === undefined) {
      cache[fileName] = fs.readFileSync(path.join(__dirname, 'fixtures', fileName));
    }
    return cache[fileName];
  },
  defaultParams: defaultParams,
  fakeResponse: function (template) {
    var response = Object.assign({
      statusCode: 200,
      body: Buffer.alloc(0)
    }, template);

    response.headers = Object.assign({}, defaultParams.headers, template.headers);

    response.caseless = caseless(response.headers);
    return response;
  },
  cloudflareResponse: function (template) {
    var response = Object.assign({
      statusCode: 503,
      body: Buffer.alloc(0)
    }, template);

    response.headers = Object.assign({}, defaultParams.headers, {
      'server': 'cloudflare',
      'content-type': 'text/html; charset=UTF-8'
    }, template.headers);

    response.caseless = caseless(response.headers);
    return response;
  },
  extendParams: function (params) {
    // Extend target with the default params and provided params
    var target = Object.assign({}, defaultParams, params);
    // Extend target.headers with defaults headers and provided headers
    target.headers = Object.assign({}, defaultParams.headers, params.headers);
    return target;
  },
  fakeRequest: function (template) {
    // In this context, fake is the request result
    var fake = Object.assign({ error: null }, template);

    if (!('response' in fake)) {
      fake.response = this.fakeResponse({
        // Set the default response statusCode to 500 if an error is provided
        statusCode: template.error ? 500 : 200
      });
    }

    // Use the body from fake response if the template doesn't provide it
    if (!('body' in fake)) {
      fake.body = fake.response.body;
    }

    return function Request (params) {
      var instance = request(params);

      // This is a hack to prevent sending events to early. See #104
      Object.defineProperty(instance, 'cloudscraper', {
        set: function () {
          // Add the required convenience property to fake the response.
          fake.response.request = this;

          if (fake.error !== null) {
            this.emit('error', fake.error);
          } else {
            this.emit('complete', fake.response, fake.body);
          }
        },
        get: function () {
          return true;
        }
      });

      return instance;
    };
  }
};
