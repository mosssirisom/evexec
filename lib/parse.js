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
  // Returns Buffer — required for Stripe webhook signature verification
  if (req.body !== undefined) {
    if (Buffer.isBuffer(req.body)) return req.body;
    const s = typeof req.body === 'string' ? req.body : JSON.stringify(req.body);
    return Buffer.from(s, 'utf8');
  }
  const chunks = [];
  for await (const chunk of req) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  return Buffer.concat(chunks);
}

module.exports = { parseBody, getRawBody };
