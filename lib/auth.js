'use strict';

const SUPABASE_URL  = process.env.SUPABASE_URL  || 'https://yoltkmhtxwluqxxpewbl.supabase.co';
// Must match the anon key returned by /api/config (api/booking/index.js), since that is the
// key the browser's Supabase client actually authenticates with. A mismatched
// SUPABASE_ANON_KEY env var causes Supabase's gateway to reject every /auth/v1/user
// check with 401, even for valid user sessions.
const SUPABASE_ANON = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InlvbHRrbWh0eHdsdXF4eHBld2JsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzk0ODMwNjgsImV4cCI6MjA5NTA1OTA2OH0.kLwJK13TsSNn4oK3NZj33awGigWfdKgPP-cbqpqrIbo';

async function verifyAuth(req) {
  const header = req.headers['authorization'] || '';
  if (!header.startsWith('Bearer ')) return null;
  const token = header.slice(7);

  const res = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
    headers: {
      'apikey': SUPABASE_ANON,
      'Authorization': `Bearer ${token}`
    }
  });
  if (!res.ok) return null;
  return res.json();
}

module.exports = { verifyAuth };
