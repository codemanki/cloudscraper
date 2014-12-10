var fs = require('fs'),
    urlLib = require('url'),
    path = require('path');

module.exports = {
  getFixture: function(fileName) {
    return fs.readFileSync('./specs/fixtures/' + fileName, 'utf8');
  },

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
  }
};
