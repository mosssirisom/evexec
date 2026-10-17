'use strict';

// The emailed Accept / Reject links for website requests (api/operator):
// a return booking is one request, so its £0 return leg takes the same
// decision and the customer gets one email. Run: npm run test:unit

const test = require('node:test');
const assert = require('node:assert/strict');

process.env.SUPABASE_URL = 'https://db.test';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'service-role-unit';
process.env.RESEND_API_KEY = 're_unit';
process.env.OPERATOR_ACTION_SECRET = 'unit-secret';
process.env.SITE_URL = 'https://www.evexec.test';

const OUT = 'a1b2c3d4-0000-4000-8000-000000000001';
const LEG = 'a1b2c3d4-0000-4000-8000-000000000002';
const OTHER = 'a1b2c3d4-0000-4000-8000-000000000003';
let db; let emails;

function reset() {
  const base = { source: 'website', operator_response: null, status: 'Unassigned', customer_name: 'Web Customer', customer_email: 'web@example.test', customer_phone: '07700900000', airport: 'Manchester Airport', travel_date: '2026-12-01', travel_time: '04:30', payment_status: 'Unpaid' };
  db = [
    { ...base, id: OUT, ref: 'EVX-WEBOUT1', return_journey: true, return_date: '2026-12-08', return_time: '18:30', quoted_price: 160, pickup_location: 'Kirkham', dropoff_address: 'Manchester Airport', notes: null },
    { ...base, id: LEG, ref: 'EVX-WEBRET1', return_journey: false, quoted_price: 0, travel_date: '2026-12-08', travel_time: '18:30', pickup_location: 'Manchester Airport', dropoff_address: 'Kirkham', notes: 'Return leg created automatically from return booking. Original return fare: £160. Outbound ref: EVX-WEBOUT1' },
    { ...base, id: OTHER, ref: 'EVX-WEBRET2', return_journey: false, quoted_price: 0, notes: 'Return leg created automatically from return booking. Outbound ref: EVX-SOMEONEELSE' },
  ];
  emails = [];
}

// Minimal PostgREST: eq / is.null / like (with *) / not.in filters.
function matches(row, params) {
  for (const [k, v] of params) {
    if (['select', 'limit'].includes(k)) continue;
    let m;
    if ((m = /^eq\.(.*)$/.exec(v))) { if (String(row[k]) !== m[1]) return false; }
    else if (v === 'is.null') { if (row[k] != null) return false; }
    else if ((m = /^like\.(.*)$/.exec(v))) { const re = new RegExp('^' + m[1].split('*').map((s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('.*') + '$', 's'); if (!re.test(String(row[k] ?? ''))) return false; }
    else if ((m = /^not\.in\.\((.*)\)$/.exec(v))) { if (m[1].split(',').includes(String(row[k]))) return false; }
    else throw new Error(`unexpected filter ${k}=${v}`);
  }
  return true;
}
const json = (body, status = 200) => ({ ok: status < 400, status, json: async () => body, text: async () => JSON.stringify(body) });
global.fetch = async (url, opts = {}) => {
  const u = new URL(url);
  const method = (opts.method || 'GET').toUpperCase();
  if (u.host === 'api.resend.com') { emails.push(JSON.parse(opts.body)); return json({ id: 'e' }); }
  if (u.host === 'db.test') {
    const table = u.pathname.replace('/rest/v1/', '');
    if (table !== 'bookings') return json([]);
    const params = [...u.searchParams.entries()];
    if (method === 'GET') return json(db.filter((r) => matches(r, params)));
    if (method === 'PATCH') { const rows = db.filter((r) => matches(r, params)); rows.forEach((r) => Object.assign(r, JSON.parse(opts.body))); return json(rows); }
    if (method === 'POST') return json([], 201);
  }
  return json({});
};

const handler = require('../../api/operator/index.js');
const { generateToken } = require('../../lib/token');
function act(action, id) {
  return new Promise((resolve) => {
    const res = { statusCode: 200, headers: {}, setHeader(k, v) { this.headers[k] = v; }, end(b) { resolve({ status: this.statusCode, body: b }); } };
    handler({ method: 'POST', url: `/api/operator/${action}?id=${id}`, query: { id, token: generateToken(id, action) }, headers: {} }, res);
  });
}
const row = (id) => db.find((r) => r.id === id);
test.beforeEach(reset);

test('accepting a website return booking accepts its return leg too, one confirmation email', async () => {
  const r = await act('accept', OUT);
  assert.equal(r.status, 200);
  assert.equal(row(OUT).operator_response, 'accepted');
  assert.equal(row(LEG).operator_response, 'accepted');
  assert.equal(row(LEG).status, 'Unassigned'); // still needs a driver
  assert.equal(row(OTHER).operator_response, null); // someone else's return leg untouched
  const toCustomer = emails.filter((e) => [].concat(e.to).includes('web@example.test'));
  assert.equal(toCustomer.length, 1);
  assert.match(toCustomer[0].subject, /^Booking confirmed/);
});

test('rejecting a website return booking cancels its return leg too, one email', async () => {
  await act('reject', OUT);
  assert.equal(row(OUT).status, 'Cancelled');
  assert.equal(row(LEG).operator_response, 'rejected');
  assert.equal(row(LEG).status, 'Cancelled');
  assert.equal(row(OTHER).status, 'Unassigned');
  assert.equal(emails.filter((e) => [].concat(e.to).includes('web@example.test')).length, 1);
});

test('a single (non-return) request leaves other bookings alone', async () => {
  row(OUT).return_journey = false;
  await act('accept', OUT);
  assert.equal(row(LEG).operator_response, null);
});
