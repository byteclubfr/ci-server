var fs = require('fs');
var path = require('path');

var merge = require('deepmerge');
var async = require('async');

var gith = require('gith').create(process.env.PORT || 9001);

var allTests = require('./lib/tests');
var allActions = require('./lib/actions');

function getMethods (config, names, type) {
  var methods = type === 'test' ? allTests : allActions;
  var defaultName = type === 'test' ? 'pass' : 'noop';
  names = names || [];
  if (!Array.isArray(names)) names = [names];
  return names.map(function (name) {
    return (methods[name || defaultName] || function (config, payload, cb) {
      cb(new Error('Configuration error: unknown ' + type + ' "' + name + '"'));
    }).bind(null, config);
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

  var finished = function finished () {
    console.error(project, arguments);
  };

  config.processes.forEach(function (process) {
    var tests = getMethods(config, config.test, 'test');
    var passActions = getMethods(config, config.pass, 'action');
    var failActions = getMethods(config, config.fail, 'action');
    var errorActions = getMethods(config, config.error, 'action');

    gith().on(process.event || 'all', function (payload) {
      async.series(tests.map(function (test) {
        return test.bind(null, payload);
      }), function (err, results) {
        var actions;
        if (err) {
          actions = errorActions;
        } else {
          var pass = results.some(function (result) {
            return Array.isArray(result) ? !!result[0] : !!result;
          });
          actions = pass ? passActions : failActions;
        }
        async.series(actions.map(function (action) {
          return action.bind(null, payload, err, results);
        }), function (err, results) {
          if (err) {
            async.series(errorActions.map(function (action) {
              return action.bind(null, payload, err, results);
            }), finished);
          } else {
            finished();
          }
        });
      });
    });
  });

  console.log('Listening on port', process.env.PORT || 9001);
});
