
var path = require('path');

var shell_exec = require('../utils.js').shell_exec;

module.exports = function test (config, payload, cb) {
  shell_exec(path.join(config.projectDir, 'git'), path.join(config.projectDir, 'test'), [], cb);
};
