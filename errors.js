'use strict';

// The purpose of this library:
// 1. Have errors consistent with request/promise-core
// 2. Prevent request/promise core from wrapping our errors
// 3. Create descriptive errors.

// There are two differences between these errors and the originals.
// 1. There is a non-enumerable errorType attribute.
// 2. The error constructor is hidden from the stacktrace.

const EOL = require('os').EOL;
const original = require('request-promise-core/errors');
const http = require('http');

const BUG_REPORT = format([
  '### Cloudflare may have changed their technique, or there may be a bug.',
  '### Bug Reports: https://github.com/codemanki/cloudscraper/issues',
  '### Check the detailed exception message that follows for the cause.'
]);

const ERROR_CODES = {
  // Non-standard 5xx server error HTTP status codes
  520: 'Web server is returning an unknown error',
  521: 'Web server is down',
  522: 'Connection timed out',
  523: 'Origin is unreachable',
  524: 'A timeout occurred',
  525: 'SSL handshake failed',
  526: 'Invalid SSL certificate',
  527: 'Railgun Listener to Origin Error',
  530: 'Origin DNS error',
  // Other codes
  1000: 'DNS points to prohibited IP',
  1001: 'DNS resolution error',
  1002: 'Restricted or DNS points to Prohibited IP',
  1003: 'Access Denied: Direct IP Access Not Allowed',
  1004: 'Host Not Configured to Serve Web Traffic',
  1005: 'Access Denied: IP of banned ASN/ISP',
  1010: 'The owner of this website has banned your access based on your browser\'s signature',
  1011: 'Access Denied (Hotlinking Denied)',
  1012: 'Access Denied',
  1013: 'HTTP hostname and TLS SNI hostname mismatch',
  1016: 'Origin DNS error',
  1018: 'Domain is misconfigured',
  1020: 'Access Denied (Custom Firewall Rules)'
};

ERROR_CODES[1006] =
    ERROR_CODES[1007] =
        ERROR_CODES[1008] = 'Access Denied: Your IP address has been banned';

const OriginalError = original.RequestError;

const RequestError = create('RequestError', 0);
const CaptchaError = create('CaptchaError', 1);

// errorType 4 is a CloudflareError so this constructor is reused.
const CloudflareError = create('CloudflareError', 2, function (error) {
  if (!isNaN(error.cause)) {
    const description = ERROR_CODES[error.cause] || http.STATUS_CODES[error.cause];
    if (description) {
      error.message = error.cause + ', ' + description;
    }
  }
});

const ParserError = create('ParserError', 3, function (error) {
  error.message = BUG_REPORT + error.message;
});

// The following errors originate from promise-core and it's dependents.
// Give them an errorType for consistency.
original.StatusCodeError.prototype.errorType = 5;
original.TransformError.prototype.errorType = 6;

// This replaces the RequestError for all libraries using request/promise-core
// and prevents silent failure.
Object.defineProperty(original, 'RequestError', {
  configurable: true,
  enumerable: true,
  writable: true,
  value: RequestError
});

// Export our custom errors along with StatusCodeError, etc.
Object.assign(module.exports, original, {
  RequestError: RequestError,
  CaptchaError: CaptchaError,
  ParserError: ParserError,
  CloudflareError: CloudflareError
});

const desc = { configurable: true, writable: true, enumerable: false };
const descriptors = {
  error: desc,
  cause: desc,
  response: desc,
  options: desc
};

function create (name, errorType, customize) {
  function CustomError (cause, options, response) {
    // This prevents nasty things e.g. `error.cause.error` and
    // is why replacing the original RequestError is necessary.
    if (cause instanceof OriginalError) {
      return cause;
    }

    // Cleanup error output
    Object.defineProperties(this, descriptors);

    OriginalError.apply(this, arguments);

    // Change the name to match this constructor
    this.name = name;

    if (typeof customize === 'function') {
      customize(this);
    }

    if (Error.captureStackTrace) { // required for non-V8 environments
      // Provide a proper stack trace that hides this constructor
      Error.captureStackTrace(this, CustomError);
    }
  }

  CustomError.prototype = Object.create(OriginalError.prototype);
  CustomError.prototype.constructor = CustomError;
  // Keeps things stealthy by defining errorType on the prototype.
  // This makes it non-enumerable and safer to add.
  CustomError.prototype.errorType = errorType;

  Object.setPrototypeOf(CustomError, Object.getPrototypeOf(OriginalError));
  Object.defineProperty(CustomError, 'name', {
    configurable: true,
    value: name
  });

  return CustomError;
}

function format (lines) {
  return EOL + lines.join(EOL) + EOL + EOL;
}
