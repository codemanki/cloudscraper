var request = require('request-promise');
var sinon   = require('sinon');
var fs      = require('fs');
var url     = require('url');
var path    = require('path');
var express = require('express');

// Clone the default headers for tests
var defaultHeaders = Object.assign({}, require('../').defaultParams.headers);

// Cache fixtures so they're only read from fs but once
var cache = {};

var helper = {
  app: express(),
  reset: function () {
    helper.router = new express.Router();

    helper.defaultParams = {
      // Since cloudscraper wraps the callback, just ensure callback is a function
      callback: sinon.match.func,
      requester: sinon.match.func,
      jar: request.jar(),
      uri: helper.resolve('/test'),
      headers: Object.assign({}, defaultHeaders),
      method: 'GET',
      encoding: null,
      realEncoding: 'utf8',
      followAllRedirects: true,
      cloudflareTimeout: 1,
      cloudflareMaxTimeout: 30000,
      challengesToSolve: 3,
      decodeEmails: false,
      gzip: true
    };
  },
  getFixture: function (fileName) {
    var key = fileName;

    if (cache[key] === undefined) {
      fileName = path.join(__dirname, 'fixtures', fileName);
      cache[key] = fs.readFileSync(fileName, 'utf8');
    }

    return cache[key];
  },
  extendParams: function (params) {
    var defaultParams = this.defaultParams;

    // Extend target with the default params and provided params
    var target = {};
    Object.assign(target, defaultParams, params);
    // Extend target.headers with defaults headers and provided headers
    target.headers = {};
    Object.assign(target.headers, defaultParams.headers, params.headers);

    return target;
  },
  resolve: function (uri) {
    // eslint-disable-next-line node/no-deprecated-api
    return url.resolve(helper.uri.href, uri);
  },
  listen: function (callback) {
    helper.server = helper.app.listen(0, '127.0.0.1', function () {
      var baseUrl = 'http://127.0.0.1:' + helper.server.address().port;

      // eslint-disable-next-line node/no-deprecated-api
      helper.uri = url.parse(baseUrl + '/');
      helper.reset();
      callback();
    });
  }
};

helper.app.use(function (req, res, next) {
  helper.router(req, res, next);
});

express.response.cloudflare = function () {
  this.header('Server', 'cloudflare');
  this.header('Content-Type', 'text/html; charset=UTF-8');
  return this;
};

express.response.sendFixture = function (fileName) {
  return this.send(helper.getFixture(fileName));
};

express.response.sendChallenge = function (fileName) {
  return this.cloudflare().status(503).sendFixture(fileName);
};

express.response.endAbruptly = function () {
  this.connection.write(
    'HTTP/1.1 500\r\n' +
    'Content-Type: text/plain\r\n' +
    'Transfer-Encoding: chunked\r\n\r\n'
  );
  this.end();
};

module.exports = helper;
