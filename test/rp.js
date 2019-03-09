'use strict';

// Reproduces: https://github.com/request/request-promise/blob/6d11ddc63dde2462a8e39cd8d0b6956556b977f1/lib/rp.js
// It must be done this way because request-promise bypasses require.cache.

var Bluebird = require('bluebird').getNewLibraryCopy();
var configure = require('request-promise-core/configure/request2');
var request = require('request');

// Replacing start with a noop prevents real requests from being made.
// Request -> Request.prototype.init -> Request.prototype.start
// The test/helper is responsible for calling back with a fake response.
request.Request.prototype.start = function () {};

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
