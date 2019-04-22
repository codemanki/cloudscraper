'use strict';

const pattern = (
  // Opening tag
  // $1 = TAG_NAME
  '<([a-z]+)(?: [^>]*)?' + '(?:' +
  // href attribute
  // $2 = /cdn-cgi/l/email-protection#HEX_STRING
  // $3 = HEX_STRING
  ' href=[\'"]?(\\/cdn-cgi\\/l\\/email-protection#([a-f0-9]{4,}))' + '|' +
  // data attribute
  // $4 = HEX_STRING
  ' data-cfemail=["\']?([a-f0-9]{4,})' +
  // Self-closing or innerHTML(disallow child nodes) followed by closing tag
  // \1 backreference to $1
  '(?:[^<]*\\/>|[^<]*?<\\/\\1>)' + ')'
);

const re = new RegExp(pattern, 'gi');

module.exports = function (html) {
  let match, result;

  re.lastIndex = 0;

  while ((match = re.exec(html)) !== null) {
    if (match[2] !== undefined) {
      result = match[0].replace(match[2], 'mailto:' + decode(match[3]));
    } else {
      result = decode(match[4]);
    }

    html = html.substr(0, match.index) + result + html.substr(re.lastIndex);
    re.lastIndex = match.index + result.length - 1;
  }

  return html;
};

function decode (hexStr) {
  const key = parseInt(hexStr.substr(0, 2), 16);
  let email = '';

  // noinspection ES6ConvertVarToLetConst
  for (var codePoint, i = 2; i < hexStr.length; i += 2) {
    codePoint = parseInt(hexStr.substr(i, 2), 16) ^ key;
    email += String.fromCharCode(codePoint);
  }

  // noinspection JSDeprecatedSymbols
  return decodeURIComponent(escape(email));
}
