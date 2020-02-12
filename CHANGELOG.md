## Change Log

### 4.6.0 (12/02/2020)
- Replace &amp; in url with `&`

### 4.5.0 (03/12/2019)
- [#293](https://github.com/codemanki/cloudscraper/pull/293) Update code to parse latest CF recaptcha.

### 4.4.0 (28/11/2019)
- [#288](https://github.com/codemanki/cloudscraper/pull/288) Update code to parse latest CF challenge.

### 4.3.0 (28/09/2019)
- [#267](https://github.com/codemanki/cloudscraper/pull/267) Typescript definitions.
- [#271](https://github.com/codemanki/cloudscraper/pull/271) Fix brotli compressed JSON responses.

### 4.2.0 (24/09/2019)
- [#260](https://github.com/codemanki/cloudscraper/pull/260) Update reCaptcha handling. Deprecate `captcha.url` in preference of `captcha.uri`. [Fix fallback siteKey handling](https://github.com/codemanki/cloudscraper/issues/259#issuecomment-531450844)

### 4.1.4 (24/08/2019)
- [#247](https://github.com/codemanki/cloudscraper/pull/247) Optimize header checks.

### 4.1.3 (12/07/2019)
- [#242](https://github.com/codemanki/cloudscraper/pull/242) Update Sucuri WAF Solving.

### 4.1.2 (23/05/2019)
- [#219](https://github.com/codemanki/cloudscraper/pull/219) Remove a few problematic TLSv1.0 ciphers.

### 4.1.1 (11/05/2019)
- Improve CF challenge security by nullifying VM context's prototype chain.

### v4.1.0 (02/05/2019)
- Backport TLSv1.3 secure ciphers to potentially avoid getting a CAPTCHA.

### v4.0.1 (25/04/2019)
- Improve documentation
- Add `url` to captcha
- Add more examples for reCAPTCHA handling

### v4.0.0 (22/04/2019)
- Randomize `User-Agent` header with random chrome browser
- Recaptcha solving support
- Brotli non-mandatory support
- Various code changes and improvements

### v3.9.1 (11/04/2019)
- Fix for the timeout parsing

### v3.9.0 (11/04/2019)
- [#193](https://github.com/codemanki/cloudscraper/pull/193) Fix bug with setTimeout match length

### v3.8.0 (11/04/2019)
- [#191](https://github.com/codemanki/cloudscraper/pull/191) Update code to parse latest CF challenge

### v3.7.0 (07/04/2019)
- [#182](https://github.com/codemanki/cloudscraper/pull/182) Usage examples have been added.
- [#169](https://github.com/codemanki/cloudscraper/pull/169) Cloudscraper now automatically parses out timeout for a CF challenge.

### v3.6.0 (03/04/2019)
- [#180](https://github.com/codemanki/cloudscraper/pull/180) Update code to parse latest CF challenge

### v3.5.0 (31/03/2019)
- [#174](https://github.com/codemanki/cloudscraper/pull/174) Update code to parse latest CF challenge

### v3.4.0 (27/03/2019)
- [#165](https://github.com/codemanki/cloudscraper/pull/165) Fixing CF challenge parsing, respect `Retry-After` header when CF returns `429 Too Many Requests` error.
- [#163](https://github.com/codemanki/cloudscraper/pull/163) Improve the accuracy of challenge timing. Throw error immediatelly without a delay
- [#159](https://github.com/codemanki/cloudscraper/pull/159) Decode emails in the page protected by CF

### v3.3.0 (22/03/2019)
- [#153](https://github.com/codemanki/cloudscraper/pull/153) Update code to parse latest CF challenge

### v3.2.0 (20/03/2019)
- [#149](https://github.com/codemanki/cloudscraper/pull/149) Update code to parse latest CF challenge

### v3.1.0 (14/03/2019)
- [#140](https://github.com/codemanki/cloudscraper/pull/140) Update code to parse new CF challenge

### v3.0.1 (11/03/2019)
- [#135](https://github.com/codemanki/cloudscraper/pull/135) Handle non-challenge response bodies 
- [#127](https://github.com/codemanki/cloudscraper/pull/127) Improve cloudflare detection 
- [#137](https://github.com/codemanki/cloudscraper/pull/137) Handle baseUrl option
- Various code style improvements

### v3.0.0 (07/03/2019)
- **BREAKING CHANGE**: `get/post` methods together with their signatures are aligned with corresponding methods from [request](https://github.com/request/request#requestmethod)
- **BREAKING CHANGE**: `cloudscraper.request` method is deprecated in favour of `cloudscraper(options)`
- Promise support has been added by using `request-promise`
- Error object are  inherited from Error and have additional properties.
  * `options` - The request options
  * `cause` - An alias for `error`
  * `response` - The request response
-  Stacktraces are available in error objects
- `cloudflareTimeout` option can be defined to speed up waiting time
- Challenge evaluation is done in a sandbox to avoid potential secutiry issues
- Default [request methods](https://github.com/request/request#requestmethod) are available
- Custom cookie jar can now be passed [#103](https://github.com/codemanki/cloudscraper/issues/102)
- Proxies support [PR#101](https://github.com/codemanki/cloudscraper/pull/101)
- MIT license

### v2.0.1 (02/03/2019)
- Minor documentation changes

### v2.0.0 (09/12/2018)
- [#2943](https://github.com/codemanki/cloudscraper/pull/66) Support recursive challenge solving. 
- **BREAKING CHANGE** Before this, when any error has been detected, the callback was called with an incorrect order: `callback(.., body, response);` instead of `return callback(..., response, body);`

