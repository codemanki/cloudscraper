/* eslint-disable no-unused-expressions */
/* eslint-env node, mocha */
'use strict';

var decode = require('../lib/email-decode');
var expect = require('chai').expect;

var EMAIL = 'cloudscraper@example-site.dev';
var HEX_STRING = '6506090a10011606170415001725001d040815090048160c11004b010013';

function genHTML (body) {
  return '<!DOCTYPE html>\n' +
  '<html lang="en">\n' +
  '<head>\n' +
    '  <title>Cloudscraper</title>\n' +
    '  <meta charset="utf-8">\n' +
    '  <meta name="description" content="Site with protected emails">\n' +
    '  <meta name="author" content="cloudscraper">\n\n' +
    '  <link rel="stylesheet" href="styles/page.css?timestamp=1552884935864">' +
  '</head>' +
  '<body>\n' + body + '</body>\n' +
  '</html>\n';
}

describe('Cloudscraper decode', function () {
  it('should not modify unprotected html', function () {
    var raw = genHTML('');

    expect(decode(raw)).to.equal(raw);
  });

  it('should remove email protection', function () {
    var protection = '<a data-cfemail="' + HEX_STRING + '">!@#&*9^%()[]/\\</a>';

    expect(decode(protection)).to.equal(EMAIL);
  });

  it('should replace anchors that have a data-cfemail attribute', function () {
    var protection = '<a href="/cdn-cgi/l/email-protection" class="__cf_email__" data-cfemail="' +
      HEX_STRING + '">[email&#160;protected]</a>';

    var raw = genHTML('<p> The email is ' + EMAIL + '</p>');
    var enc = genHTML('<p> The email is ' + protection + '</p>');

    expect(decode(enc)).to.equal(raw);
  });

  it('should replace spans that have a data-cfemail attribute', function () {
    var protection = '<span href="/cdn-cgi/l/email-protection" data-cfemail="' +
      HEX_STRING + '">[email&#160;protected]</span>';

    var raw = genHTML('<p> The email is ' + EMAIL + '</p>');
    var enc = genHTML('<p> The email is ' + protection + '</p>');

    expect(decode(enc)).to.equal(raw);
  });

  it('should be space agnostic', function () {
    var protection = '<NODE    href="/cdn-cgi/l/email-protection"    data-cfemail="' +
      HEX_STRING + '"  \r\n>\n[email&#160;protected]\r\n</NODE>';

    var raw = genHTML('\r\n<p>\n The email <br/>is ' + EMAIL + '\r\n</p>\n');
    var enc = genHTML('\r\n<p>\n The email <br/>is ' + protection + '\r\n</p>\n');

    expect(decode(enc)).to.equal(raw);
  });

  it('should not replace nodes if they have children', function () {
    var protection = '<a href="/cdn-cgi/l/email-protection" class="__cf_email__" data-cfemail="' +
      HEX_STRING + '"><span>[email&#160;protected]</span></a>';
    var enc = genHTML('<p> The email is ' + protection + '</p>');

    expect(decode(enc)).to.equal(enc);
  });

  it('should not replace malformed html', function () {
    var protection = '<a data-cfemail="' + HEX_STRING + '">\n<\n</a>';
    var enc = genHTML('<p> The email is ' + protection + '</p>');

    expect(decode(enc)).to.equal(enc);
  });

  it('should account for self-closing nodes', function () {
    var protection = '<a data-cfemail="' + HEX_STRING + '"/><span>test</span>';

    expect(decode(protection)).to.equal(EMAIL + '<span>test</span>');
  });

  it('should update href attribute values', function () {
    var protection = '<a b="c" href="/cdn-cgi/l/email-protection#' + HEX_STRING + '"></a>';

    var raw = genHTML('<a b="c" href="mailto:' + EMAIL + '"></a>');
    var enc = genHTML(protection);

    expect(decode(enc)).to.equal(raw);
  });
});
