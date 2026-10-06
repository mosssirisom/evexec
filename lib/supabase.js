'use strict';

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://yoltkmhtxwluqxxpewbl.supabase.co';

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
    `${SUPABASE_URL}/rest/v1/${table}`,
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
    `${SUPABASE_URL}/rest/v1/${table}?id=eq.${encodeURIComponent(id)}&select=*&limit=1`,
    { headers: _headers() }
  );
  if (!res.ok) throw new Error(`DB get failed: ${await res.text()}`);
  const rows = await res.json();
  return rows[0] || null;
}

async function dbFindOne(table, filters, select = '*') {
  const qs = Object.entries(filters).map(([k, v]) => `${k}=eq.${encodeURIComponent(v)}`).join('&');
  const res = await fetch(
    `${SUPABASE_URL}/rest/v1/${table}?${qs}&select=${select}&limit=1`,
    { headers: _headers() }
  );
  if (!res.ok) throw new Error(`DB query failed: ${await res.text()}`);
  const rows = await res.json();
  return rows[0] || null;
}

async function dbUpdate(table, id, data) {
  const res = await fetch(
    `${SUPABASE_URL}/rest/v1/${table}?id=eq.${encodeURIComponent(id)}`,
    {
      method: 'PATCH',
      headers: _headers({ 'Prefer': 'return=minimal' }),
      body: JSON.stringify(data)
    }
  );
  if (!res.ok) throw new Error(`DB update failed: ${await res.text()}`);
}

// PATCH only the rows that also match `filter` (a PostgREST query string, e.g.
// "or=(payment_status.is.null,payment_status.neq.Paid)"); returns the rows
// actually changed, so callers can tell a first update from a repeat.
async function dbUpdateWhere(table, id, filter, data) {
  const res = await fetch(
    `${SUPABASE_URL}/rest/v1/${table}?id=eq.${encodeURIComponent(id)}&${filter}`,
    { method: 'PATCH', headers: _headers({ 'Prefer': 'return=representation' }), body: JSON.stringify(data) }
  );
  if (!res.ok) throw new Error(`DB update failed: ${await res.text()}`);
  return res.json();
}

async function dbRpc(fn, args) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/rpc/${fn}`, {
    method: 'POST',
    headers: _headers(),
    body: JSON.stringify(args || {})
  });
  if (!res.ok) throw new Error(`DB rpc ${fn} failed: ${await res.text()}`);
  return res.json();
}

module.exports = { dbInsert, dbGet, dbUpdate, dbUpdateWhere, dbFindOne, dbRpc, isValidUUID };
