'use strict';

const crypto = require('crypto');

function generateToken(bookingId, action) {
  if (!process.env.OPERATOR_ACTION_SECRET) throw new Error('OPERATOR_ACTION_SECRET not configured');
  return crypto
    .createHmac('sha256', process.env.OPERATOR_ACTION_SECRET)
    .update(`${bookingId}:${action}`)
    .digest('hex');
}

function verifyToken(bookingId, action, token) {
  try {
    const expected = generateToken(bookingId, action);
    // Constant-time comparison to prevent timing attacks
    if (expected.length !== token.length) return false;
    return crypto.timingSafeEqual(Buffer.from(expected, 'hex'), Buffer.from(token, 'hex'));
  } catch { return false; }
}

module.exports = { generateToken, verifyToken };
