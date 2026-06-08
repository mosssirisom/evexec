'use strict';

// Consolidates: admin-leads.py, contact.py, quote-request.py, update-status.py
// Routes:  GET  /api/leads          → admin list
//          PATCH /api/leads         → update status
//          POST /api/contact        → save contact message
//          POST /api/quote-request  → save quote request

const SUPABASE_URL = () => process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://yoltkmhtxwluqxxpewbl.supabase.co';
const SERVICE_KEY  = () => process.env.SUPABASE_SERVICE_ROLE_KEY;
const ALLOWED_TABLES = ['quote_requests', 'contact_messages'];
const ALLOWED_STATUS = ['new', 'contacted', 'quoted', 'booked', 'lost'];

function dbHeaders(extra = {}) {
  const key = SERVICE_KEY();
  return { 'Content-Type': 'application/json', apikey: key, Authorization: `Bearer ${key}`, ...extra };
}
function adminOk(req) {
  const pw = process.env.ADMIN_PASSWORD || '';
  return pw && (req.headers['x-admin-password'] || '') === pw;
}
async function readBody(req) {
  const chunks = []; for await (const c of req) chunks.push(c);
  return JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}');
}

async function handleAdminList(req, res) {
  if (!adminOk(req)) { res.statusCode = 401; return res.end(JSON.stringify({ error: 'Unauthorised' })); }
  try {
    const [qRes, cRes] = await Promise.all([
      fetch(`${SUPABASE_URL()}/rest/v1/quote_requests?select=*&order=created_at.desc`, { headers: dbHeaders() }),
      fetch(`${SUPABASE_URL()}/rest/v1/contact_messages?select=*&order=created_at.desc`, { headers: dbHeaders() })
    ]);
    res.end(JSON.stringify({ quote_requests: await qRes.json(), contact_messages: await cRes.json() }));
  } catch (err) { res.statusCode = 500; res.end(JSON.stringify({ error: err.message })); }
}

async function handleUpdateStatus(req, res) {
  if (!adminOk(req)) { res.statusCode = 401; return res.end(JSON.stringify({ error: 'Unauthorised' })); }
  let body; try { body = await readBody(req); } catch { res.statusCode = 400; return res.end(JSON.stringify({ error: 'Invalid JSON' })); }
  const { table, id, status } = body;
  if (!ALLOWED_TABLES.includes(table)) { res.statusCode = 400; return res.end(JSON.stringify({ error: 'Invalid table' })); }
  if (!ALLOWED_STATUS.includes(status)) { res.statusCode = 400; return res.end(JSON.stringify({ error: 'Invalid status' })); }
  if (!id) { res.statusCode = 400; return res.end(JSON.stringify({ error: 'Missing id' })); }
  try {
    const r = await fetch(`${SUPABASE_URL()}/rest/v1/${table}?id=eq.${encodeURIComponent(id)}`, { method: 'PATCH', headers: dbHeaders({ Prefer: 'return=representation' }), body: JSON.stringify({ status }) });
    if (!r.ok) throw new Error(await r.text());
    res.end(JSON.stringify({ success: true, updated: await r.json() }));
  } catch (err) { res.statusCode = 500; res.end(JSON.stringify({ error: err.message })); }
}

async function handleContact(req, res) {
  if (req.method !== 'POST') { res.statusCode = 405; return res.end(JSON.stringify({ error: 'Method not allowed' })); }
  let body; try { body = await readBody(req); } catch { res.statusCode = 400; return res.end(JSON.stringify({ error: 'Invalid JSON' })); }
  const name = body.name || body.customer_name; const message = body.message;
  if (!name || !message) { res.statusCode = 400; return res.end(JSON.stringify({ error: 'Name and message are required' })); }
  try {
    const r = await fetch(`${SUPABASE_URL()}/rest/v1/contact_messages`, { method: 'POST', headers: dbHeaders({ Prefer: 'return=representation' }), body: JSON.stringify({ name, phone: body.phone || '', email: body.email || '', message, status: 'new' }) });
    if (!r.ok) throw new Error(await r.text());
    res.end(JSON.stringify({ success: true, message: await r.json() }));
  } catch (err) { res.statusCode = 500; res.end(JSON.stringify({ error: err.message })); }
}

async function handleQuoteRequest(req, res) {
  if (req.method !== 'POST') { res.statusCode = 405; return res.end(JSON.stringify({ error: 'Method not allowed' })); }
  let body; try { body = await readBody(req); } catch { res.statusCode = 400; return res.end(JSON.stringify({ error: 'Invalid JSON' })); }
  const name = body.customer_name || body.name; const phone = body.phone;
  if (!name || !phone) { res.statusCode = 400; return res.end(JSON.stringify({ error: 'Name and phone are required' })); }
  try {
    const payload = { customer_name: name, phone, email: body.email || '', pickup_location: body.pickup_location || '', destination: body.destination || '', pickup_date: body.pickup_date || null, pickup_time: body.pickup_time || '', passengers: parseInt(body.passengers || 1, 10), luggage: body.luggage || '', return_required: Boolean(body.return_required), return_date: body.return_date || null, return_time: body.return_time || '', notes: body.notes || '', status: 'new' };
    const r = await fetch(`${SUPABASE_URL()}/rest/v1/quote_requests`, { method: 'POST', headers: dbHeaders({ Prefer: 'return=representation' }), body: JSON.stringify(payload) });
    if (!r.ok) throw new Error(await r.text());
    res.end(JSON.stringify({ success: true, lead: await r.json() }));
  } catch (err) { res.statusCode = 500; res.end(JSON.stringify({ error: err.message })); }
}

module.exports = async function handler(req, res) {
  res.setHeader('Content-Type', 'application/json');
  const path = (req.url || '').split('?')[0];
  if (path.endsWith('/leads') || path.endsWith('/admin-leads')) {
    if (req.method === 'GET')   return handleAdminList(req, res);
    if (req.method === 'PATCH') return handleUpdateStatus(req, res);
  }
  if (path.endsWith('/contact'))       return handleContact(req, res);
  if (path.endsWith('/quote-request')) return handleQuoteRequest(req, res);
  if (path.endsWith('/update-status') && req.method === 'PATCH') return handleUpdateStatus(req, res);
  res.statusCode = 404; res.end(JSON.stringify({ error: 'Not found' }));
};
