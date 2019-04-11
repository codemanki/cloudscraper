'use strict';

var vm = require('vm');
var requestModule = require('request-promise');
var errors = require('./errors');
var decodeEmails = require('./lib/email-decode.js');

var USER_AGENTS = [
  'Ubuntu Chromium/34.0.1847.116 Chrome/34.0.1847.116 Safari/537.36',
  'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.21 (KHTML, like Gecko) konqueror/4.14.10 Safari/537.21',
  'Mozilla/5.0 (iPad; CPU OS 5_1 like Mac OS X) AppleWebKit/534.46 (KHTML, like Gecko ) Version/5.1 Mobile/9B176 Safari/7534.48.3',
  'Mozilla/5.0 (iPad; U; CPU OS 3_2 like Mac OS X; en-us) AppleWebKit/531.21.10 (KHTML, like Gecko) Version/4.0.4 Mobile/7B334b Safari/531.21.10',
  'Mozilla/5.0 (compatible; MSIE 9.0; Windows NT 6.1; WOW64; Trident/5.0; SLCC2; Media Center PC 6.0; InfoPath.3; MS-RTC LM 8; Zune 4.7)',
  'Mozilla/5.0 (Windows Phone 8.1; ARM; Trident/7.0; Touch; rv:11.0; IEMobile/11.0; NOKIA; Lumia 630) like Gecko',
  'Mozilla/5.0 (compatible; MSIE 10.0; Windows Phone 8.0; Trident/6.0; IEMobile/10.0; ARM; Touch; NOKIA; Lumia 920)',
  'Mozilla/5.0 (Linux; U; Android 2.2; en-us; Sprint APA9292KT Build/FRF91) AppleWebKit/533.1 (KHTML, like Gecko) Version/4.0 Mobile Safari/533.1',
  'Mozilla/5.0 (X11; Linux x86_64; rv:2.2a1pre) Gecko/20100101 Firefox/4.2a1pre',
  'Mozilla/5.0 (SymbianOS/9.1; U; en-us) AppleWebKit/413 (KHTML, like Gecko) Safari/413 es65',
  'Mozilla/5.0 (Linux; Android 6.0; Nexus 5X Build/MDB08L) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/53.0.2785.124 Mobile Safari/537.36',
  'Mozilla/5.0 (X11; U; FreeBSD i386; de-CH; rv:1.9.2.8) Gecko/20100729 Firefox/3.6.8'
];

var DEFAULT_USER_AGENT = randomUA();

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
      'Connection': 'keep-alive',
      'User-Agent': DEFAULT_USER_AGENT,
      'Cache-Control': 'private',
      'Accept': 'application/xml,application/xhtml+xml,text/html;q=0.9, text/plain;q=0.8,image/png,*/*;q=0.5',
      'Accept-Language': 'en-US,en;q=0.9'
    },
    // Reduce Cloudflare's timeout to cloudflareMaxTimeout if it is excessive
    cloudflareMaxTimeout: 30000,
    // followAllRedirects - follow non-GET HTTP 3xx responses as redirects
    followAllRedirects: true,
    // Support only this max challenges in row. If CF returns more, throw an error
    challengesToSolve: 3,
    // Remove Cloudflare's email protection
    decodeEmails: false
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

  if (isNaN(options.cloudflareMaxTimeout)) {
    throw new TypeError('Expected `cloudflareMaxTimeout` option to be a number, ' +
      'got ' + typeof (options.cloudflareMaxTimeout) + ' instead.');
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

  request.removeAllListeners('error')
    .once('error', function (error) {
      onRequestResponse(options, error);
    });

  request.removeAllListeners('complete')
    .once('complete', function (response, body) {
      onRequestResponse(options, null, response, body);
    });

  // Indicate that this is a cloudscraper request, required by test/helper.
  request.cloudscraper = true;
  return request;
}

// The argument convention is options first where possible, options
// always before response, and body always after response.
function onRequestResponse (options, error, response, body) {
  var callback = options.callback;

  // Encoding is null so body should be a buffer object
  if (error || !body || !body.toString) {
    // Pure request error (bad connection, wrong url, etc)
    return callback(new errors.RequestError(error, options, response));
  }

  response.responseStartTime = Date.now();
  response.isCloudflare = /^cloudflare/i.test('' + response.caseless.get('server'));
  response.isHTML = /text\/html/i.test('' + response.caseless.get('content-type'));

  // If body isn't a buffer, this is a custom response body.
  if (!Buffer.isBuffer(body)) {
    return callback(null, response, body);
  }

  if (response.isCloudflare && response.isHTML) {
    onCloudflareResponse(options, response, body);
  } else {
    processResponseBody(options, response, body);
  }
}

function onCloudflareResponse (options, response, body) {
  var callback = options.callback;

  var stringBody;
  var isChallenge;
  var isRedirectChallenge;

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

  isChallenge = stringBody.indexOf('a = document.getElementById(\'jschl-answer\');') !== -1;

  if (isChallenge) {
    return solveChallenge(options, response, stringBody);
  }

  isRedirectChallenge = stringBody.indexOf('You are being redirected') !== -1 ||
    stringBody.indexOf('sucuri_cloudproxy_js') !== -1;

  if (isRedirectChallenge) {
    return setCookieAndReload(options, response, stringBody);
  }

  // 503 status is always a challenge
  if (response.statusCode === 503) {
    return solveChallenge(options, response, stringBody);
  }

  // All is good
  processResponseBody(options, response, body);
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
  var cause;
  var error;

  if (options.challengesToSolve === 0) {
    cause = 'Cloudflare challenge loop';
    error = new errors.CloudflareError(cause, options, response);
    error.errorType = 4;

    return callback(error);
  }

  var timeout = parseInt(options.cloudflareTimeout);
  var uri = response.request.uri;
  // The query string to send back to Cloudflare
  // var payload = { s, jschl_vc, pass, jschl_answer };
  var payload = {};
  var sandbox;
  var match;

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

  match = body.match(/name="pass" value="(.+?)"/);

  if (!match) {
    cause = 'Attribute (pass) value extraction failed';
    return callback(new errors.ParserError(cause, options, response));
  }

  payload.pass = match[1];

  match = body.match(/getElementById\('cf-content'\)[\s\S]+?setTimeout.+?\r?\n([\s\S]+?a\.value\s*=.+?)\r?\n(?:[^{<>]*},\s*(\d{4,}))?/);

  if (!match) {
    cause = 'setTimeout callback extraction failed';
    return callback(new errors.ParserError(cause, options, response));
  }

  if (isNaN(timeout)) {
    if (match.length > 1) {
      timeout = parseInt(match[2]);

      if (timeout > options.cloudflareMaxTimeout) {
        if (requestModule.debug) {
          console.warn('Cloudflare\'s timeout is excessive: ' + (timeout / 1000) + 's');
        }

        timeout = options.cloudflareMaxTimeout;
      }
    } else {
      cause = 'Failed to parse challenge timeout';
      return callback(new errors.ParserError(cause, options, response));
    }
  }

  // Append a.value so it's always returned from the vm
  response.challenge = match[1] + '; a.value';

  try {
    sandbox = createSandbox({ uri: uri, body: body });
    payload.jschl_answer = vm.runInNewContext(response.challenge, sandbox, VM_OPTIONS);
  } catch (error) {
    error.message = 'Challenge evaluation failed: ' + error.message;
    return callback(new errors.ParserError(error, options, response));
  }

  if (isNaN(payload.jschl_answer)) {
    cause = 'Challenge answer is not a number';
    return callback(new errors.ParserError(cause, options, response));
  }

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

  // Make request with answer after delay.
  timeout -= Date.now() - response.responseStartTime;
  setTimeout(performRequest, timeout, options, false);
}

function setCookieAndReload (options, response, body) {
  var callback = options.callback;

  var match = body.match(/S='([^']+)'/);

  if (!match) {
    var cause = 'Cookie code extraction failed';
    return callback(new errors.ParserError(cause, options, response));
  }

  var base64EncodedCode = match[1];
  response.challenge = Buffer.from(base64EncodedCode, 'base64').toString('ascii');

  try {
    var sandbox = createSandbox({});
    // Evaluate cookie setting code
    vm.runInNewContext(response.challenge, sandbox, VM_OPTIONS);

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

    if (response.isHTML && options.decodeEmails) {
      body = decodeEmails(body);
    }

    response.body = body;
  }

  callback(null, response, body);
}

function createSandbox (options) {
  if (options.body) {
    var body = options.body;
    var href = 'http://' + options.uri.hostname + '/';
    var cache = Object.create(null);
    var keys = [];

    // Sandbox for standard IUAM JS challenge
    return Object.assign({
      atob: function (str) {
        return Buffer.from(str, 'base64').toString('binary');
      },
      document: {
        createElement: function () {
          return { firstChild: { href: href } };
        },
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
    }, options.context);
  }

  // Sandbox used in setCookieAndReload
  return Object.assign({
    location: {
      reload: function () {}
    },
    document: {}
  }, options.context);
}

function randomUA () {
  return USER_AGENTS[Math.floor(Math.random() * USER_AGENTS.length)];
}
