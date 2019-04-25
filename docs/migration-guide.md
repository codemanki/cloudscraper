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
