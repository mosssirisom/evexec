'use strict';

// Cancellation policy: charge bands (lib/cancellation.js), recording the
// customer's acceptance, and the two-step self-cancel link in
// /api/booking/cancel, with Supabase, email and push faked.
// Run: npm run test:unit

const test = require('node:test');
const assert = require('node:assert/strict');

process.env.SUPABASE_SERVICE_ROLE_KEY = 'service-role-unit';
process.env.SUPABASE_URL = 'https://db.test';
process.env.RESEND_API_KEY = 're_unit';
process.env.OPERATOR_EMAIL = 'ops@evexec.test';
process.env.OPERATOR_ACTION_SECRET = 'unit-secret';
process.env.SITE_URL = 'https://www.evexec.test';

const P = require('../../lib/cancellation');
const { generateToken } = require('../../lib/token');

const ID = '5b0c1e8a-4f7e-4c9a-9a51-2f1f6f0f6a01';
// Pickup 06:00 UK on 20/11/2026 (GMT, so 06:00Z).
const PICKUP = Date.parse('2026-11-20T06:00:00Z');
const hoursBefore = (h) => new Date(PICKUP - h * 3600000);

function booking(extra = {}) {
  return {
    id: ID, ref: 'EVX-CANCEL01', status: 'Dispatched', operator_response: 'accepted', payment_status: 'Unpaid',
    customer_name: 'Ann Lee', customer_email: 'ann@example.test', customer_phone: '07700900111',
    journey_type: 'To Airport', pickup_location: 'Lytham', airport: 'Manchester Airport', dropoff_address: 'Manchester Airport',
    travel_date: '2026-11-20', travel_time: '06:00', quoted_price: 90, return_journey: false,
    terms_version: '2', created_at: '2026-10-17T09:00:00Z', notes: null, ...extra,
  };
}

test('version 2 bands: free over 48h, 25%, 50%, 100% under 2h', () => {
  const cases = [[72, 0, 0], [48.01, 0, 0], [48, 25, 22.5], [30, 25, 22.5], [24, 25, 22.5], [23.99, 50, 45], [3, 50, 45], [2, 50, 45], [1.99, 100, 90], [-1, 100, 90]];
  for (const [h, pct, charge] of cases) {
    const q = P.cancellationQuote(booking(), hoursBefore(h));
    assert.equal(q.pct, pct, `${h}h`); assert.equal(q.charge, charge, `${h}h`);
  }
});

test('version 1 (no acceptance recorded): free over 24h, 50%, 100%', () => {
  const b = booking({ terms_version: null });
  assert.equal(P.cancellationQuote(b, hoursBefore(30)).pct, 0);
  assert.equal(P.cancellationQuote(b, hoursBefore(10)).pct, 50);
  assert.equal(P.cancellationQuote(b, hoursBefore(1)).pct, 100);
});

test('acceptance recorded in notes counts as version 2', () => {
  const b = booking({ terms_version: undefined, notes: 'Stop 1: X\nAccepted cancellation policy v2 at 10:00 on 17/10/2026.' });
  assert.equal(P.policyVersion(b), '2');
  assert.equal(P.cancellationQuote(b, hoursBefore(30)).pct, 25);
});

test('a request we have not accepted is free to cancel', () => {
  const q = P.cancellationQuote(booking({ status: 'Unassigned', operator_response: null }), hoursBefore(1));
  assert.equal(q.request, true); assert.equal(q.charge, 0);
});

test('return booking: charge on half the return price; refund when paid', () => {
  const q = P.cancellationQuote(booking({ quoted_price: 170, return_journey: true, payment_status: 'Paid' }), hoursBefore(10));
  assert.equal(q.price, 85); assert.equal(q.charge, 42.5); assert.equal(q.paid, 85); assert.equal(q.refund, 42.5);
});

test('BST pickup times are UK local time', () => {
  // 03:30 UK on 03/10/2026 (BST) is 02:30Z.
  assert.equal(P.pickupInstant('2026-10-03', '03:30').toISOString(), '2026-10-03T02:30:00.000Z');
});

test('needsAcceptance: only bookings made after the cutover with nothing recorded', () => {
  assert.equal(P.needsAcceptance(booking({ terms_version: null })), true);
  assert.equal(P.needsAcceptance(booking()), false);
  assert.equal(P.needsAcceptance(booking({ terms_version: null, created_at: '2026-10-01T09:00:00Z' })), false);
});

test('recordAcceptance falls back to notes when the columns are missing', async () => {
  const writes = [];
  const dbUpdate = async (t, id, data) => { writes.push(data); if ('terms_version' in data) throw new Error('column does not exist'); };
  const how = await P.recordAcceptance({ id: ID, notes: 'Stop 1: X' }, dbUpdate, new Date('2026-10-17T09:05:00Z'));
  assert.equal(how, 'notes');
  assert.equal(writes[1].notes, 'Stop 1: X\nAccepted cancellation policy v2 at 10:05 on 17/10/2026.');
});

// ── /api/booking/cancel ────────────────────────────────────────────────────
let row; let patches; let emails; let columnsExist;
global.fetch = async (url, opts = {}) => {
  const u = new URL(url);
  const ok = (body) => ({ ok: true, status: 200, json: async () => body, text: async () => JSON.stringify(body) });
  if (u.host === 'db.test' && u.pathname === '/rest/v1/bookings') {
    if (!opts.method || opts.method === 'GET') return ok([row]);
    if (opts.method === 'PATCH') {
      const data = JSON.parse(opts.body);
      if (!columnsExist && 'cancelled_at' in data) return { ok: false, status: 400, json: async () => ({}), text: async () => 'PGRST204 column not found' };
      patches.push(data); Object.assign(row, data); return ok([]);
    }
  }
  if (u.host === 'api.resend.com') { emails.push(JSON.parse(opts.body)); return ok({ id: 'em_1' }); }
  return ok([]);
};
const handler = require('../../api/booking/index.js');

async function call(method, extra = {}) {
  const token = generateToken(ID, 'cancel');
  const req = { method, url: `/api/booking/cancel?id=${ID}&token=${token}`, query: { id: ID, token }, headers: {}, ...extra };
  const res = { statusCode: 200, headers: {}, setHeader(k, v) { this.headers[k] = v; }, end(b) { this.body = b; } };
  await handler(req, res);
  await new Promise(r => setTimeout(r, 20));
  return res;
}

test('cancel link GET only shows the charge; nothing changes', async () => {
  row = booking({ travel_date: '2099-01-01' }); patches = []; emails = []; columnsExist = true;
  const res = await call('GET');
  assert.match(res.body, /There is no charge for cancelling at this notice/);
  assert.match(res.body, /<form method="post"/);
  assert.equal(patches.length, 0); assert.equal(row.status, 'Dispatched');
});

test('cancel link POST inside 24h: 50% charge recorded and emailed', async () => {
  const soon = new Date(Date.now() + 10 * 3600000);
  const d = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/London' }).format(soon);
  const t = new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/London', hour: '2-digit', minute: '2-digit', hour12: false }).format(soon);
  row = booking({ travel_date: d, travel_time: t }); patches = []; emails = []; columnsExist = true;
  const res = await call('POST');
  assert.match(res.body, /the cancellation charge is £45\.00 \(50% of the fare\)/);
  assert.equal(row.status, 'Cancelled'); assert.equal(row.cancellation_charge, 45); assert.equal(row.cancelled_by, 'customer');
  const customer = emails.find(e => e.to === 'ann@example.test' || (Array.isArray(e.to) && e.to.includes('ann@example.test')));
  assert.ok(customer, 'customer email sent');
  assert.match(customer.html, /£45\.00/);
  assert.doesNotMatch(customer.html, /No payment has been taken/);
});

test('cancel link POST without the new columns still cancels and notes the charge', async () => {
  row = booking({ travel_date: '2099-01-01', notes: 'Stop 1: X' }); patches = []; emails = []; columnsExist = false;
  await call('POST');
  assert.equal(row.status, 'Cancelled');
  assert.match(row.notes, /^Stop 1: X\nCancelled by customer \(link\) at .*: 0% charge £0\.00, policy v2\.$/);
});
