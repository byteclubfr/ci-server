module.exports = function noop (type, config, payload, err, results, cb) {
  cb(null, new Buffer('No Operation'));
};
