'use strict';

module.exports = function handler(req, res) {
  res.setHeader('Content-Type', 'application/json');
  res.statusCode = 200;
  res.end(JSON.stringify({ ok: true, service: 'evexec' }));
};