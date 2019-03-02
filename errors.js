'use strict';

var original = require('request-promise-core/errors');
var OriginalError = original.RequestError;

// The purpose of this library is two-fold.
// 1. Have errors consistent with request/promise-core
// 2. Prevent request/promise core from wrapping our errors

// There are two differences between these errors and the originals.
// 1. There is a non-enumerable errorType attribute.
// 2. The error constructor is hidden from the stacktrace.

function create(name, errorType) {
  function CustomError(cause, options, response) {

    // This prevents nasty things e.g. `error.cause.error` and
    // is why replacing the original RequestError is necessary.
    if (cause instanceof OriginalError) {
      return cause;
    }

    OriginalError.apply(this, arguments);

    // Change the name to match this constructor
    this.name = name;

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

var RequestError    = create('RequestError', 0);
var CaptchaError    = create('CaptchaError', 1);
var CloudflareError = create('CloudflareError', 2);
var ParserError     = create('ParserError', 3);
// errorType 4 is a CloudflareError so that constructor is reused.

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
