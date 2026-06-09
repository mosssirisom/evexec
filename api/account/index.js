'use strict';

const { verifyAuth } = require('../../lib/auth');
const { parseBody }  = require('../../lib/parse');
const { getLoyaltyStatus } = require('../../lib/loyalty');

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

function normaliseEmail(email) {
  return String(email || '').trim().toLowerCase();
}

function customerStatus(booking) {
  const status = booking.status || '';
  const paymentStatus = booking.payment_status || '';
  const driverId = booking.assigned_driver_id || booking.driver_id || null;

  if (status === 'Cancelled') return 'Unavailable';
  if (status === 'Completed') return 'Trip Completed';
  if (status === 'Passenger On Board') return 'Passenger On Board';
  if (status === 'Driver Arrived') return 'Driver Arrived';
  if (status === 'En Route') return 'Driver En Route';

  if (status === 'Dispatched') {
    if (driverId) return 'Driver Confirmed';
    if (paymentStatus === 'Paid' || paymentStatus === 'Invoiced' || paymentStatus === 'paid' || paymentStatus === 'cash_on_day') {
      return 'Trip Confirmed';
    }
    return 'Trip Confirmed';
  }

  return 'Awaiting Approval';
}

function attachCustomerStatus(rows) {
  return rows.map(row => ({
    ...row,
    customer_status: customerStatus(row)
  }));
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
    const email  = normaliseEmail(user.email);
    const fields = 'id,ref,journey_type,pickup_location,airport,dropoff_address,travel_date,travel_time,passengers,luggage,return_journey,return_date,return_time,status,quoted_price,payment_status,payment_method,created_at,flight_number,assigned_driver_id,driver_id,customer_email';

    const requests = [
      fetch(
        `${SUPABASE_URL()}/rest/v1/bookings?user_id=eq.${user.id}&select=${fields}&order=created_at.desc&limit=100`,
        { headers: headers() }
      )
    ];

    if (email) {
      requests.push(fetch(
        `${SUPABASE_URL()}/rest/v1/bookings?customer_email=ilike.${encodeURIComponent(email)}&select=${fields}&order=created_at.desc&limit=100`,
        { headers: headers() }
      ));
    }

    const responses = await Promise.all(requests);
    const merged = [];
    const seen = new Set();

    for (const r of responses) {
      if (!r.ok) continue;
      const rows = await r.json();
      for (const row of rows) {
        if (seen.has(row.id)) continue;
        seen.add(row.id);
        merged.push(row);
      }
    }

    merged.sort((a, b) => new Date(b.created_at || 0) - new Date(a.created_at || 0));

    res.statusCode = 200;
    res.end(JSON.stringify({ journeys: attachCustomerStatus(merged.slice(0, 100)) }));
  } catch (err) {
    res.statusCode = 500;
    res.end(JSON.stringify({ error: err.message }));
  }
}

// ── GET /api/account/loyalty ────────────────────────────────────────────────

async function handleLoyalty(req, res, user) {
  if (req.method !== 'GET') {
    res.statusCode = 405;
    return res.end(JSON.stringify({ error: 'Method not allowed' }));
  }

  try {
    const status = await getLoyaltyStatus(user.id);
    res.statusCode = 200;
    res.end(JSON.stringify(status));
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
  if (path.endsWith('/loyalty'))  return handleLoyalty(req, res, user);

  res.statusCode = 404;
  res.end(JSON.stringify({ error: 'Not found' }));
};