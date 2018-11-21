var vm = require('vm');
var requestModule = require('request');
var jar = requestModule.jar();

var request      = requestModule.defaults({jar: jar}), // Cookies should be enabled
    UserAgent    = 'Ubuntu Chromium/34.0.1847.116 Chrome/34.0.1847.116 Safari/537.36',
    Timeout      = 6000, // Cloudflare requires a delay of 5 seconds, so wait for at least 6.
    cloudscraper = {};

/**
 * Performs get request to url with headers.
 * @param  {String}    url
 * @param  {Function}  callback    function(error, response, body) {}
 * @param  {Object}    headers     Hash with headers, e.g. {'Referer': 'http://google.com', 'User-Agent': '...'}
 */
cloudscraper.get = function(url, callback, headers) {
  performRequest({
    method: 'GET',
    url: url,
    headers: headers
  }, callback);
};

/**
 * Performs post request to url with headers.
 * @param  {String}        url
 * @param  {String|Object} body        Will be passed as form data
 * @param  {Function}      callback    function(error, response, body) {}
 * @param  {Object}        headers     Hash with headers, e.g. {'Referer': 'http://google.com', 'User-Agent': '...'}
 */
cloudscraper.post = function(url, body, callback, headers) {
  var data = '',
      bodyType = Object.prototype.toString.call(body);

  if(bodyType === '[object String]') {
    data = body;
  } else if (bodyType === '[object Object]') {
    data = Object.keys(body).map(function(key) {
      return key + '=' + body[key];
    }).join('&');
  }

  headers = headers || {};
  headers['Content-Type'] = headers['Content-Type'] || 'application/x-www-form-urlencoded; charset=UTF-8';
  headers['Content-Length'] = headers['Content-Length'] || data.length;

  performRequest({
    method: 'POST',
    body: data,
    url: url,
    headers: headers
  }, callback);
}

/**
 * Performs get or post request with generic request options
 * @param {Object}   options   Object to be passed to request's options argument
 * @param {Function} callback  function(error, response, body) {}
 */
cloudscraper.request = function(options, callback) {
  performRequest(options, callback);
}

function performRequest(options, callback) {
  var method;
  options = options || {};
  options.headers = options.headers || {};

  options.headers['Cache-Control'] = options.headers['Cache-Control'] || 'private';
  options.headers['Accept'] = options.headers['Accept'] || 'application/xml,application/xhtml+xml,text/html;q=0.9, text/plain;q=0.8,image/png,*/*;q=0.5';

  makeRequest = requestMethod(options.method);

  //Can't just do the normal options.encoding || 'utf8'
  //because null is a valid encoding.
  if('encoding' in options) {
    options.realEncoding = options.encoding;
  } else {
    options.realEncoding = 'utf8';
  }
  options.encoding = null;

  if (!options.url || !callback) {
    throw new Error('To perform request, define both url and callback');
  }

  options.headers['User-Agent'] = options.headers['User-Agent'] || UserAgent;

  makeRequest(options, function(error, response, body) {
    var validationError;
    var stringBody;

    if (error || !body || !body.toString) {
      return callback({ errorType: 0, error: error }, body, response);
    }

    stringBody = body.toString('utf8');

    if (validationError = checkForErrors(error, stringBody)) {
      return callback(validationError, body, response);
    }

    // If body contains specified string, solve challenge
    if (stringBody.indexOf('a = document.getElementById(\'jschl-answer\');') !== -1) {
      setTimeout(function() {
        return solveChallenge(response, stringBody, options, callback);
      }, Timeout);
    } else if (stringBody.indexOf('You are being redirected') !== -1 ||
               stringBody.indexOf('sucuri_cloudproxy_js') !== -1) {
      setCookieAndReload(response, stringBody, options, callback);
    } else {
      // All is good
      processResponseBody(options, error, response, body, callback);
    }
  });
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
  var challenge = body.match(/name="jschl_vc" value="(\w+)"/),
      host = response.request.host,
      makeRequest = requestMethod(options.method),
      jsChlVc,
      answerResponse,
      answerUrl;

  if (!challenge) {
    return callback({errorType: 3, error: 'I cant extract challengeId (jschl_vc) from page'}, body, response);
  }

  jsChlVc = challenge[1];

  challenge = body.match(/getElementById\('cf-content'\)[\s\S]+?setTimeout.+?\r?\n([\s\S]+?a\.value =.+?)\r?\n/i);

  if (!challenge) {
    return callback({errorType: 3, error: 'I cant extract method from setTimeOut wrapper'}, body, response);
  }

  challenge_pass = body.match(/name="pass" value="(.+?)"/)[1];

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
    return callback({errorType: 3, error: 'Error occurred during evaluation: ' +  err.message}, body, response);
  }

  answerUrl = response.request.uri.protocol + '//' + host + '/cdn-cgi/l/chk_jschl';

  options.headers['Referer'] = response.request.uri.href; // Original url should be placed as referer
  options.url = answerUrl;
  options.qs = answerResponse;

  // Make request with answer
  makeRequest(options, function(error, response, body) {

    if(error) {
      return callback({ errorType: 0, error: error }, response, body);
    }

    if(response.statusCode === 302) { //occurrs when posting. request is supposed to auto-follow these
                                      //by default, but for some reason it's not
      options.url = response.headers.location;
      delete options.qs;
      makeRequest(options, function(error, response, body) {
        processResponseBody(options, error, response, body, callback);
      });
    } else {
      processResponseBody(options, error, response, body, callback);
    }
  });
}

function setCookieAndReload(response, body, options, callback) {
  var challenge = body.match(/S='([^']+)'/);
  var makeRequest = requestMethod(options.method);

  if (!challenge) {
    return callback({errorType: 3, error: 'I cant extract cookie generation code from page'}, body, response);
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
    jar.setCookie(sandbox.document.cookie, response.request.uri.href, {ignoreError: true});
  } catch (err) {
    return callback({errorType: 3, error: 'Error occurred during evaluation: ' +  err.message}, body, response);
  }

  makeRequest(options, function(error, response, body) {
    if(error) {
      return callback({ errorType: 0, error: error }, response, body);
    }
    processResponseBody(options, error, response, body, callback);
  });
}

// Workaround for better testing. Request has pretty poor API
function requestMethod(method) {
  // For now only GET and POST are supported
  method = method.toUpperCase();

  return method === 'POST' ? request.post : request.get;
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

module.exports = cloudscraper;
