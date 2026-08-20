'use strict';

const SUPABASE_URL = () => process.env.SUPABASE_URL || 'https://yoltkmhtxwluqxxpewbl.supabase.co';
const SERVICE_KEY  = () => process.env.SUPABASE_SERVICE_ROLE_KEY;

async function awardPoints(userId, delta) {
  if (!userId || !delta || delta < 1) return;
  const base = SUPABASE_URL(), sk = SERVICE_KEY();
  if (!base || !sk) return;
  const h = {
    'Content-Type': 'application/json',
    'apikey': sk,
    'Authorization': `Bearer ${sk}`
  };
  const cur = await fetch(
    `${base}/rest/v1/profiles?id=eq.${userId}&select=privilege_points&limit=1`,
    { headers: h }
  );
  if (!cur.ok) return;
  const rows = await cur.json();
  const updated = (rows[0]?.privilege_points ?? 0) + delta;
  await fetch(`${base}/rest/v1/profiles`, {
    method: 'POST',
    headers: { ...h, 'Prefer': 'resolution=merge-duplicates,return=minimal' },
    body: JSON.stringify({ id: userId, privilege_points: updated, updated_at: new Date().toISOString() })
  });
}

module.exports = { awardPoints };
