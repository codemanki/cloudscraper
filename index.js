var request      = require('request').defaults({jar: true}), // Cookies should be enabled
    UserAgent    = 'Ubuntu Chromium/34.0.1847.116 Chrome/34.0.1847.116 Safari/537.36',
    cloudscraper = {};

/**
 * Performs get request to url with headers.
 * @param  {String}    url
 * @param  {Function}  callback    function(error, body, response) {}
 * @param  {[Object}   headers     Hash with headers, e.g. {'Referer': 'http://google.com', 'User-Agent': '...'}
 */
cloudscraper.get = function(url, callback, headers) {
  headers = headers || {};

  if (!url || !callback) {
    throw new Error('To perform request, define both url and callback');
  }

  //If no ua is passed, add one
  if (!headers['User-Agent']) {
    headers['User-Agent'] = UserAgent;
  }

  performRequest(url, callback, headers);
};


function performRequest(url, callback, headers) {
  request({url: url, header: headers}, function(error, response, body) {

    // Error...
    if(error) {
      return callback(error, body, response);
    }

    // If body contains specified string, solve challenge
    if (body.indexOf('a = document.getElementById(\'jschl-answer\');') !== -1) {
      return solveChallenge(response, body, callback);
    }

    // All is good
    callback(error, body, response);
  });
}


function solveChallenge(response, body, callback) {
  var challenge = body.match(/name="jschl_vc" value="(\w+)"/),
      jsChlVc,
      answerResponse,
      answerUrl,
      host = response.request.host,
      headers = response.headers;

  if (!challenge) {
    throwErrorWithDetails('I cant extract challengeId (jschl_vc) from page');
  }

  jsChlVc = challenge[1];

  challenge = body.match(/setTimeout.+?\r?\n([\s\S]+?a\.value =.+?)\r?\n/i);

  if (!challenge) {
    throwErrorWithDetails('I cant extract method from setTimeOut wrapper');
  }

  challenge = challenge[1];

  challenge = challenge.replace(/a\.value =(.+?) \+ .+?;/i, '$1');

  challenge = challenge.replace(/\s{3,}[a-z](?: = |\.).+/g, '');

  try {
    answerResponse = { 'jschl_vc': jsChlVc, 'jschl_answer': (eval(challenge) + response.request.host.length) };
  } catch (err) {
    throwErrorWithDetails('Error occurred during evaluation: ' +  err.message);
  }


  answerUrl = response.request.uri.protocol + '//' + host + '/cdn-cgi/l/chk_jschl';

  headers['Referer'] = response.request.uri.href; // Original url should be placed as referer

  // Make request with answer
  request({
    url: answerUrl,
    qs: answerResponse,
    headers: headers
  }, function(error, response, body) {
    callback(error, body, response);
  });
}


function throwErrorWithDetails(text) {
  throw new Error('Something is wrong with CloudFlare page. ' + text);
}

module.exports = cloudscraper;
