#!/usr/bin/env node

var requester = require('request');
var cloudscraper = require('../..').defaults({ requester: requester });
var uri = process.argv[2];

cloudscraper.get(uri, function (error, response, body) {
  if (error) {
    throw error;
  }

  console.log(body);
});
