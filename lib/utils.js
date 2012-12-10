var path = require('path');
var exec = require('child_process').exec;

var async = require('async');

module.exports = {
  sh: sh,
  shellArgs: shellArgs,
  replaceShellTokens: replaceShellTokens
};

function sh (dir, command, cb) {
  var cwd = process.cwd();
  if (dir) process.chdir(dir);
  var done = function (err, output) {
    if (dir && cwd) process.chdir(cwd);
    cb(err, output);
  };

  exec(command, function (err, stdout, stderr) {
    stdout = Buffer.concat((stdout || '').toString().split(/[\r\n]+/).map(function (line) {
      return new Buffer('stdout: ' + line + '\n');
    }));
    stderr = Buffer.concat((stderr || '').toString().split(/[\r\n]+/).map(function (line) {
      return new Buffer('stderr: ' + line + '\n');
    }));
    done(err, Buffer.concat([stdout, stderr]));
  });
}

function replaceShellTokens (config, payload, str) {
  return str.
    replace(/\$GIT_UPDATE/g, 'git pull --ff-only origin $BRANCH && git checkout $BRANCH').
    replace(/\$PROJECT/g, config.projectDir).
    replace(/\$GIT/g, path.join(config.projectDir, 'git')).
    replace(/\$BRANCH/g, payload.tag || payload.branch);
}

function escapeShellArg (arg) {
  return '"' + arg.replace(/"/g, '\\"') + '"';
}
function shellArgs (args) {
  return Array.isArray(args) ? args.map(escapeShellArg).join(' ') : escapeShellArg(args);
}
