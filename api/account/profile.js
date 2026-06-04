'use strict';

const { verifyAuth } = require('../../lib/auth');
const { parseBody }  = require('../../lib/parse');

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

async function getProfile(userId) {
  const res = await fetch(
    `${SUPABASE_URL()}/rest/v1/profiles?id=eq.${userId}&select=*&limit=1`,
    { headers: headers() }
  );
  if (!res.ok) throw new Error(await res.text());
  const rows = await res.json();
  return rows[0] || null;
}

async function upsertProfile(userId, data) {
  const res = await fetch(
    `${SUPABASE_URL()}/rest/v1/profiles`,
    {
      method: 'POST',
      headers: headers({ Prefer: 'resolution=merge-duplicates,return=representation' }),
      body: JSON.stringify({ ...data, id: userId, updated_at: new Date().toISOString() })
    }
  );
  if (!res.ok) throw new Error(await res.text());
  const rows = await res.json();
  return rows[0] || null;
}

module.exports = async function handler(req, res) {
  res.setHeader('Content-Type', 'application/json');

  const user = await verifyAuth(req);
  if (!user) {
    res.statusCode = 401;
    return res.end(JSON.stringify({ error: 'Unauthorised' }));
  }

  if (req.method === 'GET') {
    try {
      const profile = await getProfile(user.id);
      return res.end(JSON.stringify({ profile: profile || { id: user.id, privilege_points: 0, push_enabled: false } }));
    } catch (err) {
      res.statusCode = 500;
      return res.end(JSON.stringify({ error: err.message }));
    }
  }

  if (req.method === 'PATCH') {
    let body;
    try { body = await parseBody(req); }
    catch { res.statusCode = 400; return res.end(JSON.stringify({ error: 'Invalid body' })); }

    const allowed = ['full_name', 'phone', 'avatar_url', 'push_enabled'];
    const update = {};
    for (const k of allowed) {
      if (k in body) update[k] = body[k];
    }

    try {
      const updated = await upsertProfile(user.id, update);
      return res.end(JSON.stringify({ profile: updated }));
    } catch (err) {
      res.statusCode = 500;
      return res.end(JSON.stringify({ error: err.message }));
    }
  }

  res.statusCode = 405;
  res.end(JSON.stringify({ error: 'Method not allowed' }));
};
