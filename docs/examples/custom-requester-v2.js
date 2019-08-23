#!/usr/bin/env node

var requester = require('request-promise');
var cloudscraper = require('../..').defaults({ requester: requester });
var uri = process.argv[2];

cloudscraper.get(uri).then(console.log).catch(console.error);
