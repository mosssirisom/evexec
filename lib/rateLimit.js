'use strict';

// A small, free, best-effort limit on how often one visitor can submit the public forms
// (booking, booking look-up, contact, quote request). It is kept in the memory of each
// server instance, so it slows a flood of submissions from one address rather than
// guaranteeing an exact count across every instance. It costs nothing and needs no
// database. The key is the visitor's address as seen by the platform's proxy.

const hits = new Map(); // key -> [timestamps in ms]
let lastSweep = 0;

function clientAddress(req) {
  const fwd = String((req.headers && (req.headers['x-forwarded-for'] || req.headers['x-real-ip'])) || '');
  const first = fwd.split(',')[0].trim();
  return first || (req.socket && req.socket.remoteAddress) || 'unknown';
}

function sweep(now, windowMs) {
  if (now - lastSweep < windowMs) return;
  lastSweep = now;
  for (const [k, list] of hits) {
    const fresh = list.filter(t => now - t < windowMs);
    if (fresh.length) hits.set(k, fresh); else hits.delete(k);
  }
}

/**
 * Count one use of `bucket` by this visitor. Returns { limited: false } while they are within
 * `max` uses in the last `windowSec` seconds, otherwise { limited: true, retryAfter } (seconds).
 */
function hit(req, bucket, max, windowSec, now = Date.now()) {
  const windowMs = windowSec * 1000;
  sweep(now, windowMs);
  const key = `${bucket}:${clientAddress(req)}`;
  const fresh = (hits.get(key) || []).filter(t => now - t < windowMs);
  if (fresh.length >= max) {
    hits.set(key, fresh);
    const retryAfter = Math.max(1, Math.ceil((fresh[0] + windowMs - now) / 1000));
    return { limited: true, retryAfter };
  }
  fresh.push(now);
  hits.set(key, fresh);
  return { limited: false };
}

/** Sends a 429 and returns true when the visitor is over the limit; otherwise returns false. */
function tooMany(req, res, bucket, max, windowSec) {
  const r = hit(req, bucket, max, windowSec);
  if (!r.limited) return false;
  res.statusCode = 429;
  res.setHeader('Retry-After', String(r.retryAfter));
  res.setHeader('Content-Type', 'application/json');
  res.end(JSON.stringify({ error: 'Too many requests. Please wait a few minutes and try again, or contact us directly.' }));
  return true;
}

function _reset() { hits.clear(); lastSweep = 0; }

module.exports = { hit, tooMany, clientAddress, _reset };
