var vm = require('vm');
var requestModule = require('request-promise');
var errors = require('./errors');
var VM_OPTIONS = {
  timeout: 5000
};

module.exports = defaults.call(requestModule);

function defaults(params) {
  // isCloudScraper === !isRequestModule
  var isRequestModule = this === requestModule;

  var defaultParams = (!isRequestModule && this.defaultParams) || {
    requester: requestModule,
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
  };

  // Object.assign requires at least nodejs v4, request only test/supports v6+
  defaultParams = Object.assign({}, defaultParams, params);

  var cloudscraper = requestModule.defaults
      .call(this, defaultParams, function(options) {
        return performRequest(options, true);
      });

  // There's no safety net here, any changes apply to all future requests
  // that are made with this instance and derived instances.
  cloudscraper.defaultParams = defaultParams;

  // Ensure this instance gets a copy of our custom defaults function
  // and afterwards, it will be copied over automatically.
  if (isRequestModule) {
    cloudscraper.defaults = defaults;
  }
  // Expose the debug option
  Object.defineProperty(cloudscraper, 'debug',
      Object.getOwnPropertyDescriptor(this, 'debug'));

  return cloudscraper;
}

// This function is wrapped to ensure that we get new options on first call.
// The options object is reused in subsequent calls when calling it directly.
function performRequest(options, isFirstRequest) {
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

  if (isNaN(options.challengesToSolve)) {
    throw new TypeError('Expected `challengesToSolve` option to be a number, '
      + 'got ' + typeof(options.challengesToSolve) + ' instead.');
  }

  // This should be the default export of either request or request-promise.
  var requester = options.requester;

  if (typeof requester !== 'function') {
    throw new TypeError('Expected `requester` option to be a function, got '
        + typeof(requester) + ' instead.');
  }

  var request = requester(options);

  // If the requester is not request-promise, ensure we get a callback.
  if (typeof request.callback !== 'function') {
    throw new TypeError('Expected a callback function, got '
        + typeof(request.callback) + ' instead.');
  }

  // We only need the callback from the first request.
  // The other callbacks can be safely ignored.
  if (isFirstRequest) {
    // This should be a user supplied callback or request-promise's callback.
    // The callback is always wrapped/bound to the request instance.
    options.callback = request.callback;
  }

  // The error event only provides an error argument.
  request.removeAllListeners('error')
      .once('error', processRequestResponse.bind(null, options));
  // The complete event only provides response and body arguments.
  request.removeAllListeners('complete')
      .once('complete', processRequestResponse.bind(null, options, null));

  // Indicate that this is a cloudscraper request, required by test/helper.
  request.cloudscraper = true;
  return request;
}

// The argument convention is options first where possible, options
// always before response, and body always after response.
function processRequestResponse(options, error, response, body) {
  var callback = options.callback;

  var stringBody;
  var isChallengePresent;
  var isRedirectChallengePresent;

  if (error || !body || !body.toString) {
    // Pure request error (bad connection, wrong url, etc)
    error = new errors.RequestError(error, options, response);

    return callback(error, response, body);
  }

  stringBody = body.toString('utf8');

  try {
    validate(options, response, stringBody);
  } catch (error) {
    return callback(error, response, body);
  }

  isChallengePresent = stringBody.indexOf('a = document.getElementById(\'jschl-answer\');') !== -1;
  isRedirectChallengePresent = stringBody.indexOf('You are being redirected') !== -1 || stringBody.indexOf('sucuri_cloudproxy_js') !== -1;
  // isTargetPage = !isChallengePresent && !isRedirectChallengePresent;

  if (isChallengePresent && options.challengesToSolve === 0) {
    var cause = 'Cloudflare challenge loop';
    error = new errors.CloudflareError(cause, options, response);
    error.errorType = 4;

    return callback(error, response, body);
  }

  // If body contains specified string, solve challenge
  if (isChallengePresent) {
    setTimeout(function() {
      solveChallenge(options, response, stringBody);
    }, options.cloudflareTimeout);
  } else if (isRedirectChallengePresent) {
    setCookieAndReload(options, response, stringBody);
  } else {
    // All is good
    processResponseBody(options, response, body);
  }
}

function validate(options, response, body) {
  var match;

  // Finding captcha
  if (body.indexOf('why_captcha') !== -1 || /cdn-cgi\/l\/chk_captcha/i.test(body)) {
    throw new errors.CaptchaError('captcha', options, response);
  }

  // Trying to find '<span class="cf-error-code">1006</span>'
  match = body.match(/<\w+\s+class="cf-error-code">(.*)<\/\w+>/i);

  if (match) {
    var code = parseInt(match[1]);
    throw new errors.CloudflareError(code, options, response);
  }

  return false;
}

function solveChallenge(options, response, body) {
  var callback = options.callback;

  var challenge = body.match(/name="jschl_vc" value="(\w+)"/);
  var uri = response.request.uri;
  var jsChlVc;
  var answerResponse;
  var solvedChallenge;
  var error;
  var cause;

  if (!challenge) {
    cause = 'challengeId (jschl_vc) extraction failed';
    error = new errors.ParserError(cause, options, response);

    return callback(error, response, body);
  }

  jsChlVc = challenge[1];

  challenge = body.match(/getElementById\('cf-content'\)[\s\S]+?setTimeout.+?\r?\n([\s\S]+?a\.value =.+?)\r?\n/i);

  if (!challenge) {
    cause = 'setTimeout callback extraction failed';
    error = new errors.ParserError(cause, options, response);

    return callback(error, response, body);
  }

  var challenge_pass = body.match(/name="pass" value="(.+?)"/)[1];

  challenge = challenge[1];

  challenge = challenge.replace(/a\.value =(.+?) \+ .+?;/i, '$1');

  challenge = challenge.replace(/\s{3,}[a-z](?: = |\.).+/g, '');
  challenge = challenge.replace(/'; \d+'/g, '');

  try {
    solvedChallenge = vm.runInNewContext(challenge, Object.create(null), VM_OPTIONS);
  } catch (error) {
    error.message = 'Challenge evaluation failed: ' + error.message;
    error = new errors.ParserError(error, options, response);

    return callback(error, response, body);
  }

  answerResponse = {
    'jschl_vc': jsChlVc,
    'jschl_answer': (solvedChallenge + uri.hostname.length),
    'pass': challenge_pass
  };
  
  // Prevent reusing the headers object to simplify unit testing.
  options.headers = Object.assign({}, options.headers);
  // Use the original uri as the referer and to construct the answer url.
  options.headers['Referer'] = uri.href;
  options.uri = uri.protocol + '//' + uri.hostname + '/cdn-cgi/l/chk_jschl';
  options.qs = answerResponse;
  options.challengesToSolve = options.challengesToSolve - 1;

  // Make request with answer.
  performRequest(options, false);
}

function setCookieAndReload(options, response, body) {
  var callback = options.callback;

  var challenge = body.match(/S='([^']+)'/);
  if (!challenge) {
    var cause = 'Cookie code extraction failed';
    var error = new errors.ParserError(cause, options, response);

    return callback(error, response, body);
  }

  var base64EncodedCode = challenge[1];
  var cookieSettingCode = new Buffer(base64EncodedCode, 'base64').toString('ascii');

  var sandbox = {
    location: {
      reload: function() {}
    },
    document: {}
  };

  try {
    vm.runInNewContext(cookieSettingCode, sandbox, VM_OPTIONS);

    options.jar.setCookie(sandbox.document.cookie, response.request.uri.href, {ignoreError: true});
  } catch (error) {
    error.message = 'Cookie code evaluation failed: ' + error.message;
    error = new errors.ParserError(error, options, response);

    return callback(error, response, body);
  }

  options.challengesToSolve = options.challengesToSolve - 1;

  performRequest(options, false);
}

function processResponseBody(options, response, body) {
  var callback = options.callback;
  var error = null;

  if(typeof options.realEncoding === 'string') {
    body = body.toString(options.realEncoding);
    // The resolveWithFullResponse option will resolve with the response
    // object. This changes the response.body so it is as expected.
    response.body = body;

    // In case of real encoding, try to validate the response and find
    // potential errors there, otherwise return the response as is.
    try {
      validate(options, response, body);
    } catch (e) {
      error = e;
    }
  }

  callback(error, response, body);
}
