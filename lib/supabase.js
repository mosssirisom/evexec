'use strict';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
function isValidUUID(id) { return UUID_RE.test(String(id)); }

function _headers(extra = {}) {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  return {
    'Content-Type': 'application/json',
    'apikey': key,
    'Authorization': `Bearer ${key}`,
    ...extra
  };
}

async function dbInsert(table, data) {
  const res = await fetch(
    `${process.env.SUPABASE_URL}/rest/v1/${table}`,
    {
      method: 'POST',
      headers: _headers({ 'Prefer': 'return=representation' }),
      body: JSON.stringify(data)
    }
  );
  if (!res.ok) throw new Error(`DB insert failed: ${await res.text()}`);
  const rows = await res.json();
  return rows[0];
}

async function dbGet(table, id) {
  const res = await fetch(
    `${process.env.SUPABASE_URL}/rest/v1/${table}?id=eq.${encodeURIComponent(id)}&select=*&limit=1`,
    { headers: _headers() }
  );
  if (!res.ok) throw new Error(`DB get failed: ${await res.text()}`);
  const rows = await res.json();
  return rows[0] || null;
}

async function dbUpdate(table, id, data) {
  const res = await fetch(
    `${process.env.SUPABASE_URL}/rest/v1/${table}?id=eq.${encodeURIComponent(id)}`,
    {
      method: 'PATCH',
      headers: _headers({ 'Prefer': 'return=minimal' }),
      body: JSON.stringify(data)
    }
  );
  if (!res.ok) throw new Error(`DB update failed: ${await res.text()}`);
}

module.exports = { dbInsert, dbGet, dbUpdate, isValidUUID };
