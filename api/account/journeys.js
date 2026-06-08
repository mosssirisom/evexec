'use strict';

const handler = require('./index');

module.exports = function accountJourneys(req, res) {
  return handler(req, res);
};
