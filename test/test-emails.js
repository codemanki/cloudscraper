/* eslint-disable no-unused-expressions */
/* eslint-env node, mocha */
'use strict';

const decode = require('../lib/email-decode');
const expect = require('chai').expect;

const EMAIL = 'cloudscraper@example-site.dev';
const HEX_STRING = '6506090a10011606170415001725001d040815090048160c11004b010013';

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

describe('Email (lib)', function () {
  it('should not modify unprotected html', function () {
    const raw = genHTML('');

    expect(decode(raw)).to.equal(raw);
  });

  it('should remove email protection', function () {
    const protection = '<a data-cfemail="' + HEX_STRING + '">!@#&*9^%()[]/\\</a>';

    expect(decode(protection)).to.equal(EMAIL);
  });

  it('should replace anchors that have a data-cfemail attribute', function () {
    const protection = '<a href="/cdn-cgi/l/email-protection" class="__cf_email__" data-cfemail="' +
      HEX_STRING + '">[email&#160;protected]</a>';

    const raw = genHTML('<p> The email is ' + EMAIL + '</p>');
    const enc = genHTML('<p> The email is ' + protection + '</p>');

    expect(decode(enc)).to.equal(raw);
  });

  it('should replace spans that have a data-cfemail attribute', function () {
    const protection = '<span href="/cdn-cgi/l/email-protection" data-cfemail="' +
      HEX_STRING + '">[email&#160;protected]</span>';

    const raw = genHTML('<p> The email is ' + EMAIL + '</p>');
    const enc = genHTML('<p> The email is ' + protection + '</p>');

    expect(decode(enc)).to.equal(raw);
  });

  it('should be space agnostic', function () {
    const protection = '<NODE    href="/cdn-cgi/l/email-protection"    data-cfemail="' +
      HEX_STRING + '"  \r\n>\n[email&#160;protected]\r\n</NODE>';

    const raw = genHTML('\r\n<p>\n The email <br/>is ' + EMAIL + '\r\n</p>\n');
    const enc = genHTML('\r\n<p>\n The email <br/>is ' + protection + '\r\n</p>\n');

    expect(decode(enc)).to.equal(raw);
  });

  it('should not replace nodes if they have children', function () {
    const protection = '<a href="/cdn-cgi/l/email-protection" class="__cf_email__" data-cfemail="' +
      HEX_STRING + '"><span>[email&#160;protected]</span></a>';
    const enc = genHTML('<p> The email is ' + protection + '</p>');

    expect(decode(enc)).to.equal(enc);
  });

  it('should not replace malformed html', function () {
    const protection = '<a data-cfemail="' + HEX_STRING + '">\n<\n</a>';
    const enc = genHTML('<p> The email is ' + protection + '</p>');

    expect(decode(enc)).to.equal(enc);
  });

  it('should account for self-closing nodes', function () {
    const protection = '<a data-cfemail="' + HEX_STRING + '"/><span>test</span>';

    expect(decode(protection)).to.equal(EMAIL + '<span>test</span>');
  });

  it('should update href attribute values', function () {
    const protection = '<a b="c" href="/cdn-cgi/l/email-protection#' + HEX_STRING + '"></a>';

    const raw = genHTML('<a b="c" href="mailto:' + EMAIL + '"></a>');
    const enc = genHTML(protection);

    expect(decode(enc)).to.equal(raw);
  });
});
