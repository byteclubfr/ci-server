module.exports = function status (type, config, payload, err, results, cb) {
  console.debug('Action', 'status', type);
  cb(null);
};
