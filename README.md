cloudscraper
============

Node.js package to bypass cloudflare's anti-ddos page.

This package is a port of python module [cloudflare-scrape](https://github.com/Anorov/cloudflare-scrape). All grats to its author \m/

If the page you want to access is protected by CloudFlare, it will return special page, which expects client to support Javascript to solve challenge.

This small package encapsulates logic which extracts challenge, solves it, submits and returns the request page body.

You can use cloudscraper even if you are not sure if CloudFlare protection is turned on.

In general, CloudFlare has 3 types of _common_ anti-bot pages:
  - Simple html+javascript page with challenge
  - Page which redirects to original site
  - Page with recaptcha

__Unfortunatelly there is no solution, if website is protected by captcha.__

If you notice that for some reason cloudscraper stopped to work, do not hesitate and get in touch with me ( by creating an issue here, for example), so i can update it.


Usage
============
```javascript
var cloudscraper = require('cloudscraper');

cloudscraper.get('http://website.com/', function(error, body, response) {
  if (error) {
    console.log('Error occurred');
  } else {
    console.log(body);
  }
})
```

CloudScraper uses [Request](https://github.com/request/request) to perform requests.


## TODO
 - Check for recaptcha
 - Support cookies, so challenge can be solved once per session
 - Support page with simple redirects
 - Add proper testing

## Dependencies
* request@2.49.0 https://github.com/request/request
* tough-cookie@0.12.1 https://github.com/goinstant/tough-cookie
