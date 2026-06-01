'use strict';

const { parseBody } = require('../../lib/parse');
const { verifyAuth } = require('../../lib/auth');

const SUPABASE_URL = () => process.env.SUPABASE_URL;
const SERVICE_KEY  = () => process.env.SUPABASE_SERVICE_ROLE_KEY;

function headers(extra = {}) {
  return {
    'Content-Type': 'application/json',
    'apikey': SERVICE_KEY(),
    'Authorization': `Bearer ${SERVICE_KEY()}`,
    ...extra
  };
}

module.exports = async function handler(req, res) {
  res.setHeader('Content-Type', 'application/json');

  if (req.method !== 'POST') {
    res.statusCode = 405;
    return res.end(JSON.stringify({ error: 'Method not allowed' }));
  }

  let body;
  try { body = await parseBody(req); }
  catch { res.statusCode = 400; return res.end(JSON.stringify({ error: 'Invalid body' })); }

  const { endpoint, keys, customer_phone, customer_email } = body;
  if (!endpoint || !keys || !keys.p256dh || !keys.auth) {
    res.statusCode = 400;
    return res.end(JSON.stringify({ error: 'Missing subscription fields' }));
  }

  const user = await verifyAuth(req);

  const row = {
    endpoint,
    p256dh:         keys.p256dh,
    auth_key:       keys.auth,
    user_id:        user ? user.id : null,
    customer_phone: customer_phone || null,
    customer_email: customer_email || (user ? user.email : null)
  };

  const res2 = await fetch(
    `${SUPABASE_URL()}/rest/v1/push_subscriptions`,
    {
      method: 'POST',
      headers: headers({ Prefer: 'resolution=merge-duplicates,return=minimal' }),
      body: JSON.stringify(row)
    }
  );

  if (!res2.ok) {
    const text = await res2.text();
    res.statusCode = 500;
    return res.end(JSON.stringify({ error: text }));
  }

  if (user) {
    await fetch(
      `${SUPABASE_URL()}/rest/v1/profiles?id=eq.${user.id}`,
      {
        method: 'PATCH',
        headers: headers({ Prefer: 'return=minimal' }),
        body: JSON.stringify({ push_enabled: true, updated_at: new Date().toISOString() })
      }
    ).catch(() => {});
  }

  res.statusCode = 200;
  res.end(JSON.stringify({ success: true }));
};
