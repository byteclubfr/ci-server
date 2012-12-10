module.exports = function notify (type, config, payload, err, results, cb) {
  console.debug('Action', 'notify', type);
  cb(null);
};
