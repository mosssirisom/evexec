'use strict';

async function parseBody(req) {
  // Handle Vercel pre-parsed body and raw stream
  if (req.body !== undefined && typeof req.body === 'object' && !Buffer.isBuffer(req.body)) {
    return req.body;
  }
  const chunks = [];
  for await (const chunk of req) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  try { return JSON.parse(Buffer.concat(chunks).toString('utf8')); } catch { return {}; }
}

async function getRawBody(req) {
  // Returns Buffer — required for Stripe webhook signature verification.
  // If the body arrived pre-parsed as a JS object we cannot recover the
  // original bytes, so Stripe signature verification would fail. In that
  // case throw so the webhook returns 400 rather than silently accepting
  // an unverifiable event.
  if (req.body !== undefined) {
    if (Buffer.isBuffer(req.body)) return req.body;
    if (typeof req.body === 'string') return Buffer.from(req.body, 'utf8');
    throw new Error('Request body was pre-parsed as an object — raw bytes unavailable for signature verification. Disable body parsing for this route.');
  }
  const chunks = [];
  for await (const chunk of req) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  return Buffer.concat(chunks);
}

module.exports = { parseBody, getRawBody };
