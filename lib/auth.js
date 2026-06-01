'use strict';

async function verifyAuth(req) {
  const header = req.headers['authorization'] || '';
  if (!header.startsWith('Bearer ')) return null;
  const token = header.slice(7);

  const res = await fetch(`${process.env.SUPABASE_URL}/auth/v1/user`, {
    headers: {
      'apikey': process.env.SUPABASE_ANON_KEY,
      'Authorization': `Bearer ${token}`
    }
  });
  if (!res.ok) return null;
  return res.json();
}

module.exports = { verifyAuth };
