'use strict';

// Consolidates: admin-leads.py, contact.py, quote-request.py, update-status.py
// Routes:  GET  /api/leads          → admin list
//          PATCH /api/leads         → update status
//          POST /api/contact        → save contact message
//          POST /api/quote-request  → save quote request

const crypto = require('crypto');

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
  const supplied = req.headers['x-admin-password'] || '';
  // Constant-time comparison -- a plain === here lets an attacker recover
  // the password one character at a time by measuring response time,
  // since string comparison short-circuits on the first mismatch. Same
  // pattern already used correctly in api/operator/index.js and
  // api/notifications/index.js; this endpoint had been missed.
  if (!pw || pw.length !== supplied.length) return false;
  return crypto.timingSafeEqual(Buffer.from(pw), Buffer.from(supplied));
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

// Fields are capped so the public form cannot be used to store or email
// arbitrarily large payloads.
const clip = (v, n = 200) => String(v == null ? '' : v).trim().slice(0, n);
const escHtml = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

// Quote requests used to be saved silently. The website's quote form now
// emails and push-notifies the operator so a request is never missed, and
// acknowledges the customer by email when they gave one.
async function notifyQuoteRequest(q) {
  const { sendEmail, sendPushToOperator } = require('../lib/notify');
  const { emailLayout } = require('../lib/emailLayout');
  const rows = [
    ['Name', q.customer_name], ['Phone', q.phone], ['Email', q.email],
    ['Pickup', q.pickup_location], ['Destination', q.destination],
    ['Date', [q.pickup_date, q.pickup_time].filter(Boolean).join(' at ')],
    ['Passengers', q.passengers], ['Luggage', q.luggage],
    ['Return', q.return_required ? [q.return_date, q.return_time].filter(Boolean).join(' at ') || 'Yes' : ''],
    ['Notes', q.notes],
  ].filter(([, v]) => v !== '' && v != null)
    .map(([k, v]) => `<tr><td style="padding:8px 0;color:#64748b;width:110px;font-size:12px;text-transform:uppercase;letter-spacing:.04em;vertical-align:top;border-bottom:1px solid #eef0f3">${k}</td><td style="padding:8px 0;font-weight:700;color:#0f1b33;font-size:14px;vertical-align:top;border-bottom:1px solid #eef0f3">${escHtml(v)}</td></tr>`).join('');
  const tasks = [];
  const opEmail = (process.env.OPERATOR_EMAIL || '').trim();
  if (opEmail) {
    const html = emailLayout({ title: 'New Quote Request', body: `<p style="margin:0 0 16px;font-size:15px;color:#0f1b33">A customer has asked for a quote on the website. Reply with a fixed price.</p><table role="presentation" width="100%" cellpadding="0" cellspacing="0">${rows}</table><p style="margin:18px 0 0;font-size:14px;color:#475569"><a href="tel:${escHtml(q.phone)}" style="color:#8a6416">Call ${escHtml(q.phone)}</a></p>` });
    tasks.push(sendEmail({ to: opEmail, subject: `Quote request: ${clip(q.pickup_location, 60)} to ${clip(q.destination, 60)}`.replace(/[\r\n]+/g, ' '), html }));
  }
  tasks.push(sendPushToOperator('New quote request', `${q.customer_name}: ${q.pickup_location} to ${q.destination}`, '/operator'));
  if (q.email && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(q.email)) {
    const first = escHtml(q.customer_name.split(' ')[0] || 'there');
    const html = emailLayout({ title: 'Quote Request Received', body: `<p style="margin:0 0 6px;font-size:15px;color:#0f1b33">Hi ${first},</p><p style="margin:0 0 16px;font-size:15px;color:#334155;line-height:1.6">Thank you for your quote request. We will reply with a fixed price, usually the same day.</p><table role="presentation" width="100%" cellpadding="0" cellspacing="0">${rows}</table><p style="margin:18px 0 0;font-size:13px;color:#64748b">Questions? Call or WhatsApp <a href="tel:07721070370" style="color:#8a6416;text-decoration:none">07721 070370</a></p>` });
    tasks.push(sendEmail({ to: q.email, subject: 'Your EV Exec quote request', html }));
  }
  const results = await Promise.allSettled(tasks);
  results.filter((r) => r.status === 'rejected').forEach((r) => console.error('quote notify failed:', r.reason && r.reason.message));
}

async function handleQuoteRequest(req, res) {
  if (req.method !== 'POST') { res.statusCode = 405; return res.end(JSON.stringify({ error: 'Method not allowed' })); }
  let body; try { body = await readBody(req); } catch { res.statusCode = 400; return res.end(JSON.stringify({ error: 'Invalid JSON' })); }
  // Honeypot: real visitors never see or fill this field.
  if (body.company_website) return res.end(JSON.stringify({ success: true }));
  const name = clip(body.customer_name || body.name, 120); const phone = clip(body.phone, 40);
  if (!name || !phone) { res.statusCode = 400; return res.end(JSON.stringify({ error: 'Name and phone are required' })); }
  const isDate = (d) => /^\d{4}-\d{2}-\d{2}$/.test(d || '');
  try {
    const payload = { customer_name: name, phone, email: clip(body.email, 200), pickup_location: clip(body.pickup_location, 300), destination: clip(body.destination, 300), pickup_date: isDate(body.pickup_date) ? body.pickup_date : null, pickup_time: clip(body.pickup_time, 10), passengers: Math.min(Math.max(parseInt(body.passengers || 1, 10) || 1, 1), 16), luggage: clip(body.luggage, 200), return_required: Boolean(body.return_required), return_date: isDate(body.return_date) ? body.return_date : null, return_time: clip(body.return_time, 10), notes: clip(body.notes, 2000), status: 'new' };
    const r = await fetch(`${SUPABASE_URL()}/rest/v1/quote_requests`, { method: 'POST', headers: dbHeaders({ Prefer: 'return=representation' }), body: JSON.stringify(payload) });
    if (!r.ok) throw new Error(await r.text());
    const lead = await r.json();
    await notifyQuoteRequest(payload).catch((e) => console.error('quote notify failed:', e.message));
    res.end(JSON.stringify({ success: true, lead }));
  } catch (err) { console.error('quote-request failed:', err.message); res.statusCode = 500; res.end(JSON.stringify({ error: 'Could not save your request' })); }
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
