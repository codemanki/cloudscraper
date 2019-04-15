const vm = require('vm');

const VM_OPTIONS = {
  contextOrigin: 'cloudflare:challenge.js',
  contextCodeGeneration: { strings: true, wasm: false },
  timeout: 5000
};

module.exports = { eval: evaluate, Context };

function evaluate (code, ctx) {
  return vm.runInNewContext(code, ctx, VM_OPTIONS);
}

// Global context used to evaluate standard IUAM JS challenge
function Context (options) {
  if (!options) options = { body: '', hostname: '' };

  const body = options.body;
  const href = 'http://' + options.hostname + '/';
  const cache = Object.create(null);
  const keys = [];

  this.atob = function (str) {
    return Buffer.from(str, 'base64').toString('binary');
  };

  // Used for eval during onRedirectChallenge
  this.location = { reload: function () {} };

  this.document = {
    createElement: function () {
      return { firstChild: { href: href } };
    },
    getElementById: function (id) {
      if (keys.indexOf(id) === -1) {
        const re = new RegExp(' id=[\'"]?' + id + '[^>]*>([^<]*)');
        const match = body.match(re);

        keys.push(id);
        cache[id] = match === null ? match : { innerHTML: match[1] };
      }

      return cache[id];
    }
  };
}
