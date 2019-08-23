#!/usr/bin/env node

// https://github.com/codemanki/cloudscraper/issues/246

var cloudscraper = require('../..');

// npm install --save tough-cookie-file-store
var CookieStore = require('tough-cookie-file-store');
var jar = cloudscraper.jar(new CookieStore('./cookie.json'));

/*
  // It's recommended to reuse the same headers.
  var fs = require('fs');
  var headers = cloudscraper.defaultParams.headers;
  fs.writeFileSync('./headers.json', JSON.stringify(headers), 'utf-8');
*/

var uri = process.argv[2];

cloudscraper = cloudscraper.defaults({ jar, headers: require('./headers') });
cloudscraper.get(uri).then(console.log).catch(console.error);
