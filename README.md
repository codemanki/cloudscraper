cloudscraper
============

Node.js library to bypass Cloudflare's anti-ddos page.

[![js-semistandard-style](https://cdn.rawgit.com/flet/semistandard/master/badge.svg)](https://github.com/Flet/semistandard)

[![Build status](https://img.shields.io/travis/codemanki/cloudscraper/master.svg?style=flat-square)](https://travis-ci.org/codemanki/cloudscraper)
[![Coverage](https://img.shields.io/coveralls/codemanki/cloudscraper.svg?style=flat-square)](https://coveralls.io/r/codemanki/cloudscraper)
[![Dependency Status](https://img.shields.io/david/codemanki/cloudscraper.svg?style=flat-square)](https://david-dm.org/codemanki/cloudscraper)
[![Greenkeeper badge](https://badges.greenkeeper.io/codemanki/cloudscraper.svg?style=flat-square)](https://greenkeeper.io/)

If the page you want to access is protected by Cloudflare, it will return special page, which expects client to support Javascript to solve challenge.

This small library encapsulates logic which extracts challenge, solves it, submits and returns the request page body.

You can use cloudscraper even if you are not sure if Cloudflare protection is turned on.

In general, Cloudflare has 4 types of _common_ anti-bot pages:
  - Simple html+javascript page with challenge
  - Page which redirects to original site
  - Page with reCAPTCHA
  - Page with error ( your ip was banned, etc)

If you notice that for some reason cloudscraper stops working, do not hesitate and get in touch with me ( by creating an issue [here](https://github.com/codemanki/cloudscraper/issues), for example), so i can update it.

Install
============
```sh
npm install cloudscraper
```

Saving the `request` module as a dependency is compulsory.

```sh
# Pin the request version
npm install --save request
```

Support for Brotli encoded responses is enabled by default when using Node.js v10 or later.
If you wish to enable support for older Node.js versions, you may install [brotli](https://npmjs.com/package/brotli).
It is recommended but not required.

Usage
============
Cloudscraper uses `request-promise` by default since v3. You can find the migration guide [here.](docs/migration-guide.md)

```javascript
var cloudscraper = require('cloudscraper');

cloudscraper.get('https://website.com/').then(console.log, console.error);
```

or for `POST` action:

```javascript
var options = {
  uri: 'https://website.com/',
  formData: { field1: 'value', field2: 2 }
};

cloudscraper.post(options).then(console.log).catch(console.error);
```

*Examples live in the docs directory of the Github repo and can be found [here.](docs/examples)*

A generic request can be made with `cloudscraper(options)`. The options object should follow [request's options](https://www.npmjs.com/package/request#request-options-callback). Not everything is supported however, for example http methods other than GET and POST. If you wanted to request an image in binary data you could use the encoding option:

```javascript
var options = {
  method: 'GET',
  url:'http://website.com/',
};

cloudscraper(options).then(console.log);
```

## Advanced usage
Cloudscraper allows you to specify your own requester, one of either `request` or `request-promise`.
Cloudscraper wraps the requester and accepts the same options, so using cloudscraper is pretty much like using those two libraries.
 - Cloudscraper exposes [the same HTTP verb methods as request](https://github.com/request/request#requestmethod):
   * `cloudscraper.get(options, callback)`
   * `cloudscraper.post(options, callback)`
   * `cloudscraper(uri)`
 - Cloudscraper uses request-promise by default, promise chaining is done exactly the same as described in [docs](https://github.com/request/request-promise#cheat-sheet):
 ```
  cloudscraper(options)
    .then(function (htmlString) {
    })
    .catch(function (err) {
    });
  ```
Please refer to the requester's documentation for further instructions.

## Sucuri
Cloudscraper can also identify and automatically bypass [Sucuri WAF](https://sucuri.net/website-firewall/). No actions are required.
 
## ReCAPTCHA
Cloudscraper may help you with the reCAPTCHA page. Take a look at [this example](docs/examples/solve-recaptcha.js) and an [example using promises](docs/examples/solve-recaptcha-v2.js).

Cloudflare may send a reCAPTCHA depending on the negotiated TLS cipher suite and extensions. Reducing the default cipher suite to only ciphers supported by Cloudflare may mitigate the problem: https://developers.cloudflare.com/ssl/ssl-tls/cipher-suites/

Only specifying the Cloudflare preferred TLSv1.2 cipher is also an option:
```javascript
var cloudscraper = require('cloudscraper').defaults({
  agentOptions: {
    ciphers: 'ECDHE-ECDSA-AES128-GCM-SHA256'
  }
})
```

More information on TLS issues can be found [here](https://github.com/codemanki/cloudscraper/issues?utf8=%E2%9C%93&q=tls).

## Defaults method

`cloudscraper.defaults` is a very convenient way of extending the cloudscraper requests with any of your settings.

```javascript
var cloudscraper = require('cloudscraper').defaults({ 'proxy': 'http://localproxy.com' });
// Overriding headers to remove them or using uncommon headers will cause reCAPTCHA responses
var headers = { /* ... */ };
var cloudscraper = require('cloudscraper').defaults({ headers: headers });

cloudscraper(options).then(console.log);
```

## Configuration
Cloudscraper exposes the following options that are required by default but might be changed. *Please note that the default values eliminate the chance of getting sent a CAPTCHA.*

```javascript
var options = {
  uri: 'https://website',
  jar: requestModule.jar(), // Custom cookie jar
  headers: {
    // User agent, Cache Control and Accept headers are required
    // User agent is populated by a random UA.
    'User-Agent': 'Ubuntu Chromium/34.0.1847.116 Chrome/34.0.1847.116 Safari/537.36',
    'Cache-Control': 'private',
    'Accept': 'application/xml,application/xhtml+xml,text/html;q=0.9, text/plain;q=0.8,image/png,*/*;q=0.5'
  },
  // Cloudscraper automatically parses out timeout required by Cloudflare.
  // Override cloudflareTimeout to adjust it.
  cloudflareTimeout: 5000,
  // Reduce Cloudflare's timeout to cloudflareMaxTimeout if it is excessive
  cloudflareMaxTimeout: 30000,
  // followAllRedirects - follow non-GET HTTP 3xx responses as redirects
  followAllRedirects: true,
  // Support only this max challenges in row. If CF returns more, throw an error
  challengesToSolve: 3,
  // Remove Cloudflare's email protection, replace encoded email with decoded versions
  decodeEmails: false,
  // Support gzip encoded responses (Should be enabled unless using custom headers)
  gzip: true,
  // Removes a few problematic TLSv1.0 ciphers to avoid CAPTCHA
  agentOptions: { ciphers }
};

cloudscraper(options).then(console.log);

```
You can access the default configuration with `cloudscraper.defaultParams`

## Error object
Cloudscraper error object inherits from `Error` has following fields:
  * `name` - `RequestError`/`CaptchaError`/`CloudflareError`/`ParserError`
  * `options` - The request options
  * `cause` - An alias for `error`
  * `response` - The request response
  * `errorType` - Custom error code
Where `errorType` can be following:
 - `0` if request to page failed due to some native reason as bad url, http connection or so. `error` in this case will be error [event](http://nodejs.org/api/http.html#http_class_http_server)
 - `1` Cloudflare returned CAPTCHA. Nothing to do here. Bad luck
 - `2` Cloudflare returned page with some inner error. `error` will be `Number` within this range `1012, 1011, 1002, 1000, 1004, 1010, 1006, 1007, 1008`. See more [here](https://support.cloudflare.com/hc/en-us/sections/200820298-Error-Pages)
 - `3` this error is returned when library failed to parse and solve js challenge. `error` will be `String` with some details. :warning: :warning: __Most likely it means that Cloudflare have changed their js challenge.__
 - `4` CF went into a loop and started to return challenge after challenge. If number of solved challenges is greater than `3` and another challenge is returned, throw an error

Errors are descriptive. You can find a list of all known errors [here.](errors.js)


Do not always rely on `error.cause` to be an error, it can be a string.

Running tests
============
Clone this repo, do `npm install` and then just `npm test`

### Unknown error? Library stopped working? ###
Let me know, by opening an [issue](https://github.com/codemanki/cloudscraper/issues) in this repo and I will update library asap. Please, provide url and body of page where cloudscraper failed.

WAT
===========
Current Cloudflare implementation requires browser to respect the timeout of 5 seconds and cloudscraper mimics this behaviour. So everytime you call `cloudscraper.get/post` you should expect it to return result after minimum 6 seconds. If you want to change this behaviour, you would need to make a generic request as described in above and pass `cloudflareTimeout` options with your value. But be aware that Cloudflare might track this timeout and use it against you ;)

## TODO
 - [x] Check for reCAPTCHA
 - [x] Support cookies, so challenge can be solved once per session
 - [x] Support page with simple redirects
 - [x] Add proper testing
 - [x] Remove manual 302 processing, replace with `followAllRedirects` param
 - [x] Parse out the timeout from challenge page
 - [x] Reorder the arguments in get/post/request methods and allow custom options to be passed in
 - [x] Support reCAPTCHA solving
 - [x] Promisification

## Kudos to contributors
 - [Dwayne](https://github.com/pro-src)
 - [Cole Faust](https://github.com/Colecf)
 - [Jeongbong Seo](https://github.com/jngbng)
 - [Mike van Rossum](https://github.com/askmike)
 - [Santiago Castro](https://github.com/bryant1410)
 - [Leonardo Gatica](https://github.com/lgaticaq)
 - [Michael](https://github.com/roflmuffin)
 - [Kamikadze4GAME](https://github.com/Kamikadze4GAME)
 - [Anorov](https://github.com/Anorov) :star:

In the beginning cloudscraper was a port of python module [cloudflare-scrape](https://github.com/Anorov/cloudflare-scrape). Thank you [Anorov](https://github.com/Anorov) for an inspiration.

## Dependencies
* [request-promise](https://github.com/request/request-promise)
