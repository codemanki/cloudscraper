var vm = require('vm');
var requestModule = require('request');

var originalDefaults = requestModule.defaults;

module.exports = defaults.call(requestModule, {
  // Cookies should be enabled
  jar: requestModule.jar(),
  headers: {
    'User-Agent': 'Ubuntu Chromium/34.0.1847.116 Chrome/34.0.1847.116 Safari/537.36',
    'Cache-Control': 'private',
    'Accept': 'application/xml,application/xhtml+xml,text/html;q=0.9, text/plain;q=0.8,image/png,*/*;q=0.5'
  },
  // Cloudflare requires a delay of 5 seconds, so wait for at least 6.
  cloudflareTimeout: 6000,
  // followAllRedirects - follow non-GET HTTP 3xx responses as redirects
  followAllRedirects: true,
  // Support only this max challenges in row. If CF returns more, throw an error
  challengesToSolve: 3
});

function defaults(options) {
  var cloudscraper = originalDefaults.call(this, options, requester);

  if (requestModule === this) {
    cloudscraper.defaults = defaults;
  }
  // Expose the debug option
  Object.defineProperty(cloudscraper, 'debug',
      Object.getOwnPropertyDescriptor(this, 'debug'));

  return cloudscraper;
}

function requester(options, callback) {
  // Prevent overwriting realEncoding in subsequent calls
  if (!('realEncoding' in options)) {
    // Can't just do the normal options.encoding || 'utf8'
    // because null is a valid encoding.
    if ('encoding' in options) {
      options.realEncoding = options.encoding;
    } else {
      options.realEncoding = 'utf8';
    }
  }

  options.encoding = null;

  if (typeof callback !== 'function') {
    throw new TypeError('Expected a callback function, got '
      + typeof(callback) + ' instead.');
  }

  if (isNaN(options.challengesToSolve)) {
    throw new TypeError('Expected `challengesToSolve` option to be a number, '
      + 'got ' + typeof(options.challengesToSolve) + ' instead.');
  }

  requestModule(options, function(error, response, body) {
    processRequestResponse(options, {error: error, response: response, body: body}, callback);
  });
}

function processRequestResponse(options, requestResult, callback) {
  var error = requestResult.error;
  var response = requestResult.response;
  var body = requestResult.body;
  var validationError;
  var stringBody;
  var isChallengePresent;
  var isRedirectChallengePresent;

  if (error || !body || !body.toString) {
    return callback({ errorType: 0, error: error }, response, body);
  }

  stringBody = body.toString('utf8');

  if (validationError = checkForErrors(error, stringBody)) {
    return callback(validationError, response, body);
  }

  isChallengePresent = stringBody.indexOf('a = document.getElementById(\'jschl-answer\');') !== -1;
  isRedirectChallengePresent = stringBody.indexOf('You are being redirected') !== -1 || stringBody.indexOf('sucuri_cloudproxy_js') !== -1;
  // isTargetPage = !isChallengePresent && !isRedirectChallengePresent;

  if (isChallengePresent && options.challengesToSolve === 0) {
    return callback({ errorType: 4 }, response, body);
  }

  // If body contains specified string, solve challenge
  if (isChallengePresent) {
    setTimeout(function() {
      solveChallenge(response, stringBody, options, callback);
    }, options.cloudflareTimeout);
  } else if (isRedirectChallengePresent) {
    setCookieAndReload(response, stringBody, options, callback);
  } else {
    // All is good
    processResponseBody(options, error, response, body, callback);
  }
}

function checkForErrors(error, body) {
  var match;

  // Pure request error (bad connection, wrong url, etc)
  if(error) {
    return { errorType: 0, error: error };
  }

  // Finding captcha
  if (body.indexOf('why_captcha') !== -1 || /cdn-cgi\/l\/chk_captcha/i.test(body)) {
    return { errorType: 1 };
  }

  // trying to find '<span class="cf-error-code">1006</span>'
  match = body.match(/<\w+\s+class="cf-error-code">(.*)<\/\w+>/i);

  if (match) {
    return { errorType: 2, error: parseInt(match[1]) };
  }

  return false;
}

function solveChallenge(response, body, options, callback) {
  var challenge = body.match(/name="jschl_vc" value="(\w+)"/);
  var host = response.request.host;
  var jsChlVc;
  var answerResponse;
  var answerUrl;

  if (!challenge) {
    return callback({errorType: 3, error: 'I cant extract challengeId (jschl_vc) from page'}, response, body);
  }

  jsChlVc = challenge[1];

  challenge = body.match(/getElementById\('cf-content'\)[\s\S]+?setTimeout.+?\r?\n([\s\S]+?a\.value =.+?)\r?\n/i);

  if (!challenge) {
    return callback({errorType: 3, error: 'I cant extract method from setTimeOut wrapper'}, response, body);
  }

  var challenge_pass = body.match(/name="pass" value="(.+?)"/)[1];

  challenge = challenge[1];

  challenge = challenge.replace(/a\.value =(.+?) \+ .+?;/i, '$1');

  challenge = challenge.replace(/\s{3,}[a-z](?: = |\.).+/g, '');
  challenge = challenge.replace(/'; \d+'/g, '');

  try {
    answerResponse = {
      'jschl_vc': jsChlVc,
      'jschl_answer': (eval(challenge) + response.request.host.length),
      'pass': challenge_pass
    };
  } catch (err) {
    return callback({errorType: 3, error: 'Error occurred during evaluation: ' +  err.message}, response, body);
  }

  answerUrl = response.request.uri.protocol + '//' + host + '/cdn-cgi/l/chk_jschl';

  options.headers['Referer'] = response.request.uri.href; // Original url should be placed as referer
  options.url = answerUrl;
  options.qs = answerResponse;
  options.challengesToSolve = options.challengesToSolve - 1;

  // Make request with answer
  requester(options, callback);
}

function setCookieAndReload(response, body, options, callback) {
  var challenge = body.match(/S='([^']+)'/);

  if (!challenge) {
    return callback({errorType: 3, error: 'I cant extract cookie generation code from page'}, response, body);
  }

  var base64EncodedCode = challenge[1];
  var cookieSettingCode = new Buffer(base64EncodedCode, 'base64').toString('ascii');

  var sandbox = {
    location: {
      reload: function() {}
    },
    document: {}
  };

  vm.runInNewContext(cookieSettingCode, sandbox);

  try {
    options.jar.setCookie(sandbox.document.cookie, response.request.uri.href, {ignoreError: true});
  } catch (err) {
    return callback({errorType: 3, error: 'Error occurred during evaluation: ' +  err.message}, response, body);
  }

  options.challengesToSolve = options.challengesToSolve - 1;

  requester(options, callback);
}

function processResponseBody(options, error, response, body, callback) {
  if(typeof options.realEncoding === 'string') {
    body = body.toString(options.realEncoding);
    // In case of real encoding, try to validate the response
    // and find potential errors there.
    // If encoding is not provided, return response as it is
    if (validationError = checkForErrors(error, body)) {
      return callback(validationError, response, body);
    }
  }


  callback(error, response, body);
}