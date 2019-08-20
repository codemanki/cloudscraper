#!/usr/bin/env node

const cloudscraper = require('..').defaults({ resolveWithFullResponse: true });

var uri = process.argv[2];
// Cloudscraper thinks this server's response is a Cloudflare response
var server = 'cloudflare-april-fools';

getHeaders(uri).then(console.log).catch(console.error);

function getHeaders (uri) {
  return cloudscraper.head(uri)
    .catch(error => {
      if (error.errorType === 2 && server === error.response.headers.Server) {
        // Ignoring the error and returning the response
        return error.response;
      }

      throw error;
    })
    .then(response => response.headers);
}
