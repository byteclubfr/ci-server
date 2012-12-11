var fs = require('fs');
var path = require('path');

var merge = require('deepmerge');
var async = require('async');

var gith = require('gith').create(process.env.PORT || 9001);

var utils = require('./lib/utils');

var allActions = require('./lib/actions');

console.debug = console.log;


function getActions (config, option) {
  var names = config[option] || ['@noop'];
  if (!Array.isArray(names)) names = [names];
  return names.map(function (action) {
    var foo;
    if (action.substring(0, 1) === '@') {
      foo = allActions[action.substring(1)] || function (type, config, payload, err, results, cb) {
        cb(new Error('Configuration error: unknown action "' + action + '"'));
      };
    } else {
      foo = function (type, config, payload, err, results, cb) {
        utils.sh(config.projectDir, utils.replaceShellTokens(config, payload, action), cb);
      };
    }
    return foo.bind(null, option, config);
  });
}


fs.readdirSync(path.join(__dirname, 'projects'))
.filter(function (project) {
  return fs.statSync(path.join(__dirname, 'projects', project)).isDirectory();
})
.forEach(function (project) {
  console.log('Read config for project', project);
  var config;
  try {
    config = require(path.join(__dirname, 'projects', project, 'config.json'));
  } catch (err) {
    if (err) {
      console.error('Failed reading config for project', project);
      console.error(String(err));
      return;
    }
  }
  if (!config.enabled) {
    console.error('Project disabled', project);
    return;
  }

  console.log('Start deploy server for project', project);

  var projectFilter = config.filter || {};

  config.processes.forEach(function (proc) {
    proc = proc || {};
    proc.projectDir = path.join(__dirname, 'projects', project);
    proc.filter = merge(projectFilter, proc.filter || {});

    proc.scripts = merge(config.scripts || {}, proc.scripts || {});

    var passActions = getActions(proc, 'pass');
    var failActions = getActions(proc, 'fail');
    var errorActions = getActions(proc, 'error');

    gith(proc.filter).on(proc.event || 'all', function (payload) {

      var output = new Buffer(0);
      var appendOutput = function (params) {
        return function (fn) {
          return function (cb) {
            fn.apply(null, params.concat([function () {
              var args = Array.prototype.slice.call(arguments);
              if (args.length > 1) {
                output = Buffer.concat([output, args.pop(), new Buffer('\n')]);
              }
              cb.apply(null, args);
            }]));
          };
        };
      };

      var finished = function finished (err) {
        console.error('FINISHED', project, err, output.toString());
      };

      async.series([
        prepareWorkingDirectory.bind(null, proc, payload),
        function test (cb) {
          utils.sh(path.join(proc.projectDir, 'git'), utils.replaceShellTokens(proc, payload, proc.scripts.test), function (err, content) {
            output = Buffer.concat([output, content, new Buffer('\n')]);
            cb(err);
          });
        }
      ], function (err) {
        var actions = err ? failActions : passActions;
        async.series(actions.map(appendOutput([payload, err])), function (err, results) {
          if (err) {
            async.series(errorActions.map(appendOutput([payload, err])), finished);
          } else {
            finished();
          }
        });
      });

    });
  });

  console.log('Listening on port', process.env.PORT || 9001);
});


function prepareWorkingDirectory (config, payload, cb) {
  var dir = path.join(config.projectDir, 'git');

  var output = new Buffer(0);
  var doSpawn = function (command, cb) {
    utils.sh(dir, utils.replaceShellTokens(config, payload, command), function (err, content) {
      output = Buffer.concat([output, content, new Buffer('\n')]);
      cb(err);
    });
  };

  var sha = payload.sha || payload.branch; // only in "push" // TODO other events

  if (!sha) {
    return cb(new Error('Unable to guess commit-ish: will not be able to initialize working directory'));
  }

  async.waterfall([
    function statGit (cb) {
      fs.stat(path.join(dir, '.git'), function (err, stat) {
        if (err && err.code === 'ENOENT') err = null, stat = null;
        if (stat && !stat.isDirectory()) err = new Error('Path "' + path.join(dir, '.git') + '" exists and is not a directory!');
        return cb(err, stat);
      });
    },
    function gitFetch (exists, cb) {
      if (exists) {
        output = Buffer.concat([output, new Buffer('>> Git repository: already cloned, fetch remote data…\n')]);
        doSpawn('git fetch origin', cb);
      } else {
        output = Buffer.concat([output, new Buffer('>> Git repository: clone remote…\n')]);
        var url = payload.urls.repo; // Shoulw be common to all payloads
        if (!url) {
          cb(new Error('Could not retrieve repository URL: cannot clone!'));
        } else {
          if (url.match(/^https?:\/\//)) {
            // Prefer the SSH git protocol, using deploy key
            url = url.replace(/^https?:\/\/(.*?)\//, 'git@$1:') + '.git';
          }
          var old_dir = dir;
          dir = null;
          doSpawn('git clone ' + utils.shellArgs([url, old_dir]), cb);
          dir = old_dir;
        }
      }
    },
    function gitCheckout (cb) {
      output = Buffer.concat([output, new Buffer('>> Git repository: checkout ' + sha + '\n')]);
      doSpawn('git checkout ' + utils.shellArgs(sha), cb);
    }
  ], function (err) {
    cb(err, true, output);
  });
}
