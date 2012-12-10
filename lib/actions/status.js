module.exports = function status (type, config, payload, err, cb) {
  console.debug('Action', 'status', type);
  cb(null);
};
