var request = require('./rp');
var sinon   = require('sinon');
var fs      = require('fs');
var path    = require('path');

var defaultParams = {
  // Since cloudscraper wraps the callback, just ensure callback is a function
  callback: sinon.match.func,
  requester: sinon.match.func,
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
      cache[fileName] = fs.readFileSync(path.join(__dirname, 'fixtures', fileName), 'utf8');
    }
    return cache[fileName];
  },
  defaultParams: defaultParams,
  fakeResponse: function(template) {
    return Object.assign({
      statusCode: 200,
      headers: defaultParams.headers,
      body: ''
    }, template);
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
      response: { statusCode: template.error ? 500 : 200 }
    }, template);

    // Use the body from fake response if the template doesn't provide it
    if (!('body' in fake)) {
      fake.body = fake.response.body;
    }

    // Freeze the fake result and it's properties for more reliable tests.
    Object.freeze(fake);
    Object.keys(fake).forEach(function (key) {
      if (!Object.isFrozen(fake[key]) && !Buffer.isBuffer(fake[key])) {
        // Mark all existing properties as non-configurable and non-writable.
        var target = fake[key];
        Object.keys(target).forEach(function (key) {
          var desc = Object.getOwnPropertyDescriptor(target, key);
          if (desc.configurable) {
            desc.configurable = false;
            if (desc.writable !== undefined) {
              desc.writable = false;
            }
            Object.defineProperty(target, key, desc);
          }
        });
      }
    });

    return function Request(params) {
      var instance = request(params);

      // This is a hack to prevent sending events to early. See #104
      Object.defineProperty(instance, 'cloudscraper', {
        set: function() {
          // Add the required convenience property to fake the response.
          fake.response.request = this;

          if (fake.error !== null) {
            this.emit('error', fake.error);
          } else {
            this.emit('complete', fake.response, fake.body);
          }
        },
        get: function() {
          return true;
        }
      });

      return instance;
    };
  }
};
