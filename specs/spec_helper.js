var fs = require('fs');

module.exports = {
  getFixture: function(fileName) {
    return fs.readFileSync('./specs/fixtures/' + fileName);
  }
};
