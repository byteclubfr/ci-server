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
    if (typeof action === 'string' && action.substring(0, 1) === '@') {
      foo = allActions[action.substring(1)] || function (type, config, payload, err, results, cb) {
        cb(new Error('Configuration error: unknown action "' + action + '"'));
      };
    } else {
      foo = function (type, config, payload, err, results, cb) {
        utils.shSeries.bind(null, config, payload, config.projectDir, action, cb);
      };
    }
    return foo.bind.bind(null, option, config);
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

    var scripts = merge(config.scripts || {}, proc.scripts || {});
    var cwd = merge(config.cwd || {}, proc.cwd || {});

    var passActions = getActions(proc, 'pass');
    var failActions = getActions(proc, 'fail');
    var errorActions = getActions(proc, 'error');

    gith(proc.filter).on(proc.event || 'all', function (payload) {

      var output = new Buffer(0);
      var appendOutput = function (params) {
        return function (fn) {
          return function (cb) {
            fn.apply(null, params.concat(function () {
              var args = Array.prototype.slice.call(arguments);
              output = Buffer.concat([output, args.pop(), new Buffer('\n')]);
              cb.apply(null, args);
            }));
          };
        };
      };

      var finished = function finished () {
        console.error('FINISHED', project, output, arguments);
      };

      async.series([
        prepareWorkingDirectory.bind(null, proc, payload),
        function test (cb) {
          var dir = path.join(proc.projectDir, 'git');
          utils.shSeries(proc, payload, dir, scripts.test || 'echo "NO TEST DEFINED"', function (err, content) {
            output = Buffer.concat([output, content, new Buffer('\n')]);
            cb(err);
          });
        }
      ], function (err) {
        var actions;
        if (err) {
          actions = errorActions;
        } else {
          var pass = results.some(function (result) {
            return false !== (Array.isArray(result) ? result[0] : result);
          });
          actions = pass ? passActions : failActions;
        }
        async.series(actions.map(appendOutput([payload, err])), function (err, results) {
          if (err) {
            async.series(errorActions.map(appendOutput([payload, err, results])), finished);
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
  var doSpawn = function (command, args, cb) {
    utils.shSeries(config, payload, dir, [[command, args]], function (err, content) {
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
        doSpawn('git', ['fetch', 'origin'], cb);
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
          doSpawn('git', ['clone', url, dir], cb);
        }
      }
    },
    function gitCheckout (cb) {
      output = Buffer.concat([output, new Buffer('>> Git repository: checkout ' + sha + '\n')]);
      doSpawn('git', ['checkout', sha], cb);
    }
  ], function (err) {
    cb(err, true, output);
  });
}
