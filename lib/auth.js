'use strict';

const SUPABASE_URL  = process.env.SUPABASE_URL  || 'https://yoltkmhtxwluqxxpewbl.supabase.co';
const SUPABASE_ANON = process.env.SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InlvbHRrbWh0eHdsdXF4eHBld2JsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzk0ODMwNjgsImV4cCI6MjA5NTA1OTA2OH0.kLwJK13TsSNn4oK3NZj33awGigWfdKgPP-cbqpqrIbo';

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
