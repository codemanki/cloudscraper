'use strict';

const zlib = require('zlib');

const brotli = module.exports;
// Convenience boolean used to check for brotli support
brotli.isAvailable = true;
// Exported for tests
brotli.optional = optional;

// Check for node's built-in brotli support
if (typeof zlib.brotliDecompress === 'function') {
  brotli.decompress = function (buf) {
    return zlib.brotliDecompressSync(buf);
  };
} else {
  optional(require);
}

function optional (require) {
  try {
    // Require the NPM installed brotli
    const decompress = require('brotli/decompress');

    brotli.decompress = function (buf) {
      return Buffer.from(decompress(buf));
    };
  } catch (error) {
    brotli.isAvailable = false;

    // Don't throw an exception if the module is not installed
    if (error.code !== 'MODULE_NOT_FOUND') {
      throw error;
    }
  }
}
