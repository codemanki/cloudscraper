const zlib = require('zlib');

const brotli = module.exports;
// Convenience boolean used to check for brotli support
brotli.isAvailable = true;

// Check for node's built-in brotli support
if (typeof zlib.brotliDecompress === 'function') {
  brotli.decompress = function (buf) {
    return zlib.brotliDecompressSync(buf);
  };
} else {
  try {
    // Check for user installed brotli
    const decompress = require('brotli/decompress');

    brotli.decompress = function (buf) {
      return Buffer.from(decompress(buf));
    };
  } catch (error) {
    brotli.isAvailable = false;

    if (error.code !== 'MODULE_NOT_FOUND') {
      throw error;
    }
  }
}
