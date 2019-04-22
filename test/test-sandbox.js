/* eslint-disable no-unused-expressions */
/* eslint-env node, mocha */
'use strict';

const sandbox = require('../lib/sandbox');
const expect  = require('chai').expect;

describe('Sandbox (lib)', function () {
  it('should export Context', function () {
    expect(sandbox.Context).to.be.a('function');
  });

  it('should export eval', function () {
    expect(sandbox.eval).to.be.a('function');
    expect(sandbox.eval('0')).to.equal(0);
    expect(sandbox.eval('true')).to.be.true;
    expect(sandbox.eval('undefined')).to.equal(void 0);
    expect(sandbox.eval('NaN')).to.be.a('number');
    expect(String(sandbox.eval('NaN'))).to.equal('NaN');
  });

  it('new Context() should return an object', function () {
    expect(new sandbox.Context()).to.be.an('object');
  });

  it('Context() should define atob', function () {
    const ctx = new sandbox.Context();

    expect(ctx.atob).to.be.a('function');
    expect(ctx.atob('YWJj')).to.equal('abc');
    expect(sandbox.eval('atob("YWJj")', ctx)).to.equal('abc');
  });

  it('Context() should define location.reload', function () {
    const ctx = new sandbox.Context();

    expect(ctx.location).to.be.an('object');
    expect(ctx.location.reload).to.be.an('function');

    // This is a noop
    ctx.location.reload();
    expect(sandbox.eval('location.reload()', ctx)).to.equal(void 0);
  });

  it('Context() should define document.createElement', function () {
    let ctx = new sandbox.Context();
    let pseudoElement = { firstChild: { href: 'http:///' } };

    expect(ctx.document).to.be.an('object');

    expect(ctx.document.createElement).to.be.an('function');
    expect(ctx.document.createElement('a')).eql(pseudoElement);
    expect(sandbox.eval('document.createElement("a")', ctx)).to.eql(pseudoElement);

    ctx = new sandbox.Context({ hostname: 'test.com' });
    pseudoElement = { firstChild: { href: 'http://test.com/' } };

    expect(ctx.document.createElement('a')).eql(pseudoElement);
    expect(sandbox.eval('document.createElement("a")', ctx)).to.eql(pseudoElement);
  });

  it('Context() should define document.geElementById', function () {
    let ctx = new sandbox.Context();

    expect(ctx.document).to.be.an('object');

    expect(ctx.document.getElementById).to.be.an('function');
    expect(ctx.document.getElementById()).to.be.null;
    expect(sandbox.eval('document.getElementById()', ctx)).to.be.null;
    expect(ctx.document.getElementById('foobar')).to.be.null;
    expect(sandbox.eval('document.getElementById("foobar")', ctx)).to.be.null;

    // Double quotes
    ctx = new sandbox.Context({ body: '<div id="test">foobar</div>' });
    expect(ctx.document.getElementById('test')).eql({ innerHTML: 'foobar' });
    expect(sandbox.eval('document.getElementById("test")', ctx)).eql({ innerHTML: 'foobar' });

    // Single quotes
    ctx = new sandbox.Context({ body: '<div id=\'test\'>foobar</div>' });
    expect(ctx.document.getElementById('test')).eql({ innerHTML: 'foobar' });
    expect(sandbox.eval('document.getElementById(\'test\')', ctx)).eql({ innerHTML: 'foobar' });

    // Empty
    ctx = new sandbox.Context({ body: '<div id="test"></div>' });
    expect(ctx.document.getElementById('test')).eql({ innerHTML: '' });
    expect(sandbox.eval('document.getElementById("test")', ctx)).eql({ innerHTML: '' });

    // Space agnostic tests
    ctx = new sandbox.Context({ body: '<div id="test">\nabc\n\n</div>' });
    expect(ctx.document.getElementById('test')).eql({ innerHTML: '\nabc\n\n' });
    expect(sandbox.eval('document.getElementById("test")', ctx)).eql({ innerHTML: '\nabc\n\n' });

    ctx = new sandbox.Context({ body: '<div     id=\'test\'       > abc  </div>' });
    expect(ctx.document.getElementById('test')).eql({ innerHTML: ' abc  ' });
    expect(sandbox.eval('document.getElementById("test")', ctx)).eql({ innerHTML: ' abc  ' });

    ctx = new sandbox.Context({ body: 'foo="bar"  id=\'test\'  a=b  > abc  <' });
    expect(ctx.document.getElementById('test')).eql({ innerHTML: ' abc  ' });
    expect(sandbox.eval('document.getElementById("test")', ctx)).eql({ innerHTML: ' abc  ' });

    // Cache test
    ctx = new sandbox.Context({ body: '<div id="test">foobar</div>' });
    ctx.document.getElementById('test').innerHTML = 'foo';
    expect(ctx.document.getElementById('test')).eql({ innerHTML: 'foo' });
    expect(sandbox.eval('document.getElementById("test")', ctx)).eql({ innerHTML: 'foo' });
  });
});
