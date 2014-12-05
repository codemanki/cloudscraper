var chai = require('chai'),
    sinon = require('sinon'),
    sinonChai = require('sinon-chai');

chai.should();

chai.use(sinonChai);

chai.config.includeStack = true;

global.expect = chai.expect;
global.AssertionError = chai.AssertionError;
global.Assertion = chai.Assertion;
global.assert = chai.assert;
global.sinon = sinon;
