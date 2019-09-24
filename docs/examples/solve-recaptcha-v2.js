#!/usr/bin/env node

// Force a CAPTCHA response by sending bogus headers
const headers = { /* headers without user-agent, etc. */ };
const cloudscraper = require('../..').defaults({ onCaptcha: handler, headers });

// Pseudo function that returns a promise instead of calling captcha.submit()
function handler (options, { captcha }) {
  return new Promise((resolve, reject) => {
    // Here you do some magic with the siteKey provided by cloudscraper
    console.error('The url is "' + captcha.uri.href + '"');
    console.error('The site key is "' + captcha.siteKey + '"');
    // captcha.form['g-recaptcha-response'] = /* Obtain from your service */
    reject(new Error('This is a dummy function.'));
  });
}

// An example handler with destructuring arguments
function alternative (options, { captcha: { uri, siteKey } }) {
  // Here you do some magic with the siteKey provided by cloudscraper
  console.error('The url is "' + uri.href + '"');
  console.error('The site key is "' + siteKey + '"');
  return Promise.reject(new Error('This is a dummy function'));
}

const uri = process.argv[2];
cloudscraper.get({ uri, onCaptcha: alternative }).then(console.log).catch(console.warn);
