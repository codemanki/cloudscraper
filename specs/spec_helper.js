var fs = require('fs');
var urlLib = require('url');
var path = require('path');

var testDefaults = {
  url: 'http://example-site.dev/path/',
  headers: {'User-Agent': 'Chrome'}
};

module.exports = {
  getFixture: function(fileName) {
    return fs.readFileSync('./specs/fixtures/' + fileName, 'utf8');
  },
  testDefaults: testDefaults,
  // This method returns properly faked response object for request lib, which is used inside cloudscraper library
  fakeResponseObject: function(statusCode, headers, body, url) {
    var parsedUri = urlLib.parse(url);
    parsedUri.uri = parsedUri;

    return {
      statusCode: statusCode,
      headers: headers,
      body: body,
      request: parsedUri //actually this is more compilcated object, but library uses only uri parts.
    };
  },
  // Terrible hack. But because of request library API, it is impossible to normally stub it. That is why cloudscraper's index.js is removed from cache each time
  dropCache: function() {
    var pathToLib = path.normalize(__dirname + '/../index.js');
    if (require.cache[pathToLib]) {
      delete require.cache[pathToLib];
    }
  },
  requestParams: function(params) {
    return Object.assign({
      method: 'GET', 
      url: testDefaults.url, 
      headers: testDefaults.headers,
      encoding: null, 
      realEncoding: 'utf8', 
      followAllRedirects: true,
      challengesToSolve: 3
    }, params);
  }
};
