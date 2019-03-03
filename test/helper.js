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
      // The promise returned by request-promise won't resolve until
      // it's callback is called. The problem is that we need to callback
      // after the constructor returns to simulate a real request/response.
      var instance = request(params);

      // This is the callback that cloudscraper should replace.
      var callback = instance.callback;

      // We don't want to callback with the fake result until
      // after the constructor returns thus define a property getter/setter
      // and wait for cloudscraper to set it's own callback.
      Object.defineProperty(instance, 'callback', {
        get: function() {
          // Returns request-promise's callback.
          return callback;
        },
        set: function(callback) {
          // Add the final property needed to fake the response.
          fake.response.request = instance;
          // This won't callback unless cloudscraper replaces the callback.
          callback(fake.error, fake.response, fake.body);
        }
      });

      return instance;
    };
  }
};
