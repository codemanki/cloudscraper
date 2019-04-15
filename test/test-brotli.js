/* eslint-disable no-unused-expressions */
/* eslint-env node, mocha */
'use strict';

const brotli = require('../lib/brotli');
const helper = require('./helper');
const zlib   = require('zlib');

const sinon  = require('sinon');
const expect = require('chai').expect;

(process.env.BROTLI ? describe : describe.skip)('Brotli', function () {
  it('should be available', function () {
    expect(brotli.isAvailable).to.be.true;
  });

  it('should have a decompress method', function () {
    expect(brotli.decompress).to.be.a('function');
  });

  it('decompress() should accept exactly 1 argument', function () {
    expect(brotli.decompress.length).to.equal(1);
  });

  it('decompress() should accept buffer as input', function () {
    const data = Buffer.from([0x0b, 0x01, 0x80, 0x61, 0x62, 0x63, 0x03]);
    const result = brotli.decompress(data);

    expect(result).to.be.instanceof(Buffer);
    expect(result.toString('utf8')).to.equal('abc');
  });

  (zlib.brotliCompressSync ? it : it.skip)('[internal] decompress() should produce the expected result', function () {
    const input = helper.getFixture('captcha.html');
    const data = zlib.brotliCompressSync(Buffer.from(input, 'utf8'));
    const result = brotli.decompress(data);

    expect(result).to.be.instanceof(Buffer);
    expect(result.toString('utf8')).to.equal(input);
  });

  (zlib.brotliCompressSync ? it.skip : it)('[external] decompress() should produce the expected result', function () {
    const input = helper.getFixture('captcha.html');
    // Try increasing the timeout if this fails on your system.
    const data = require('brotli').compress(Buffer.from(input, 'utf8'));
    const result = brotli.decompress(Buffer.from(data));

    expect(result).to.be.instanceof(Buffer);
    expect(result.toString('utf8')).to.equal(input);
  });

  it('optional() should throw an error if the module contains an error', function () {
    const spy = sinon.spy(function () {
      // This method should throw if called without arguments
      brotli.optional();
    });

    expect(spy).to.throw();
  });
});
