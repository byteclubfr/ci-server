var fs = require('fs');
var path = require('path');

var merge = require('deepmerge');
var async = require('async');

var gith = require('gith').create(process.env.PORT || 9001);

var allTests = require('./lib/tests');
var allActions = require('./lib/actions');

console.debug = console.log;

function getMethods (config, option, type) {
  var methods = type === 'test' ? allTests : allActions;
  var defaultName = type === 'test' ? 'pass' : 'noop';
  var names = config[option] || [];
  if (!Array.isArray(names)) names = [names];
  return names.map(function (name) {
    var foo = methods[name || defaultName] || function (config, payload, cb) {
      cb(new Error('Configuration error: unknown ' + type + ' "' + name + '"'));
    };
    return type === 'action' ? foo.bind(null, option, config) : foo.bind(null, config);
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

  config.processes.forEach(function (process) {
    process = process || {};
    process.projectDir = path.join(__dirname, 'projects', project);
    process.filter = merge(projectFilter, process.filter || {});
    var tests = getMethods(process, 'test', 'test');
    var passActions = getMethods(process, 'pass', 'action');
    var failActions = getMethods(process, 'fail', 'action');
    var errorActions = getMethods(process, 'error', 'action');

    // Prepare working directory before tests
    tests.unshift(prepareWorkingDirectory.bind(null, process));

    gith(process.filter).on(process.event || 'all', function (payload) {

      var output = '';
      var appendOutput = function (params) {
        return function (fn) {
          return function (cb) {
            fn.apply(null, params.concat(function () {
              var args = Array.prototype.slice.call(arguments);
              output += args.pop() + '\n';
              cb.apply(null, args);
            }));
          };
        };
      };

      var finished = function finished () {
        console.error('FINISHED', project, output, arguments);
      };

      async.series(tests.map(appendOutput([payload])), function (err, results) {
        var actions;
        if (err) {
          actions = errorActions;
        } else {
          var pass = results.some(function (result) {
            return false !== (Array.isArray(result) ? result[0] : result);
          });
          actions = pass ? passActions : failActions;
        }
        async.series(actions.map(appendOutput([payload, err, results])), function (err, results) {
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


var shell_exec = require('./lib/utils').shell_exec;

function prepareWorkingDirectory (config, payload, cb) {
  var dir = path.join(config.projectDir, 'git');

  var output = '';
  var doSpawn = function (command, args, cb) {
    shell_exec(dir, command, args, function (err, content) {
      output += content + '\n';
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
        output += '>> Git repository: already cloned, fetch remote data…\n';
        doSpawn('git', ['fetch', 'origin'], cb);
      } else {
        output += '>> Git repository: clone remote…\n';
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
      output += '>> Git repository: checkout ' + sha + '\n';
      doSpawn('git', ['checkout', sha], cb);
    }
  ], function (err) {
    cb(err, true, output);
  });
}
