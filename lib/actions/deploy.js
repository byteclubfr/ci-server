
var async = require('async');

var utils = require('../utils.js');


module.exports = function test (type, config, payload, err, cb) {
  // Execute scripts from configuration
  var dir = config.scripts['deploy.cwd'] || config.projectDir;
  if (!config.scripts['update']) {
    config.scripts['update'] = '$GIT_UPDATE';
  }

  var replaceTokens = utils.replaceShellTokens.bind(null, config, payload);

  var commands = ['deploy.before', 'update', 'build', 'deploy.after'].
    map(function (script) { return config.scripts[script]; }).
    filter(function (command) { return !!command; }).
    map(function (command) { return utils.sh.bind(null, dir, replaceTokens(command)); });

  async.series(commands, function (err, outputs) {
    cb(err, outputs && Buffer.concat(outputs));
  });
};
