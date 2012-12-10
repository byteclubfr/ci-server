var fs = require('fs');
var path = require('path');

var merge = require('deepmerge');
var async = require('async');

var gith = require('gith').create(process.env.PORT || 9001);

var tests = require('./lib/tests');
var actions = require('./lib/actions');


fs.readdirSync(path.join(__dirname, 'projects')).forEach(function (project) {
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

	var projectTests = config.test || [];
	if (!Array.isArray(projectTests)) projectTests = [projectTests];
	projectTests = projectTests.map(function (name) {
		return (tests[name || 'pass'] || function (config, payload, cb) {
			cb(new Error('Configuration error: unknown test "' + name + '"'));
		}).bind(null, config);
	});

	var projectIfPass = config.pass || [];
	if (!Array.isArray(projectIfPass)) projectIfPass = [projectIfPass];
	projectIfPass = projectIfPass.map(function (name) {
		return (actions[name || 'noop'] || function (config, payload, cb) {
			cb(new Error('Configuration error: unknown action "' + name + '"'));
		}).bind(null, 'pass', config);
	});

	var projectIfFail = config.fail || [];
	if (!Array.isArray(projectIfFail)) projectIfFail = [projectIfFail];
	projectIfFail = projectIfFail.map(function (name) {
		return (actions[name || 'noop'] || function (config, payload, cb) {
			cb(new Error('Configuration error: unknown action "' + name + '"'));
		}).bind(null, 'fail', config);
	});

	var projectIfError = config.fail || [];
	if (!Array.isArray(projectIfError)) projectIfError = [projectIfError];
	projectIfError = projectIfError.map(function (name) {
		return (actions[name || 'noop'] || function (config, payload, cb) {
			cb(new Error('Configuration error: unknown action "' + name + '"'));
		}).bind(null, 'error', config);
	});

	var finished = function finished () {
		console.error(project, arguments);
	};

	config.processes.forEach(function (action) {
		gith(merge(projectFilter, action.filter || {}).on(action.event || 'all', function (payload) {
			async.series(projectTests.map(function (test) {
				return test.bind(null, payload);
			}), function (err, results) {
				var actions;
				if (err) {
					actions = projectsIfError;
				} else {
					var pass = results.some(function (result) {
						return Array.isArray(result) ? !!result[0] : !!result;
					});
					actions = pass ? projectsIfPass : projectsIfFail;
				}
				async.series(actions.map(function (action) {
					return action.bind(null, payload, err, results);
				}), function (err, results) {
					if (err) {
						async.series(projectsIfError.map(function (action) {
							return action.bind(null, payload, err, results);
						}, finished);
					} else {
						finished();
					}
				});
			});
		});
	});
});
