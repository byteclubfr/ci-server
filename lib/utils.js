var path = require('path');
var spawn = require('child_process').spawn;

var async = require('async');

module.exports = {
  sh: sh,
  shSeries: shSeries,
  replaceShellTokens: replaceShellTokens
};

function sh (dir, command, args, cb) {
  var output = new Buffer(0);

  // Working directory
  var cwd = process.cwd();
  if (dir) process.chdir(dir);
  var done = function (err) {
    if (dir && cwd) process.chdir(cwd);
    cb(err, output);
  };

  // Exec
  var cmd = spawn(command, args);
  cmd.stdout.on('data', function (data) { output = Buffer.concat([output, new Buffer('stdout: '), data]); });
  cmd.stderr.on('data', function (data) { output = Buffer.concat([output, new Buffer('stderr: '), data]); });
  cmd.on('error', function (err) { done(err); });
  cmd.on('exit', function (code) {
    var err = null;
    if (code) {
      err = new Error('Command "' + command + ' \'' + args.join('\' \'') + '\' failed with status ' + code);
      err.code = code;
    }
    cb(err);
  });
}

function replaceShellTokens (config, payload, str) {
  return str.
    replace(/\$GIT_UPDATE/g, 'git pull --ff-only origin $BRANCH && git checkout $BRANCH').
    replace(/\$PROJECT/g, config.projectDir).
    replace(/\$GIT/g, path.join(config.projectDir, 'git')).
    replace(/\$BRANCH/g, payload.tag || payload.branch);
}

function shSeries (config, payload, dir, commands, cb) {
  if (!Array.isArray(commands)) {
    commands = [commands];
  }
  async.series(commands.map(function (command) {
    var cmd, args;
    if (Array.isArray(command)) {
      cmd = command[0];
      args = command[1] || [];
      if (!Array.isArray(args)) {
        args = [args];
      }
    } else {
      cmd = command;
      args = [];
    }
    cmd = replaceShellTokens(config, payload, cmd);
    args = args.map(replaceShellTokens.bind(null, config, payload));
    return sh.bind(null, dir, cmd, args);
  }), function (err, outputs) {
    var output = null;
    if (outputs) {
      output = Buffer.concat(outputs.
        filter(function (content) { return !!content; }).
        map(function (content) { return Buffer.concat([new Buffer('\n'), content]); })
      );
    }
    cb(err, output);
  });
}
