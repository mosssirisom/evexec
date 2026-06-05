'use strict';

const { verifyAuth } = require('../../lib/auth');
const { parseBody }  = require('../../lib/parse');

const SUPABASE_URL = () => process.env.SUPABASE_URL || 'https://yoltkmhtxwluqxxpewbl.supabase.co';
const SERVICE_KEY  = () => process.env.SUPABASE_SERVICE_ROLE_KEY;

function headers(extra = {}) {
  return {
    'Content-Type': 'application/json',
    'apikey': SERVICE_KEY(),
    'Authorization': `Bearer ${SERVICE_KEY()}`,
    ...extra
  };
}

// ── GET|PATCH /api/account/profile ─────────────────────────────────────────

async function handleProfile(req, res, user) {
  if (req.method === 'GET') {
    try {
      const r = await fetch(
        `${SUPABASE_URL()}/rest/v1/profiles?id=eq.${user.id}&select=*&limit=1`,
        { headers: headers() }
      );
      if (!r.ok) throw new Error(await r.text());
      const rows = await r.json();
      const profile = rows[0] || { id: user.id, privilege_points: 0, push_enabled: false };
      return res.end(JSON.stringify({ profile }));
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
    for (const k of allowed) { if (k in body) update[k] = body[k]; }

    try {
      const r = await fetch(
        `${SUPABASE_URL()}/rest/v1/profiles`,
        {
          method: 'POST',
          headers: headers({ Prefer: 'resolution=merge-duplicates,return=representation' }),
          body: JSON.stringify({ ...update, id: user.id, updated_at: new Date().toISOString() })
        }
      );
      if (!r.ok) throw new Error(await r.text());
      const rows = await r.json();
      return res.end(JSON.stringify({ profile: rows[0] || null }));
    } catch (err) {
      res.statusCode = 500;
      return res.end(JSON.stringify({ error: err.message }));
    }
  }

  res.statusCode = 405;
  res.end(JSON.stringify({ error: 'Method not allowed' }));
}

// ── GET /api/account/journeys ──────────────────────────────────────────────

async function handleJourneys(req, res, user) {
  if (req.method !== 'GET') {
    res.statusCode = 405;
    return res.end(JSON.stringify({ error: 'Method not allowed' }));
  }

  try {
    const email  = user.email || '';
    const fields = 'id,ref,journey_type,pickup_location,airport,dropoff_address,travel_date,travel_time,passengers,luggage,return_journey,return_date,return_time,status,quoted_price,payment_status,payment_method,created_at,flight_number';

    const byUser = await fetch(
      `${SUPABASE_URL()}/rest/v1/bookings?user_id=eq.${user.id}&select=${fields}&order=created_at.desc&limit=50`,
      { headers: headers() }
    );
    let rows = byUser.ok ? await byUser.json() : [];

    if (rows.length === 0 && email) {
      const byEmail = await fetch(
        `${SUPABASE_URL()}/rest/v1/bookings?customer_email=eq.${encodeURIComponent(email)}&select=${fields}&order=created_at.desc&limit=50`,
        { headers: headers() }
      );
      if (byEmail.ok) rows = await byEmail.json();
    }

    res.statusCode = 200;
    res.end(JSON.stringify({ journeys: rows }));
  } catch (err) {
    res.statusCode = 500;
    res.end(JSON.stringify({ error: err.message }));
  }
}

// ── Router ─────────────────────────────────────────────────────────────────

module.exports = async function handler(req, res) {
  res.setHeader('Content-Type', 'application/json');

  const user = await verifyAuth(req);
  if (!user) {
    res.statusCode = 401;
    return res.end(JSON.stringify({ error: 'Unauthorised' }));
  }

  const path = (req.url || '').split('?')[0];
  if (path.endsWith('/profile'))  return handleProfile(req, res, user);
  if (path.endsWith('/journeys')) return handleJourneys(req, res, user);

  res.statusCode = 404;
  res.end(JSON.stringify({ error: 'Not found' }));
};
