'use strict';

const MAX_BODY_BYTES = 1024 * 1024;

function tooLarge(total) {
  return total > MAX_BODY_BYTES;
}

async function readChunks(req) {
  const chunks = [];
  let total = 0;

  for await (const chunk of req) {
    const buf = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    total += buf.length;
    if (tooLarge(total)) {
      const err = new Error('Request body too large');
      err.statusCode = 413;
      throw err;
    }
    chunks.push(buf);
  }

  return Buffer.concat(chunks);
}

async function parseBody(req) {
  if (req.body !== undefined && typeof req.body === 'object' && !Buffer.isBuffer(req.body)) {
    return req.body || {};
  }

  if (typeof req.body === 'string') {
    if (Buffer.byteLength(req.body, 'utf8') > MAX_BODY_BYTES) {
      const err = new Error('Request body too large');
      err.statusCode = 413;
      throw err;
    }
    try { return JSON.parse(req.body || '{}'); } catch { return {}; }
  }

  if (Buffer.isBuffer(req.body)) {
    if (req.body.length > MAX_BODY_BYTES) {
      const err = new Error('Request body too large');
      err.statusCode = 413;
      throw err;
    }
    try { return JSON.parse(req.body.toString('utf8') || '{}'); } catch { return {}; }
  }

  const raw = await readChunks(req);
  try { return JSON.parse(raw.toString('utf8') || '{}'); } catch { return {}; }
}

async function getRawBody(req) {
  if (req.body !== undefined) {
    if (Buffer.isBuffer(req.body)) {
      if (req.body.length > MAX_BODY_BYTES) {
        const err = new Error('Request body too large');
        err.statusCode = 413;
        throw err;
      }
      return req.body;
    }
    if (typeof req.body === 'string') {
      if (Buffer.byteLength(req.body, 'utf8') > MAX_BODY_BYTES) {
        const err = new Error('Request body too large');
        err.statusCode = 413;
        throw err;
      }
      return Buffer.from(req.body, 'utf8');
    }
    throw new Error('Request body was pre-parsed as an object — raw bytes unavailable for signature verification. Disable body parsing for this route.');
  }

  return readChunks(req);
}

module.exports = { parseBody, getRawBody };
