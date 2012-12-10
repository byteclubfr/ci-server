module.exports = require('fs').readdirSync(__dirname).reduce(function (actions, name) {
  if (name !== 'index.js' && name.match(/\.js$/)) {
    var action = require('./' + name);
    if (typeof action === 'function') {
      actions[name.replace(/\.js$/, '')] = action;
    }
  }
  return actions;
}, {});
