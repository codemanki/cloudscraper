'use strict';

const requestModule = require('request-promise');
const sandbox = require('./lib/sandbox');
const decodeEmails = require('./lib/email-decode.js');
const { getDefaultHeaders, caseless } = require('./lib/headers');
const brotli = require('./lib/brotli');
const crypto = require('crypto');
const { deprecate } = require('util');

const {
  RequestError,
  CaptchaError,
  CloudflareError,
  ParserError
} = require('./errors');

let debugging = false;

const HOST = Symbol('host');

module.exports = defaults.call(requestModule);

function defaults (params) {
  // isCloudScraper === !isRequestModule
  const isRequestModule = this === requestModule;

  let defaultParams = (!isRequestModule && this.defaultParams) || {
    requester: requestModule,
    // Cookies should be enabled
    jar: requestModule.jar(),
    headers: getDefaultHeaders({ Host: HOST }),
    // Reduce Cloudflare's timeout to cloudflareMaxTimeout if it is excessive
    cloudflareMaxTimeout: 30000,
    // followAllRedirects - follow non-GET HTTP 3xx responses as redirects
    followAllRedirects: true,
    // Support only this max challenges in row. If CF returns more, throw an error
    challengesToSolve: 3,
    // Remove Cloudflare's email protection
    decodeEmails: false,
    // Support gzip encoded responses
    gzip: true,
    agentOptions: {
      // Removes a few problematic TLSv1.0 ciphers to avoid CAPTCHA
      ciphers: crypto.constants.defaultCipherList + ':!ECDHE+SHA:!AES128-SHA'
    }
  };

  // Object.assign requires at least nodejs v4, request only test/supports v6+
  defaultParams = Object.assign({}, defaultParams, params);

  const cloudscraper = requestModule.defaults
    .call(this, defaultParams, function (options) {
      validateRequest(options);
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
  Object.defineProperty(cloudscraper, 'debug', {
    configurable: true,
    enumerable: true,
    set (value) {
      requestModule.debug = debugging = true;
    },
    get () {
      return debugging;
    }
  });

  return cloudscraper;
}

function validateRequest (options) {
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

  if (typeof options.requester !== 'function') {
    throw new TypeError('Expected `requester` option to be a function, got ' +
      typeof (options.requester) + ' instead.');
  }
}

// This function is wrapped to ensure that we get new options on first call.
// The options object is reused in subsequent calls when calling it directly.
function performRequest (options, isFirstRequest) {
  // This should be the default export of either request or request-promise.
  const requester = options.requester;

  // Note that request is always an instanceof ReadableStream, EventEmitter
  // If the requester is request-promise, it is also thenable.
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
    return callback(new RequestError(error, options, response));
  }

  const headers = caseless(response.headers);

  response.responseStartTime = Date.now();
  response.isCloudflare = /^(cloudflare|sucuri)/i.test('' + headers.server);
  response.isHTML = /text\/html/i.test('' + headers['content-type']);

  // If body isn't a buffer, this is a custom response body.
  if (!Buffer.isBuffer(body)) {
    return callback(null, response, body);
  }

  // Decompress brotli compressed responses
  if (/\bbr\b/i.test('' + headers['content-encoding'])) {
    if (!brotli.isAvailable) {
      const cause = 'Received a Brotli compressed response. Please install brotli';
      return callback(new RequestError(cause, options, response));
    }

    try {
      response.body = body = brotli.decompress(body);
    } catch (error) {
      return callback(new RequestError(error, options, response));
    }

    // Request doesn't handle brotli and would've failed to parse JSON.
    if (options.json) {
      try {
        response.body = body = JSON.parse(body, response.request._jsonReviver);
        // If successful, this isn't a challenge.
        return callback(null, response, body);
      } catch (error) {
        // Request's debug will log the failure, no need to duplicate.
      }
    }
  }

  if (response.isCloudflare && response.isHTML) {
    onCloudflareResponse(options, response, body);
  } else {
    onRequestComplete(options, response, body);
  }
}

function onCloudflareResponse (options, response, body) {
  const callback = options.callback;

  if (body.length < 1) {
    // This is a 4xx-5xx Cloudflare response with an empty body.
    return callback(new CloudflareError(response.statusCode, options, response));
  }

  const stringBody = body.toString('utf8');

  try {
    validateResponse(options, response, stringBody);
  } catch (error) {
    if (error instanceof CaptchaError && typeof options.onCaptcha === 'function') {
      // Give users a chance to solve the reCAPTCHA via services such as anti-captcha.com
      return onCaptcha(options, response, stringBody);
    }

    return callback(error);
  }

  const isChallenge = stringBody.indexOf('a = document.getElementById(\'jschl-answer\');') !== -1;

  if (isChallenge) {
    return onChallenge(options, response, stringBody);
  }

  const isRedirectChallenge = stringBody.indexOf('You are being redirected') !== -1 ||
    stringBody.indexOf('sucuri_cloudproxy_js') !== -1;

  if (isRedirectChallenge) {
    return onRedirectChallenge(options, response, stringBody);
  }

  // 503 status is always a challenge
  if (response.statusCode === 503) {
    return onChallenge(options, response, stringBody);
  }

  // All is good
  onRequestComplete(options, response, body);
}

function detectRecaptchaVersion (body) {
  // New version > Dec 2019
  if (/__cf_chl_captcha_tk__=(.*)/i.test(body)) { // Test for ver2 first, as it also has ver2 fields
    return 'ver2';
    // Old version < Dec 2019
  } else if (body.indexOf('why_captcha') !== -1 || /cdn-cgi\/l\/chk_captcha/i.test(body)) {
    return 'ver1';
  }

  return false;
}

function validateResponse (options, response, body) {
  // Finding captcha
  // Old version < Dec 2019
  const recaptchaVer = detectRecaptchaVersion(body);
  if (recaptchaVer) {
    // Convenience boolean
    response.isCaptcha = true;
    throw new CaptchaError('captcha', options, response);
  }

  // Trying to find '<span class="cf-error-code">1006</span>'
  const match = body.match(/<\w+\s+class="cf-error-code">(.*)<\/\w+>/i);

  if (match) {
    const code = parseInt(match[1]);
    throw new CloudflareError(code, options, response);
  }

  return false;
}

function onChallenge (options, response, body) {
  const callback = options.callback;
  const uri = response.request.uri;
  // The query string to send back to Cloudflare
  const payload = { /* s, jschl_vc, pass, jschl_answer */ };

  let cause;
  let error;

  if (options.challengesToSolve === 0) {
    cause = 'Cloudflare challenge loop';
    error = new CloudflareError(cause, options, response);
    error.errorType = 4;

    return callback(error);
  }

  let timeout = parseInt(options.cloudflareTimeout);
  let match;

  match = body.match(/name="(.+?)" value="(.+?)"/);

  if (match) {
    const hiddenInputName = match[1];
    payload[hiddenInputName] = match[2];
  }

  match = body.match(/name="jschl_vc" value="(\w+)"/);
  if (!match) {
    cause = 'challengeId (jschl_vc) extraction failed';
    return callback(new ParserError(cause, options, response));
  }

  payload.jschl_vc = match[1];

  match = body.match(/name="pass" value="(.+?)"/);
  if (!match) {
    cause = 'Attribute (pass) value extraction failed';
    return callback(new ParserError(cause, options, response));
  }

  payload.pass = match[1];

  match = body.match(/getElementById\('cf-content'\)[\s\S]+?setTimeout.+?\r?\n([\s\S]+?a\.value\s*=.+?)\r?\n(?:[^{<>]*},\s*(\d{4,}))?/);
  if (!match) {
    cause = 'setTimeout callback extraction failed';
    return callback(new ParserError(cause, options, response));
  }

  if (isNaN(timeout)) {
    if (match[2] !== undefined) {
      timeout = parseInt(match[2]);

      if (timeout > options.cloudflareMaxTimeout) {
        if (debugging) {
          console.warn('Cloudflare\'s timeout is excessive: ' + (timeout / 1000) + 's');
        }

        timeout = options.cloudflareMaxTimeout;
      }
    } else {
      cause = 'Failed to parse challenge timeout';
      return callback(new ParserError(cause, options, response));
    }
  }

  // Append a.value so it's always returned from the vm
  response.challenge = match[1] + '; a.value';

  try {
    const ctx = new sandbox.Context({ hostname: uri.hostname, body });
    payload.jschl_answer = sandbox.eval(response.challenge, ctx);
  } catch (error) {
    error.message = 'Challenge evaluation failed: ' + error.message;
    return callback(new ParserError(error, options, response));
  }

  if (isNaN(payload.jschl_answer)) {
    cause = 'Challenge answer is not a number';
    return callback(new ParserError(cause, options, response));
  }

  // Prevent reusing the headers object to simplify unit testing.
  options.headers = Object.assign({}, options.headers);
  // Use the original uri as the referer and to construct the answer uri.
  options.headers.Referer = uri.href;
  // Check is form to be submitted via GET or POST
  match = body.match(/id="challenge-form" action="(.+?)" method="(.+?)"/);
  if (match && match[2] && match[2] === 'POST') {
    options.uri = uri.protocol + '//' + uri.host + match[1];
    // Pass the payload using body form
    options.form = payload;
    options.method = 'POST';
  } else {
    // Whatever is there, fallback to GET
    options.uri = uri.protocol + '//' + uri.host + '/cdn-cgi/l/chk_jschl';
    // Pass the payload using query string
    options.qs = payload;
  }
  // Decrement the number of challenges to solve.
  options.challengesToSolve -= 1;
  // baseUrl can't be used in conjunction with an absolute uri
  if (options.baseUrl !== undefined) {
    options.baseUrl = undefined;
  }

  // Make request with answer after delay.
  timeout -= Date.now() - response.responseStartTime;
  setTimeout(performRequest, timeout, options, false);
}

// Parses the reCAPTCHA form and hands control over to the user
function onCaptcha (options, response, body) {
  const recaptchaVer = detectRecaptchaVersion(body);
  const isRecaptchaVer2 = recaptchaVer === 'ver2';
  const callback = options.callback;
  // UDF that has the responsibility of returning control back to cloudscraper
  const handler = options.onCaptcha;
  // The form data to send back to Cloudflare
  const payload = { /* r|s, g-re-captcha-response */ };

  let cause;
  let match;

  match = body.match(/<form(?: [^<>]*)? id=["']?challenge-form['"]?(?: [^<>]*)?>([\S\s]*?)<\/form>/);
  if (!match) {
    cause = 'Challenge form extraction failed';
    return callback(new ParserError(cause, options, response));
  }

  const form = match[1];

  let siteKey;
  let rayId; // only for ver 2

  if (isRecaptchaVer2) {
    match = body.match(/\sdata-ray=["']?([^\s"'<>&]+)/);
    if (!match) {
      cause = 'Unable to find cloudflare ray id';
      return callback(new ParserError(cause, options, response));
    }
    rayId = match[1];
  }

  match = body.match(/\sdata-sitekey=["']?([^\s"'<>&]+)/);
  if (match) {
    siteKey = match[1];
  } else {
    const keys = [];
    const re = /\/recaptcha\/api2?\/(?:fallback|anchor|bframe)\?(?:[^\s<>]+&(?:amp;)?)?[Kk]=["']?([^\s"'<>&]+)/g;

    while ((match = re.exec(body)) !== null) {
      // Prioritize the explicit fallback siteKey over other matches
      if (match[0].indexOf('fallback') !== -1) {
        keys.unshift(match[1]);
        if (!debugging) break;
      } else {
        keys.push(match[1]);
      }
    }

    siteKey = keys[0];

    if (!siteKey) {
      cause = 'Unable to find the reCAPTCHA site key';
      return callback(new ParserError(cause, options, response));
    }

    if (debugging) {
      console.warn('Failed to find data-sitekey, using a fallback:', keys);
    }
  }

  // Everything that is needed to solve the reCAPTCHA
  response.captcha = {
    siteKey,
    uri: response.request.uri,
    form: payload,
    version: recaptchaVer
  };

  if (isRecaptchaVer2) {
    response.rayId = rayId;

    match = body.match(/id="challenge-form" action="(.+?)" method="(.+?)"/);
    if (!match) {
      cause = 'Challenge form action and method extraction failed';
      return callback(new ParserError(cause, options, response));
    }
    response.captcha.formMethod = match[2];
    match = match[1].match(/\/(.*)/);
    response.captcha.formActionUri = match[0];
    payload.id = rayId;
  }

  Object.defineProperty(response.captcha, 'url', {
    configurable: true,
    enumerable: false,
    get: deprecate(function () {
      return response.request.uri.href;
    }, 'captcha.url is deprecated. Please use captcha.uri instead.')
  });

  // Adding formData
  match = form.match(/<input(?: [^<>]*)? name=[^<>]+>/g);
  if (!match) {
    cause = 'Challenge form is missing inputs';
    return callback(new ParserError(cause, options, response));
  }

  const inputs = match;
  // Only adding inputs that have both a name and value defined
  for (let name, value, i = 0; i < inputs.length; i++) {
    name = inputs[i].match(/name=["']?([^\s"'<>]*)/);
    if (name) {
      value = inputs[i].match(/value=["']?([^\s"'<>]*)/);
      if (value) {
        payload[name[1]] = value[1];
      }
    }
  }

  // Sanity check
  if (!payload.s && !payload.r) {
    cause = 'Challenge form is missing secret input';
    return callback(new ParserError(cause, options, response));
  }

  if (debugging) {
    console.warn('Captcha:', response.captcha);
  }

  // The callback used to green light form submission
  const submit = function (error) {
    if (error) {
      // Pass an user defined error back to the original request call
      return callback(new CaptchaError(error, options, response));
    }

    onSubmitCaptcha(options, response);
  };

  // This seems like an okay-ish API (fewer arguments to the handler)
  response.captcha.submit = submit;

  // We're handing control over to the user now.
  const thenable = handler(options, response, body);
  // Handle the case where the user returns a promise
  if (thenable && typeof thenable.then === 'function') {
    // eslint-disable-next-line promise/catch-or-return
    thenable.then(submit, function (error) {
      if (!error) {
        // The user broke their promise with a falsy error
        submit(new Error('Falsy error'));
      } else {
        submit(error);
      }
    });
  }
}

function onSubmitCaptcha (options, response) {
  const callback = options.callback;
  const uri = response.request.uri;
  const isRecaptchaVer2 = response.captcha.version === 'ver2';

  if (!response.captcha.form['g-recaptcha-response']) {
    const cause = 'Form submission without g-recaptcha-response';
    return callback(new CaptchaError(cause, options, response));
  }

  if (isRecaptchaVer2) {
    options.qs = {
      __cf_chl_captcha_tk__: response.captcha.formActionUri.match(/__cf_chl_captcha_tk__=(.*)/)[1]
    };

    options.form = response.captcha.form;
  } else {
    options.qs = response.captcha.form;
  }

  options.method = response.captcha.formMethod || 'GET';

  // Prevent reusing the headers object to simplify unit testing.
  options.headers = Object.assign({}, options.headers);
  // Use the original uri as the referer and to construct the form action.
  options.headers.Referer = uri.href;
  if (isRecaptchaVer2) {
    options.uri = uri.protocol + '//' + uri.host + response.captcha.formActionUri;
  } else {
    options.uri = uri.protocol + '//' + uri.host + '/cdn-cgi/l/chk_captcha';
  }

  performRequest(options, false);
}

function onRedirectChallenge (options, response, body) {
  const callback = options.callback;
  const uri = response.request.uri;

  const match = body.match(/S='([^']+)'/);
  if (!match) {
    const cause = 'Cookie code extraction failed';
    return callback(new ParserError(cause, options, response));
  }

  const base64EncodedCode = match[1];
  response.challenge = Buffer.from(base64EncodedCode, 'base64').toString('ascii');

  try {
    // Evaluate cookie setting code
    const ctx = new sandbox.Context();
    sandbox.eval(response.challenge, ctx);

    options.jar.setCookie(ctx.document.cookie, uri.href, { ignoreError: true });
  } catch (error) {
    error.message = 'Cookie code evaluation failed: ' + error.message;
    return callback(new ParserError(error, options, response));
  }

  options.challengesToSolve -= 1;

  performRequest(options, false);
}

function onRequestComplete (options, response, body) {
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
