module.exports = function noop (type, config, payload, err, cb) {
  cb(null, new Buffer('No Operation'));
};
