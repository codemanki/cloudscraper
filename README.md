cloudscraper
============

Node.js library to bypass Cloudflare's anti-ddos page.

[![js-semistandard-style](https://cdn.rawgit.com/flet/semistandard/master/badge.svg)](https://github.com/Flet/semistandard)

[![Build status](https://img.shields.io/travis/codemanki/cloudscraper/master.svg?style=flat-square)](https://travis-ci.org/codemanki/cloudscraper)
[![Coverage](https://img.shields.io/coveralls/codemanki/cloudscraper.svg?style=flat-square)](https://coveralls.io/r/codemanki/cloudscraper)
[![Dependency Status](https://img.shields.io/david/codemanki/cloudscraper.svg?style=flat-square)](https://david-dm.org/codemanki/cloudscraper)
[![Greenkeeper badge](https://badges.greenkeeper.io/codemanki/cloudscraper.svg?style=flat-square)](https://greenkeeper.io/)

This library is a port of python module [cloudflare-scrape](https://github.com/Anorov/cloudflare-scrape) with couple enhancements and test cases ;)
. All grats to its author \m/

If the page you want to access is protected by Cloudflare, it will return special page, which expects client to support Javascript to solve challenge.

This small library encapsulates logic which extracts challenge, solves it, submits and returns the request page body.

You can use cloudscraper even if you are not sure if Cloudflare protection is turned on.

In general, Cloudflare has 4 types of _common_ anti-bot pages:
  - Simple html+javascript page with challenge
  - Page which redirects to original site
  - Page with recaptcha
  - Page with error ( your ip was banned, etc)

__Unfortunately, there is no support for handling a CAPTCHA, if the response contains it, but some convenience methods may be added in the future.__

If you notice that for some reason cloudscraper stopped to work, do not hesitate and get in touch with me ( by creating an issue here, for example), so i can update it.

Migration from v2 to v3
============
- Replace `cloudscraper.request(options)` with `cloudscraper(options)`
- `cloudscraper.get()` and `cloudscraper.post()` method signatures are aligned with corresponding methods from [request](https://github.com/request/request#requestmethod):
```
var options = {
  uri: 'https://website.com/',
  headers: {/*...*/}
};

cloudscraper.get(options, function(error, response, body) {
  console.log(body);
});
```
or for **POST**
```
var options = {
  uri: 'https://website.com/',
  headers: {/*...*/},
  formData: { field1: 'value', field2: 2 }
};

cloudscraper.post(options, function(error, response, body) {
  console.log(body);
});
```
- If you are using custom promise support workarounds please remove them as cloudscraper now uses [request-promise](https://github.com/request/request-promise):

```
var cloudscraper = require('cloudscraper');
var options = {
  uri: 'https://website.com/',
  method: 'GET'
};

cloudscraper(options).then(function(body) {
  console.log(body);
});
```

Install
============
```javascript
npm install cloudscraper
```

Usage
============
```javascript
var cloudscraper = require('cloudscraper');

cloudscraper.get('https://website.com/', function(error, response, body) {
  if (error) {
    console.log('Error occurred');
  } else {
    console.log(body, response);
  }
});
```

or for `POST` action:

```javascript
var options = {
  uri: 'https://website.com/',
  formData: { field1: 'value', field2: 2 }
};

cloudscraper.post(options, function(error, response, body) {
  console.log(body);
});
```

A generic request can be made with `cloudscraper(options, callback)`. The options object should follow [request's options](https://www.npmjs.com/package/request#request-options-callback). Not everything is supported however, for example http methods other than GET and POST. If you wanted to request an image in binary data you could use the encoding option:

```javascript
var options = {
  method: 'GET',
  url:'http://website.com/',
};

cloudscraper(options, function(err, response, body) {
  console.log(response)
});
```

## Advanced usage
Cloudscraper wraps request and request-promise, so using cloudscraper is pretty much like using those two libraries.
 - Cloudscraper exposes [the same request methods as request](https://github.com/request/request#requestmethod):
 `cloudscraper.get(options, callback)`
 `cloudscraper.post(options, callback)`
 `cloudscraper(uri)`
 Please refer to request's documentation for further instructions
 - Cloudscraper uses request-promise, promise chaining is done exactly the same as described in [docs](https://github.com/request/request-promise#cheat-sheet):
 ```
  cloudscraper(options)
    .then(function (htmlString) {
    })
    .catch(function (err) {
    });
  ```
## Defaults method

`cloudscraper.defaults` is a very convenient way of extending the cloudscraper requests with any of your settings.

```
var cloudscraper = require('cloudscraper').defaults({ 'proxy': 'http://localproxy.com' });
// Override headers
var headers = { /* ... */ };
var cloudscraper = require('cloudscraper').defaults({ headers: headers });

cloudscraper(options, function(error, response, body) {
  console.log(body)
});
```

## Configuration
Cloudscraper exposes following options that are required by default but might be changed. Please note that the default values increase chances of correct work.

```
var options = {
  uri: 'https://website',
  jar: requestModule.jar(), // Custom cookie jar
  headers: {
    // User agent, Cache Control and Accept headers are required
    'User-Agent': 'Ubuntu Chromium/34.0.1847.116 Chrome/34.0.1847.116 Safari/537.36',
    'Cache-Control': 'private',
    'Accept': 'application/xml,application/xhtml+xml,text/html;q=0.9, text/plain;q=0.8,image/png,*/*;q=0.5'
  },
  // Cloudflare requires a delay of 5 seconds, so wait for at least 6.
  cloudflareTimeout: 6000,
  // followAllRedirects - follow non-GET HTTP 3xx responses as redirects
  followAllRedirects: true,
  // Support only this max challenges in row. If CF returns more, throw an error
  challengesToSolve: 3
};

cloudscraper(options, function(error, response, body) {
  console.log(body)
});

```
You can access default default configuration with `cloudscraper.defaultParams`

## Error object
Cloudscraper error object inherits from `Error` has following fields:
  * `name` - `RequestError`/`CaptchaError`/`CloudflareError`/`ParserError`
  * `options` - The request options
  * `cause` - An alias for `error`
  * `response` - The request response
  * `errorType` - Custom error code
Where `errorType` can be following:
 - `0` if request to page failed due to some native reason as bad url, http connection or so. `error` in this case will be error [event](http://nodejs.org/api/http.html#http_class_http_server)
 - `1` Cloudflare returned captcha. Nothing to do here. Bad luck
 - `2` Cloudflare returned page with some inner error. `error` will be `Number` within this range `1012, 1011, 1002, 1000, 1004, 1010, 1006, 1007, 1008`. See more [here](https://support.cloudflare.com/hc/en-us/sections/200820298-Error-Pages)
 - `3` this error is returned when library failed to parse and solve js challenge. `error` will be `String` with some details. :warning: :warning: __Most likely it means that Cloudflare have changed their js challenge.__
 - `4` CF went into a loop and started to return challenge after challenge. If number of solved challenges is greater than `3` and another challenge is returned, throw an error

Do not always rely on `error.cause` to be an error, it can be a string

Running tests
============
Clone this repo, do `npm install` and then just `npm test`

### Unknown error? Library stopped working? ###
Let me know, by opening [issue](https://github.com/codemanki/cloudscraper/issues) in this repo and i will update library asap. Please, provide url and body of page where cloudscraper failed.

WAT
===========
Current Cloudflare implementation requires browser to respect the timeout of 5 seconds and cloudscraper mimics this behaviour. So everytime you call `cloudscraper.get/post` you should expect it to return result after minimum 6 seconds. If you want to change this behaviour, you would need to make a generic request as described in above and pass `cloudflareTimeout` options with your value. But be aware that Cloudflare might track this timeout and use it against you ;)

## TODO
 - [x] Check for recaptcha
 - [x] Support cookies, so challenge can be solved once per session
 - [x] Support page with simple redirects
 - [x] Add proper testing
 - [x] Remove manual 302 processing, replace with `followAllRedirects` param
 - [ ] Parse out the timeout from challenge page
 - [x] Reoder the arguments in get/post/request methods and allow custom options to be passed in
 - [ ] Expose solve methods to use them independently
 - [ ] Support recaptcha solving
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

## Dependencies
* [request](https://github.com/request/request)
* [request-promise](https://github.com/request/request-promise)


