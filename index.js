'use strict';

var vm = require('vm');
var requestModule = require('request-promise');
var errors = require('./errors');

var VM_OPTIONS = {
  contextOrigin: 'cloudflare:challenge.js',
  contextCodeGeneration: { strings: true, wasm: false },
  timeout: 5000
};

module.exports = defaults.call(requestModule);

function defaults (params) {
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
    .call(this, defaultParams, function (options) {
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
function performRequest (options, isFirstRequest) {
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
    throw new TypeError('Expected `challengesToSolve` option to be a number, ' +
      'got ' + typeof (options.challengesToSolve) + ' instead.');
  }

  if (isNaN(options.cloudflareTimeout)) {
    throw new TypeError('Expected `cloudflareTimeout` option to be a number, ' +
      'got ' + typeof (options.cloudflareTimeout) + ' instead.');
  }

  // This should be the default export of either request or request-promise.
  var requester = options.requester;

  if (typeof requester !== 'function') {
    throw new TypeError('Expected `requester` option to be a function, got ' +
        typeof (requester) + ' instead.');
  }

  var request = requester(options);

  // If the requester is not request-promise, ensure we get a callback.
  if (typeof request.callback !== 'function') {
    throw new TypeError('Expected a callback function, got ' +
        typeof (request.callback) + ' instead.');
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
function processRequestResponse (options, error, response, body) {
  var callback = options.callback;

  var stringBody;
  var isChallengePresent;
  var isRedirectChallengePresent;

  // Encoding is null so body should be a buffer object
  if (error || !body || !body.toString) {
    // Pure request error (bad connection, wrong url, etc)
    return callback(new errors.RequestError(error, options, response));
  }

  response.isCloudflare = response.statusCode > 399 &&
    /^cloudflare/i.test('' + response.caseless.get('server')) &&
    /text\/html/i.test('' + response.caseless.get('content-type'));

  // If body isn't a buffer, this is a custom response body.
  if (!Buffer.isBuffer(body)) {
    return callback(null, response, body);
  }

  if (response.isCloudflare) {
    if (body.length < 1) {
      // This is a 4xx-5xx Cloudflare response with an empty body.
      return callback(new errors.CloudflareError(response.statusCode, options, response));
    }

    stringBody = body.toString('utf8');

    try {
      validate(options, response, stringBody);
    } catch (error) {
      return callback(error);
    }
  }

  if (!response.isCloudflare || response.statusCode !== 503) {
    return processResponseBody(options, response, body);
  }

  // This is a Cloudflare response with 503 status, check for challenges.
  isChallengePresent = stringBody.indexOf('a = document.getElementById(\'jschl-answer\');') !== -1;
  isRedirectChallengePresent = stringBody.indexOf('You are being redirected') !== -1 || stringBody.indexOf('sucuri_cloudproxy_js') !== -1;
  // isTargetPage = !isChallengePresent && !isRedirectChallengePresent;

  if (isChallengePresent && options.challengesToSolve === 0) {
    var cause = 'Cloudflare challenge loop';
    error = new errors.CloudflareError(cause, options, response);
    error.errorType = 4;

    return callback(error);
  }

  // If body contains specified string, solve challenge
  if (isChallengePresent) {
    setTimeout(function () {
      solveChallenge(options, response, stringBody);
    }, options.cloudflareTimeout);
  } else if (isRedirectChallengePresent) {
    setCookieAndReload(options, response, stringBody);
  } else {
    // All is good
    processResponseBody(options, response, body);
  }
}

function validate (options, response, body) {
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

function solveChallenge (options, response, body) {
  var callback = options.callback;

  var uri = response.request.uri;
  // The JS challenge to be evaluated for answer/response.
  var challenge;
  // The query string to send back to Cloudflare
  // var payload = { s, jschl_vc, jschl_answer, pass };
  var payload = {};

  var match;
  var cause;

  var sandbox = createSandbox({ t: uri.hostname }, body);

  match = body.match(/name="s" value="(.+?)"/);

  if (match) {
    payload.s = match[1];
  }

  match = body.match(/name="jschl_vc" value="(\w+)"/);

  if (!match) {
    cause = 'challengeId (jschl_vc) extraction failed';
    return callback(new errors.ParserError(cause, options, response));
  }

  payload.jschl_vc = match[1];

  match = body.match(/getElementById\('cf-content'\)[\s\S]+?setTimeout.+?\r?\n([\s\S]+?a\.value\s*=.+?)\r?\n/);

  if (!match) {
    cause = 'setTimeout callback extraction failed';
    return callback(new errors.ParserError(cause, options, response));
  }

  challenge = match[1]
    .replace(/a\.value\s*=\s*(.*)/, function (_, value) {
      return value.replace(/[A-Za-z0-9_$]+\.length/, uri.hostname.length);
    })
    .replace(/^\s*[a-z0-9_$]+\s*[=.](.+)/gmi, function (_, expr) {
      // Retain the `k = "cf-dn-*" assignment
      var match = expr.match(/([A-Za-z0-9_$]+)\s*=\s*['"]?cf-dn.+/);
      return match !== null ? match[0] : '';
    })
    .replace(/'; \d+'/g, '');

  try {
    payload.jschl_answer = vm.runInNewContext(challenge, sandbox, VM_OPTIONS);
  } catch (error) {
    error.message = 'Challenge evaluation failed: ' + error.message;
    return callback(new errors.ParserError(error, options, response));
  }

  if (isNaN(payload.jschl_answer)) {
    cause = 'Challenge answer is not a number';
    return callback(new errors.ParserError(cause, options, response));
  }

  match = body.match(/name="pass" value="(.+?)"/);

  if (!match) {
    cause = 'Attribute (pass) value extraction failed';
    return callback(new errors.ParserError(cause, options, response));
  }

  payload.pass = match[1];

  // Prevent reusing the headers object to simplify unit testing.
  options.headers = Object.assign({}, options.headers);
  // Use the original uri as the referer and to construct the answer uri.
  options.headers['Referer'] = uri.href;
  options.uri = uri.protocol + '//' + uri.host + '/cdn-cgi/l/chk_jschl';
  // baseUrl can't be used in conjunction with an absolute uri
  if (options.baseUrl !== undefined) {
    options.baseUrl = undefined;
  }
  // Set the query string and decrement the number of challenges to solve.
  options.qs = payload;
  options.challengesToSolve = options.challengesToSolve - 1;

  // Make request with answer.
  performRequest(options, false);
}

function setCookieAndReload (options, response, body) {
  var callback = options.callback;

  var challenge = body.match(/S='([^']+)'/);
  if (!challenge) {
    var cause = 'Cookie code extraction failed';
    return callback(new errors.ParserError(cause, options, response));
  }

  var base64EncodedCode = challenge[1];
  var cookieSettingCode = Buffer.from(base64EncodedCode, 'base64').toString('ascii');

  var sandbox = createSandbox();

  try {
    vm.runInNewContext(cookieSettingCode, sandbox, VM_OPTIONS);

    options.jar.setCookie(sandbox.document.cookie, response.request.uri.href, { ignoreError: true });
  } catch (error) {
    error.message = 'Cookie code evaluation failed: ' + error.message;
    return callback(new errors.ParserError(error, options, response));
  }

  options.challengesToSolve = options.challengesToSolve - 1;

  performRequest(options, false);
}

function processResponseBody (options, response, body) {
  var callback = options.callback;

  if (typeof options.realEncoding === 'string') {
    body = body.toString(options.realEncoding);
    // The resolveWithFullResponse option will resolve with the response
    // object. This changes the response.body so it is as expected.
    response.body = body;

    if (response.isCloudflare) {
      // In case of real encoding, try to validate the response and find
      // potential errors there, otherwise return the response as is.
      try {
        validate(options, response, body);
      } catch (error) {
        return callback(error);
      }
    }
  }

  callback(null, response, body);
}

function createSandbox (context, body) {
  if (arguments.length > 1) {
    var cache = Object.create(null);
    var keys = [];

    // Sandbox for standard IUAM JS challenge
    return Object.assign({
      atob: function (str) {
        return Buffer.from(str, 'base64').toString('binary');
      },
      document: {
        getElementById: function (id) {
          if (keys.indexOf(id) === -1) {
            var re = new RegExp(' id=[\'"]?' + id + '[^>]*>([^<]+)');
            var match = body.match(re);

            keys.push(id);
            cache[id] = match === null ? match : { innerHTML: match[1] };
          }

          return cache[id];
        }
      }
    }, context);
  }

  // Sandbox used in setCookieAndReload
  return Object.assign({
    location: {
      reload: function () {}
    },
    document: {}
  }, context);
}
