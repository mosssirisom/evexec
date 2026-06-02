'use strict';

const fs = require('fs');

module.exports = function handler(req, res) {
  let html = fs.readFileSync('index.html', 'utf8');
  const tag = '<script src="./public/js/google-places-autocomplete.js"></script>';

  if (!html.includes('google-places-autocomplete.js')) {
    html = html.replace('</body>', tag + '\n</body>');
  }

  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store, max-age=0');
  res.statusCode = 200;
  res.end(html);
};
