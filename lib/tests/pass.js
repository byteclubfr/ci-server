module.exports = function pass (config, payload, cb) {
  console.debug('Test', 'pass');
  cb(null, true);
};
