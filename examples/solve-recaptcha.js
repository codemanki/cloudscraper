#!/usr/bin/env node

function onCaptcha (options, response, body) {
  const captcha = response.captcha;
  // solveReCAPTCHA is a method that you should come up with and pass it href and sitekey, in return it will return you a reponse
  solveReCAPTCHA(response.request.uri.href, captcha.siteKey, (error, gRes) => {
    if (error) return void captcha.submit(error);
    captcha.form['g-recaptcha-response'] = gRes;
    captcha.submit();
  });
}

const cloudscraper = require('..').defaults({ onCaptcha });
var uri = process.argv[2];
cloudscraper.get({ uri: uri, headers: { cookie: "captcha=1" } }).catch(console.warn).then(console.log)