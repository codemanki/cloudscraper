#!/usr/bin/env node

var cloudscraper = require('..');

cloudscraper.defaultParams.headers = {
  Connection: 'keep-alive',
  'User-Agent': 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/73.0.3683.86 Safari/537.36',
  Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3',
  'Accept-Encoding': 'gzip, deflate',
  'Accept-Language': 'en-US,en;q=0.9'
};

var uri = process.argv[2];

cloudscraper.get({ gzip: true, uri: uri }).then(console.log).catch(console.error);
