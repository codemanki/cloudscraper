#!/usr/bin/env node

var cloudscraper = require('../..').defaults({ resolveWithFullResponse: true });
var CaptchaError = require('../../errors').CaptchaError;

var uri = process.argv[2];

cloudscraper.get(uri).catch(function (error) {
  if (error instanceof CaptchaError) {
    console.log(error.response.body.toString('utf8'));
  }
});
