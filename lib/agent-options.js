'use strict';

const tls = require('tls');

const ciphers = getCiphers();

if (ciphers !== -1) {
  module.exports.ciphers = ciphers;
}

function getCiphers () {
  // SSL_CTX_set_cipher_list will simply ignore any unsupported ciphers
  const defaults = [
    'TLS_AES_128_CCM_8_SHA256',
    'TLS_AES_128_CCM_SHA256',
    'TLS_AES_128_GCM_SHA256',
    'TLS_AES_256_GCM_SHA384',
    'TLS_CHACHA20_POLY1305_SHA256'
  ];

  // We already have these defaults if using openssl v1.1.1 and later
  const v = process.versions.openssl.match(/(\d)+\.(\d+)\.(\d+)/);
  if (v[1] >= 1 && v[2] >= 1 && v[3] >= 1) {
    return -1;
  }

  const suites = tls.getCiphers()
    .map(function (s) {
      return s.toUpperCase();
    });

  let missing = false;
  // Add the default TLSv1.3 cipher suites if missing
  for (let i = 0; i < defaults.length; i++) {
    if (suites.indexOf(defaults[i]) === -1) {
      missing = true;
      suites.push(defaults[i]);
    }
  }

  return missing ? suites.join(':') : -1;
}
