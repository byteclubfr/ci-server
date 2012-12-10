var spawn = require('child_process').spawn;

module.exports = {
  shell_exec: shell_exec
};

function shell_exec (dir, command, args, cb) {
  var output = '';

  // Working directory
  var cwd = process.cwd();
  process.chdir(dir);
  var done = function (err) {
    process.chdir(cwd);
    cb(err, output);
  };

  // Exec
  var cmd = spawn(command, args);
  cmd.stdout.on('data', function (data) { output += 'stdout: ' + data; });
  cmd.stderr.on('data', function (data) { output += 'stderr: ' + data; });
  cmd.on('error', function (err) { done(err); });
  cmd.on('exit', function (code) { done(code ? new Error('Command "' + command + ' \'' + args.join('\' \'') + '\' failed with status ' + code) : null); });
}
