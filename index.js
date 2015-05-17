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
  request.get({url: url, headers: headers}, function(error, response, body) {
    var validationError;

    if (validationError = checkForErrors(error, body)) {
      return callback(validationError, body, response);
    }

    // If body contains specified string, solve challenge
    if (body.indexOf('a = document.getElementById(\'jschl-answer\');') !== -1) {
      return solveChallenge(response, body, callback);
    }

    // All is good
    callback(error, response, body);
  });
}

function checkForErrors(error, body) {
  var match;

  // Pure request error (bad connection, wrong url, etc)
  if(error) {
    return { errorType: 0, error: error };
  }

  // Finding captcha
  if (body.indexOf('why_captcha') !== -1 || /recaptcha/i.test(body)) {
    return { errorType: 1 };
  }

  // trying to find '<span class="cf-error-code">1006</span>'
  match = body.match(/<\w+\s+class="cf-error-code">(.*)<\/\w+>/i);

  if (match) {
    return { errorType: 2, error: parseInt(match[1]) };
  }

  return false;
}


function solveChallenge(response, body, callback) {
  var challenge = body.match(/name="jschl_vc" value="(\w+)"/),
      jsChlVc,
      answerResponse,
      answerUrl,
      host = response.request.host,
      headers = response.headers;

  if (!challenge) {
    return callback({errorType: 3, error: 'I cant extract challengeId (jschl_vc) from page'}, body, response);
  }

  jsChlVc = challenge[1];

  challenge = body.match(/getElementById\('cf-content'\)[\s\S]+?setTimeout.+?\r?\n([\s\S]+?a\.value =.+?)\r?\n/i);

  if (!challenge) {
    return callback({errorType: 3, error: 'I cant extract method from setTimeOut wrapper'}, body, response);
  }

  challenge = challenge[1];

  challenge = challenge.replace(/a\.value =(.+?) \+ .+?;/i, '$1');

  challenge = challenge.replace(/\s{3,}[a-z](?: = |\.).+/g, '');

  try {
    answerResponse = { 'jschl_vc': jsChlVc, 'jschl_answer': (eval(challenge) + response.request.host.length) };
  } catch (err) {
    return callback({errorType: 3, error: 'Error occurred during evaluation: ' +  err.message}, body, response);
  }

  answerUrl = response.request.uri.protocol + '//' + host + '/cdn-cgi/l/chk_jschl';

  headers['Referer'] = response.request.uri.href; // Original url should be placed as referer

  // Make request with answer
  request.get({
    url: answerUrl,
    qs: answerResponse,
    headers: headers
  }, function(error, response, body) {
    callback(error, body, response);
  });
}

module.exports = cloudscraper;
