'use strict';

const crypto = require('crypto');

const SUPABASE_URL = () => process.env.SUPABASE_URL || 'https://yoltkmhtxwluqxxpewbl.supabase.co';
const SERVICE_KEY  = () => process.env.SUPABASE_SERVICE_ROLE_KEY;

function dbHeaders() {
  return {
    'Content-Type': 'application/json',
    'apikey': SERVICE_KEY(),
    'Authorization': `Bearer ${SERVICE_KEY()}`
  };
}

function base64urlEncode(buf) {
  return Buffer.from(buf).toString('base64')
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
  const key = crypto.createPrivateKey({ key: privateKeyDer, format: 'der', type: 'pkcs8' });
  const sig = crypto.sign('SHA256', Buffer.from(signing), { key, dsaEncoding: 'ieee-p1363' });
  return `${signing}.${base64urlEncode(sig)}`;
}

async function sendWebPush(sub, payload, vapidPublicKey, vapidPrivateKey, vapidEmail) {
  const endpoint = sub.endpoint;
  const url      = new URL(endpoint);
  const audience = `${url.protocol}//${url.host}`;
  const jwt      = await makeVapidJwt(audience, vapidEmail, vapidPublicKey, vapidPrivateKey);

  const serverKeys = crypto.generateKeyPairSync('ec', { namedCurve: 'prime256v1' });
  const serverPublicKeyDer = serverKeys.publicKey.export({ type: 'spki', format: 'der' });
  const serverPublicKeyRaw = serverPublicKeyDer.slice(27);

  const clientPublicKeyRaw = base64urlDecode(sub.p256dh);
  const clientPublicKey = crypto.createPublicKey({
    key: Buffer.concat([
      Buffer.from([0x30,0x59,0x30,0x13,0x06,0x07,0x2a,0x86,0x48,0xce,0x3d,0x02,0x01,
                   0x06,0x08,0x2a,0x86,0x48,0xce,0x3d,0x03,0x01,0x07,0x03,0x42,0x00]),
      clientPublicKeyRaw
    ]),
    format: 'der', type: 'spki'
  });

  const sharedSecret = crypto.diffieHellman({ privateKey: serverKeys.privateKey, publicKey: clientPublicKey });
  const authSecret   = base64urlDecode(sub.auth_key);
  const salt         = crypto.randomBytes(16);

  function hkdf(salt2, ikm2, info, len) {
    const prk = crypto.createHmac('sha256', salt2).update(ikm2).digest();
    return crypto.createHmac('sha256', prk).update(Buffer.concat([info, Buffer.from([1])])).digest().slice(0, len);
  }

  const context = Buffer.concat([
    Buffer.from('P-256\0'), Buffer.alloc(2), Buffer.alloc(1, 65), clientPublicKeyRaw,
    Buffer.alloc(2), Buffer.alloc(1, 65), serverPublicKeyRaw
  ]);

  const contentKey = hkdf(salt, sharedSecret, Buffer.concat([Buffer.from('Content-Encoding: aesgcm\0'), context]), 16);
  const nonce      = hkdf(salt, sharedSecret, Buffer.concat([Buffer.from('Content-Encoding: nonce\0'), context]), 12);

  const plaintext  = Buffer.concat([Buffer.alloc(2), Buffer.from(payload)]);
  const cipher     = crypto.createCipheriv('aes-128-gcm', contentKey, nonce);
  const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final(), cipher.getAuthTag()]);
  const body       = Buffer.concat([salt, Buffer.from([0x00,0x00,0x10,0x00,0x41]), serverPublicKeyRaw, ciphertext]);

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
    const err = new Error('Subscription expired'); err.statusCode = 410; throw err;
  }
  if (!res.ok) {
    const err = new Error(`Push failed: ${res.status}`); err.statusCode = res.status; throw err;
  }
}

async function getSubscriptions(userId, email, phone) {
  const filters = [];
  if (userId) filters.push(`user_id=eq.${userId}`);
  if (email)  filters.push(`customer_email=eq.${encodeURIComponent(email)}`);
  if (phone)  filters.push(`customer_phone=eq.${encodeURIComponent(phone)}`);
  if (!filters.length) return [];

  const res = await fetch(
    `${SUPABASE_URL()}/rest/v1/push_subscriptions?or=(${filters.join(',')})&select=*`,
    { headers: dbHeaders() }
  );
  if (!res.ok) return [];
  return res.json();
}

async function deleteExpiredSubscription(endpoint) {
  await fetch(
    `${SUPABASE_URL()}/rest/v1/push_subscriptions?endpoint=eq.${encodeURIComponent(endpoint)}`,
    { method: 'DELETE', headers: dbHeaders() }
  ).catch(() => {});
}

async function sendPushToCustomer(booking, title, message, actionUrl) {
  const vapidPublicKey  = process.env.VAPID_PUBLIC_KEY;
  const vapidPrivateKey = process.env.VAPID_PRIVATE_KEY;
  const vapidEmail      = process.env.VAPID_EMAIL || 'mailto:book@evexec.co.uk';
  if (!vapidPublicKey || !vapidPrivateKey) return;

  const subs = await getSubscriptions(
    booking.user_id || null,
    booking.customer_email || null,
    booking.customer_phone || null
  );
  if (!subs.length) return;

  const payload = JSON.stringify({
    title,
    body: message,
    tag: 'evexec-booking',
    data: { url: actionUrl || '/booking?id=' + booking.id }
  });

  await Promise.allSettled(
    subs.map(sub =>
      sendWebPush(sub, payload, vapidPublicKey, vapidPrivateKey, vapidEmail).catch(async err => {
        if (err.statusCode === 410) await deleteExpiredSubscription(sub.endpoint);
      })
    )
  );
}

module.exports = { sendWebPush, getSubscriptions, deleteExpiredSubscription, sendPushToCustomer };
