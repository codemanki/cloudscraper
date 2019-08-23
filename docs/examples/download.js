#!/usr/bin/env node

var cloudscraper = require('../..').defaults({ resolveWithFullResponse: true });
var fs = require('fs');

var uri = process.argv[2];

cloudscraper.get({ uri: uri, encoding: null }).then(saveFile).catch(console.error);

function saveFile (response) {
  var filename = process.argv[3];

  if (!filename) {
    var header = response.caseless.get('content-disposition');
    var match = ('' + header).match(/filename=(['"]?)(.*?)\1/i);

    filename = match !== null ? match[2] : 'example.bin';
  }

  fs.writeFileSync(filename, response.body);
}
