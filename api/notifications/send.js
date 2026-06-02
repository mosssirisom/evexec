'use strict';

const crypto = require('crypto');
const { parseBody } = require('../../lib/parse');

const SUPABASE_URL = () => process.env.SUPABASE_URL;
const SERVICE_KEY  = () => process.env.SUPABASE_SERVICE_ROLE_KEY;

function dbHeaders() {
  return {
    'Content-Type': 'application/json',
    'apikey': SERVICE_KEY(),
    'Authorization': `Bearer ${SERVICE_KEY()}`
  };
}

async function getSubscriptions(userId, email, phone) {
  const filters = [];
  if (userId) filters.push(`user_id=eq.${userId}`);
  if (email)  filters.push(`customer_email=eq.${encodeURIComponent(email)}`);
  if (phone)  filters.push(`customer_phone=eq.${encodeURIComponent(phone)}`);
  if (!filters.length) return [];

  const query = filters.join(',');
  const url = `${SUPABASE_URL()}/rest/v1/push_subscriptions?or=(${query})&select=*`;
  const res = await fetch(url, { headers: dbHeaders() });
  if (!res.ok) return [];
  return res.json();
}

// --- VAPID / Web Push implementation using Node.js built-ins ---

function base64urlEncode(buf) {
  return Buffer.from(buf)
    .toString('base64')
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
}

function base64urlDecode(str) {
  const pad = str.length % 4;
  const padded = pad ? str + '='.repeat(4 - pad) : str;
  return Buffer.from(padded.replace(/-/g, '+').replace(/_/g, '/'), 'base64');
}

async function makeVapidJwt(audience, subject, publicKeyB64, privateKeyB64, expSeconds = 43200) {
  const header = base64urlEncode(JSON.stringify({ typ: 'JWT', alg: 'ES256' }));
  const now = Math.floor(Date.now() / 1000);
  const claims = base64urlEncode(JSON.stringify({ aud: audience, exp: now + expSeconds, sub: subject }));
  const signing = `${header}.${claims}`;

  const privateKeyDer = base64urlDecode(privateKeyB64);
  const key = crypto.createPrivateKey({
    key: privateKeyDer,
    format: 'der',
    type: 'pkcs8'
  });

  const sig = crypto.sign('SHA256', Buffer.from(signing), { key, dsaEncoding: 'ieee-p1363' });
  return `${signing}.${base64urlEncode(sig)}`;
}

async function sendWebPush(sub, payload, vapidPublicKey, vapidPrivateKey, vapidEmail) {
  const endpoint = sub.endpoint;
  const url = new URL(endpoint);
  const audience = `${url.protocol}//${url.host}`;

  const jwt = await makeVapidJwt(audience, vapidEmail, vapidPublicKey, vapidPrivateKey);

  // Encrypt the payload using ECDH + AES-128-GCM (RFC 8291)
  const serverKeys = crypto.generateKeyPairSync('ec', { namedCurve: 'prime256v1' });
  const serverPublicKeyDer = serverKeys.publicKey.export({ type: 'spki', format: 'der' });
  // Raw uncompressed public key (65 bytes): skip the SPKI header (27 bytes)
  const serverPublicKeyRaw = serverPublicKeyDer.slice(27);

  const clientPublicKeyRaw = base64urlDecode(sub.p256dh);
  const clientPublicKey = crypto.createPublicKey({
    key: Buffer.concat([Buffer.from([0x30, 0x59, 0x30, 0x13, 0x06, 0x07, 0x2a, 0x86, 0x48, 0xce, 0x3d, 0x02, 0x01,
                                     0x06, 0x08, 0x2a, 0x86, 0x48, 0xce, 0x3d, 0x03, 0x01, 0x07, 0x03, 0x42, 0x00]),
                        clientPublicKeyRaw]),
    format: 'der',
    type: 'spki'
  });

  const sharedSecret = crypto.diffieHellman({ privateKey: serverKeys.privateKey, publicKey: clientPublicKey });

  const authSecret = base64urlDecode(sub.auth_key);
  const salt = crypto.randomBytes(16);

  function hkdf(salt2, ikm2, info, len) {
    const prk2 = crypto.createHmac('sha256', salt2).update(ikm2).digest();
    const infoWithCounter = Buffer.concat([info, Buffer.from([1])]);
    const okm = crypto.createHmac('sha256', prk2).update(infoWithCounter).digest();
    return okm.slice(0, len);
  }

  const context = Buffer.concat([
    Buffer.from('P-256\0'),
    Buffer.alloc(2),
    Buffer.alloc(1, 65),
    clientPublicKeyRaw,
    Buffer.alloc(2),
    Buffer.alloc(1, 65),
    serverPublicKeyRaw
  ]);

  const keyInfo    = Buffer.concat([Buffer.from('Content-Encoding: aesgcm\0'), context]);
  const nonceInfo  = Buffer.concat([Buffer.from('Content-Encoding: nonce\0'), context]);
  const contentKey = hkdf(salt, sharedSecret, keyInfo,   16);
  const nonce      = hkdf(salt, sharedSecret, nonceInfo, 12);

  const payloadBuf = Buffer.from(payload);
  const plaintext = Buffer.concat([Buffer.alloc(2), payloadBuf]);
  const cipher = crypto.createCipheriv('aes-128-gcm', contentKey, nonce);
  const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final(), cipher.getAuthTag()]);
  const body = Buffer.concat([salt, Buffer.from([0x00, 0x00, 0x10, 0x00]), Buffer.from([0x41]), serverPublicKeyRaw, ciphertext]);

  const res = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/octet-stream',
      'Content-Encoding': 'aesgcm',
      'Encryption': `salt=${base64urlEncode(salt)}`,
      'Crypto-Key': `dh=${base64urlEncode(serverPublicKeyRaw)};p256ecdsa=${vapidPublicKey}`,
      'Authorization': `WebPush ${jwt}`,
      'TTL': '86400'
    },
    body
  });

  if (res.status === 410) {
    const err = new Error('Subscription expired');
    err.statusCode = 410;
    throw err;
  }
  if (!res.ok) {
    const err = new Error(`Push failed: ${res.status}`);
    err.statusCode = res.status;
    throw err;
  }
  return res;
}

// --- Handler ---

module.exports = async function handler(req, res) {
  res.setHeader('Content-Type', 'application/json');

  if (req.method !== 'POST') {
    res.statusCode = 405;
    return res.end(JSON.stringify({ error: 'Method not allowed' }));
  }

  const secret = req.headers['x-operator-secret'];
  if (!process.env.OPERATOR_ACTION_SECRET || secret !== process.env.OPERATOR_ACTION_SECRET) {
    res.statusCode = 401;
    return res.end(JSON.stringify({ error: 'Unauthorised' }));
  }

  let body;
  try { body = await parseBody(req); }
  catch { res.statusCode = 400; return res.end(JSON.stringify({ error: 'Invalid body' })); }

  const { user_id, email, phone, title, message, tag, url: actionUrl } = body;
  if (!title || !message) {
    res.statusCode = 400;
    return res.end(JSON.stringify({ error: 'title and message required' }));
  }

  const vapidPublicKey  = process.env.VAPID_PUBLIC_KEY;
  const vapidPrivateKey = process.env.VAPID_PRIVATE_KEY;
  const vapidEmail      = process.env.VAPID_EMAIL || 'mailto:book@evexec.co.uk';

  const subscriptions = await getSubscriptions(user_id, email, phone);
  if (!subscriptions.length) {
    res.statusCode = 200;
    return res.end(JSON.stringify({ sent: 0, message: 'No subscriptions found' }));
  }

  const payload = JSON.stringify({
    title,
    body: message,
    tag: tag || 'evexec',
    data: { url: actionUrl || '/' }
  });

  const results = await Promise.allSettled(
    subscriptions.map(sub =>
      sendWebPush(sub, payload, vapidPublicKey, vapidPrivateKey, vapidEmail)
        .catch(async err => {
          if (err.statusCode === 410) {
            await fetch(
              `${SUPABASE_URL()}/rest/v1/push_subscriptions?endpoint=eq.${encodeURIComponent(sub.endpoint)}`,
              { method: 'DELETE', headers: dbHeaders() }
            ).catch(() => {});
          }
          throw err;
        })
    )
  );

  const sent = results.filter(r => r.status === 'fulfilled').length;
  res.statusCode = 200;
  res.end(JSON.stringify({ sent, total: subscriptions.length }));
};
