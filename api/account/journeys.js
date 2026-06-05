'use strict';

const { verifyAuth } = require('../../lib/auth');

const SUPABASE_URL = () => process.env.SUPABASE_URL || 'https://yoltkmhtxwluqxxpewbl.supabase.co';
const SERVICE_KEY  = () => process.env.SUPABASE_SERVICE_ROLE_KEY;

function headers() {
  return {
    'Content-Type': 'application/json',
    'apikey': SERVICE_KEY(),
    'Authorization': `Bearer ${SERVICE_KEY()}`
  };
}

module.exports = async function handler(req, res) {
  res.setHeader('Content-Type', 'application/json');

  if (req.method !== 'GET') {
    res.statusCode = 405;
    return res.end(JSON.stringify({ error: 'Method not allowed' }));
  }

  const user = await verifyAuth(req);
  if (!user) {
    res.statusCode = 401;
    return res.end(JSON.stringify({ error: 'Unauthorised' }));
  }

  try {
    const email = user.email || '';
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
};
