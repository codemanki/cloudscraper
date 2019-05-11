'use strict';

const vm = require('vm');

const VM_OPTIONS = {
  filename: 'iuam-challenge.js',
  contextOrigin: 'cloudflare:iuam-challenge.js',
  contextCodeGeneration: { strings: true, wasm: false },
  timeout: 5000
};

const VM_ENV = `
  (function (global) {
    const cache = Object.create(null);
    const keys = [];
    const { body, href } = global;
    
    Object.defineProperties(global, {
      document: {
        value: {
          createElement: function () {
            return { firstChild: { href: href } };
          },
          getElementById: function (id) {
            if (keys.indexOf(id) === -1) {
              const re = new RegExp(' id=[\\'"]?' + id + '[^>]*>([^<]*)');
              const match = body.match(re);
      
              keys.push(id);
              cache[id] = match === null ? match : { innerHTML: match[1] };
            }
      
            return cache[id];
          }
        }
      },
      location: { value: { reload: function () {} } }  
    })
  }(this));
`;

module.exports = { eval: evaluate, Context };

function evaluate (code, ctx) {
  return vm.runInNewContext(VM_ENV + code, ctx, VM_OPTIONS);
}

// Global context used to evaluate standard IUAM JS challenge
function Context (options) {
  if (!options) options = { body: '', hostname: '' };

  const atob = Object.setPrototypeOf(function (str) {
    try {
      return Buffer.from(str, 'base64').toString('binary');
    } catch (e) {}
  }, null);

  return Object.setPrototypeOf({
    body: options.body,
    href: 'http://' + options.hostname + '/',
    atob
  }, null);
}
