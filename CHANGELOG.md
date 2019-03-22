## Change Log

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

