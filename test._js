var cloudscraper = require('./index');
cloudscraper.debug = false;
cloudscraper.get({url:'https://iload.to/'}, function(error, response, body) {
  if (error) {
    console.log('Error', error.response.body.toString());
  } else {
    console.log('Success', body);
  }
});