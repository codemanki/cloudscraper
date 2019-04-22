/* eslint-disable no-unused-expressions */
/* eslint-env node, mocha */
'use strict';

const getHeaders = require('../lib/headers');

const sinon  = require('sinon');
const expect = require('chai').expect;

describe('Headers (lib)', function () {
  const browsers = require('../lib/browsers');

  it('default export should be a function', function () {
    expect(getHeaders).to.be.a('function');
  });

  it('should always return an object with user agent', function () {
    for (let i = 0; i < 100; i++) {
      sinon.assert.match(getHeaders(), { 'User-Agent': sinon.match.string });
    }

    browsers.chrome.forEach(function (options) {
      try {
        expect(options['User-Agent']).to.be.an('array');
        expect(options['User-Agent'].length).to.be.above(0);
      } catch (error) {
        error.message += '\n\n' + JSON.stringify(options, null, 2);
        throw error;
      }
    });
  });

  it('should always retain insertion order', function () {
    for (let keys, i = 0; i < 100; i++) {
      keys = Object.keys(getHeaders({ Host: 'foobar' }));
      expect(keys[0]).to.equal('Host');
      expect(keys[1]).to.equal('Connection');
    }

    for (let keys, i = 0; i < 100; i++) {
      keys = Object.keys(getHeaders({ Host: 'foobar', 'N/A': null }));
      expect(keys[0]).to.equal('Host');
      expect(keys[1]).to.equal('N/A');
      expect(keys[2]).to.equal('Connection');
    }
  });
});
