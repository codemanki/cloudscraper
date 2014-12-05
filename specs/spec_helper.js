var fs = require('fs');

module.exports = {
  getFixture: function(name) {
    return JSON.parse(fs.readFileSync('./specs/fixtures/' + name + '.json'));
  }
};
