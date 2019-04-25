#!/usr/bin/env node
/* eslint-disable promise/always-return */

var cloudscraper = require('..');
var fs = require('fs');

cloudscraper.get({ uri: 'https://subscene.com/content/images/logo.gif', encoding: null })
  .then(function (bufferAsBody) {
    fs.writeFileSync('./test.gif', bufferAsBody);
  })
  .catch(console.error);
