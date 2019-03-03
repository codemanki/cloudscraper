'use strict';

// Reproduces: https://github.com/request/request-promise/blob/6d11ddc63dde2462a8e39cd8d0b6956556b977f1/lib/rp.js

// This library almost exactly reproduces the real rp library.
// The primary difference being that we're pre-patching the init method.
// It must be done this way because request-promise bypasses require.cache.

var Bluebird = require('bluebird').getNewLibraryCopy();
var configure = require('request-promise-core/configure/request2');
var request = require('request');

// The real rp library works by replacing this init function.
// It will store the original callback from options,
// apply our init function, and wrap the request instance's callback.
function init(options) {
  // Request -> Request.prototype.init -> Request.prototype.start
  // The test/helper is responsible for calling back with a fake response.
}

// Replacing init with a noop prevents real requests from being made.
request.Request.prototype.init = init;

configure({
  request: request,
  PromiseImpl: Bluebird,
  expose: [
    'then',
    'catch',
    'finally',
    'promise'
  ]
});

module.exports = request;
