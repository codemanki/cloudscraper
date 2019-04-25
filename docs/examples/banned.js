#!/usr/bin/env node
/* eslint-disable yoda */

// https://github.com/codemanki/cloudscraper/issues/155

var cloudscraper = require('..');
var CloudflareError = require('../errors').CloudflareError;

var uri = process.argv[2];

cloudscraper.get(uri)
  .catch(function (error) {
    if (error instanceof CloudflareError) {
      if (!isNaN(error.cause)) {
        if (1004 < error.cause < 1009) {
          return cloudscraper.get({ uri: uri, proxy: 'http://example-proxy.com' });
        }
      }
    }

    throw error;
  })
  .then(console.log)
  .catch(console.error);
