#!/usr/bin/env node

var cloudscraper = require('..').defaults({ resolveWithFullResponse: true });
var fs = require('fs');

var uri = process.argv[2];

cloudscraper.debug = true;
cloudscraper.get(uri).then(onResponse).catch(onError);

function onResponse (response) {
  var request = JSON.stringify(response.request.toJSON(), null, 2);
  var headers = JSON.stringify(response.headers, null, 2);

  fs.writeFileSync('./request.json', request, 'utf8');
  fs.writeFileSync('./headers.json', headers, 'utf8');
  fs.writeFileSync('./body.html', response.body, 'utf8');
}

function onError (error) {
  console.error(error.stack);

  fs.writeFileSync('./error.txt', error.stack, 'utf8');

  if (error.cause) {
    console.log('Cause: ', error.cause);
  }

  if (error.response) {
    onResponse(error.response);
  }
}
