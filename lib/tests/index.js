module.exports = require('fs').readdirSync(__dirname).reduce(function (tests, name) {
  if (name !== 'index.js' && name.match(/\.js$/)) {
    var test = require('./' + name);
    if (typeof test === 'function') {
      tests[name.replace(/\.js$/, '')] = test;
    }
  }
  return tests;
}, {});
