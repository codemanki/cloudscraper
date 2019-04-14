'use strict';

const vm = require('vm');
const requestModule = require('request-promise');
const errors = require('./errors');
const decodeEmails = require('./lib/email-decode.js');
const getDefaultHeaders = require('./lib/headers');
const brotli = require('./lib/brotli');

const HOST = Symbol('host');

const VM_OPTIONS = {
  contextOrigin: 'cloudflare:challenge.js',
  contextCodeGeneration: { strings: true, wasm: false },
  timeout: 5000
};

module.exports = defaults.call(requestModule);

function defaults (params) {
  // isCloudScraper === !isRequestModule
  const isRequestModule = this === requestModule;

  let defaultParams = (!isRequestModule && this.defaultParams) || {
    requester: requestModule,
    // Cookies should be enabled
    jar: requestModule.jar(),
    headers: getDefaultHeaders({ 'Host': HOST }),
    // Reduce Cloudflare's timeout to cloudflareMaxTimeout if it is excessive
    cloudflareMaxTimeout: 30000,
    // followAllRedirects - follow non-GET HTTP 3xx responses as redirects
    followAllRedirects: true,
    // Support only this max challenges in row. If CF returns more, throw an error
    challengesToSolve: 3,
    // Remove Cloudflare's email protection
    decodeEmails: false,
    // Support gzip encoded responses
    gzip: true
  };

  // Object.assign requires at least nodejs v4, request only test/supports v6+
  defaultParams = Object.assign({}, defaultParams, params);

  const cloudscraper = requestModule.defaults
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
  const requester = options.requester;

  if (typeof requester !== 'function') {
    throw new TypeError('Expected `requester` option to be a function, got ' +
        typeof (requester) + ' instead.');
  }

  const request = requester(options);

  // We must define the host header ourselves to preserve case and order.
  if (request.getHeader('host') === HOST) {
    request.setHeader('host', request.uri.host);
  }

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

  // Indicate that this is a cloudscraper request
  request.cloudscraper = true;
  return request;
}

// The argument convention is options first where possible, options
// always before response, and body always after response.
function onRequestResponse (options, error, response, body) {
  const callback = options.callback;

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

  // Decompress brotli compressed responses
  if (/\bbr\b/i.test('' + response.caseless.get('content-encoding'))) {
    if (!brotli.isAvailable) {
      const cause = 'Received a Brotli compressed response. Please install brotli';
      return callback(new errors.RequestError(cause, options, response));
    }

    response.body = body = brotli.decompress(body);
  }

  if (response.isCloudflare && response.isHTML) {
    onCloudflareResponse(options, response, body);
  } else {
    processResponseBody(options, response, body);
  }
}

function onCloudflareResponse (options, response, body) {
  const callback = options.callback;

  let stringBody;
  let isChallenge;
  let isRedirectChallenge;

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
  let match;

  // Finding captcha
  if (body.indexOf('why_captcha') !== -1 || /cdn-cgi\/l\/chk_captcha/i.test(body)) {
    throw new errors.CaptchaError('captcha', options, response);
  }

  // Trying to find '<span class="cf-error-code">1006</span>'
  match = body.match(/<\w+\s+class="cf-error-code">(.*)<\/\w+>/i);

  if (match) {
    let code = parseInt(match[1]);
    throw new errors.CloudflareError(code, options, response);
  }

  return false;
}

function solveChallenge (options, response, body) {
  const callback = options.callback;
  const uri = response.request.uri;
  // The query string to send back to Cloudflare
  const payload = { /* s, jschl_vc, pass, jschl_answer */ };

  let cause;
  let error;

  if (options.challengesToSolve === 0) {
    cause = 'Cloudflare challenge loop';
    error = new errors.CloudflareError(cause, options, response);
    error.errorType = 4;

    return callback(error);
  }

  let timeout = parseInt(options.cloudflareTimeout);
  let sandbox;
  let match;

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
    if (match.length > 2) {
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
  const callback = options.callback;

  const match = body.match(/S='([^']+)'/);

  if (!match) {
    const cause = 'Cookie code extraction failed';
    return callback(new errors.ParserError(cause, options, response));
  }

  const base64EncodedCode = match[1];
  response.challenge = Buffer.from(base64EncodedCode, 'base64').toString('ascii');

  try {
    const sandbox = createSandbox();
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
  const callback = options.callback;

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

function createSandbox (options = {}) {
  if (options.body) {
    const body = options.body;
    const href = 'http://' + options.uri.hostname + '/';
    const cache = Object.create(null);
    const keys = [];

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
            const re = new RegExp(' id=[\'"]?' + id + '[^>]*>([^<]*)');
            const match = body.match(re);

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
