module.exports = function getHeaders (defaults) {
  const headers = chrome(random(require('./browsers').chrome));
  return Object.assign({}, defaults, headers);
};

function random (arr) {
  if (Array.isArray(arr)) {
    return arr[Math.floor(Math.random() * arr.length)];
  }

  return arr;
}

function chrome (options) {
  const { headers } = options;

  headers['User-Agent'] = random(options['User-Agent']);

  return headers;
}
