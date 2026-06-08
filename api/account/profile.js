'use strict';

const handler = require('./index');

module.exports = function accountProfile(req, res) {
  return handler(req, res);
};
