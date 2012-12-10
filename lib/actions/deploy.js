
var path = require('path');

var shell_exec = require('../utils.js').shell_exec;

module.exports = function test (type, config, payload, err, cb) {
  console.error('CONFIG', config);
  process.exit(1);
  shell_exec(path.join(config.projectDir, 'git'), path.join(config.projectDir, 'test'), [], cb);
};
