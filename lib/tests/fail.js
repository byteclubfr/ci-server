module.exports = function fail (config, payload, cb) {
  console.debug('Test', 'fail');
  cb(null, false);
};
