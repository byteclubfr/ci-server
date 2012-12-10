module.exports = function notify (type, config, payload, err, cb) {
  console.debug('Action', 'notify', type);
  cb(null);
};
