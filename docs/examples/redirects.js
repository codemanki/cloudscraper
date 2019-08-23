#!/usr/bin/env node

var cloudscraper = require('../..').defaults({ followAllRedirects: false, maxRedirects: 3 });
var uri = process.argv[2];

cloudscraper.get({ simple: false, uri: uri }).then(console.log).catch(console.error);
