'use strict';
// Customer's yes / no reply to a quoted price. Database and push are faked.
// Run: npm run test:unit

const test = require('node:test');
const assert = require('node:assert/strict');

const TOKEN = '6f1c2b7e-9a3d-4e5f-8a1b-2c3d4e5f6a7b';
const rows = {};
let pushed = [];
const supabasePath = require.resolve('../../lib/supabase');
const pushPath = require.resolve('../../lib/push');
require.cache[supabasePath] = { id: supabasePath, filename: supabasePath, loaded: true, exports: {
  dbFindOne: async (table, f) => (table === 'quote_requests' && rows[f.quote_token]) || null,
  dbUpdateMatching: async (table, filter, data) => {
    const token = /quote_token=eq\.([^&]+)/.exec(filter)[1];
    const row = rows[token];
    if (!row || row.customer_response) return [];
    Object.assign(row, data);
    return [row];
  },
} };
require.cache[pushPath] = { id: pushPath, filename: pushPath, loaded: true, exports: {
  sendPushToOperatorDevices: async (...a) => { pushed.push(a); },
} };

const Q = require('../../lib/quoteResponse');
const { handle } = Q;

function fakeRes() {
  return { statusCode: 200, headers: {}, body: '', setHeader(k, v) { this.headers[k] = v; }, end(b) { this.body = b || ''; } };
}
function reset() {
  for (const k of Object.keys(rows)) delete rows[k];
  rows[TOKEN] = {
    id: 'q1', tenant_id: '00000000-0000-0000-0000-000000000001', customer_name: 'Sam', airport: 'Manchester Airport',
    pickup_location: 'Kirkham', destination: 'Kirkham', pickup_date: '2026-12-08', pickup_time: '18:30:00',
    passengers: 2, return_required: false, quoted_price: 170, customer_response: null, responded_at: null,
  };
  pushed = [];
}

test('GET shows the quote and changes nothing', async () => {
  reset();
  const res = fakeRes();
  await handle({ method: 'GET', query: { t: TOKEN, r: 'yes' } }, res);
  assert.equal(res.statusCode, 200);
  assert.match(res.body, /Confirm you would like to go ahead/);
  assert.match(res.body, /£170/);
  assert.match(res.body, /08\/12\/2026 at 18:30/, 'DD/MM/YYYY and 24-hour time');
  assert.equal(rows[TOKEN].customer_response, null, 'GET must not record a reply');
  assert.equal(pushed.length, 0);
});

test('POST records a yes once and tells the office', async () => {
  reset();
  const first = fakeRes();
  await handle({ method: 'POST', query: { t: TOKEN, r: 'yes' } }, first);
  assert.match(first.body, /Thank you/);
  assert.equal(rows[TOKEN].customer_response, 'yes');
  assert.ok(rows[TOKEN].responded_at);
  assert.equal(pushed.length, 1, 'office is pushed once');
  assert.equal(pushed[0][3], 'quote-reply-q1');
});

test('a second tap cannot change the first answer', async () => {
  reset();
  await handle({ method: 'POST', query: { t: TOKEN, r: 'yes' } }, fakeRes());
  const again = fakeRes();
  await handle({ method: 'POST', query: { t: TOKEN, r: 'no' } }, again);
  assert.match(again.body, /already replied/);
  assert.equal(rows[TOKEN].customer_response, 'yes');
  assert.equal(pushed.length, 1);
});

test('GET after a reply shows it was already answered', async () => {
  reset();
  await handle({ method: 'POST', query: { t: TOKEN, r: 'no' } }, fakeRes());
  const res = fakeRes();
  await handle({ method: 'GET', query: { t: TOKEN, r: 'yes' } }, res);
  assert.match(res.body, /You told us no thank you/);
});

test('an unknown or malformed token gets a not-valid page, not a reply', async () => {
  reset();
  const bad = fakeRes();
  await handle({ method: 'POST', query: { t: 'not-a-token', r: 'yes' } }, bad);
  assert.equal(bad.statusCode, 404);
  const unknown = fakeRes();
  await handle({ method: 'POST', query: { t: '00000000-0000-4000-8000-000000000000', r: 'yes' } }, unknown);
  assert.equal(unknown.statusCode, 404);
  assert.equal(pushed.length, 0);
});

test('only yes or no is accepted', async () => {
  reset();
  const res = fakeRes();
  await handle({ method: 'POST', query: { t: TOKEN, r: 'maybe' } }, res);
  assert.equal(res.statusCode, 400);
  assert.equal(rows[TOKEN].customer_response, null);
});

test('return trips show the return date and time', () => {
  const lines = Q.summary({ airport: 'Manchester Airport', destination: 'Kirkham', pickup_date: '2026-12-08', pickup_time: '09:00', return_required: true, return_date: '2026-12-10', return_time: '17:45', passengers: 1 });
  assert.ok(lines.includes('Return 10/12/2026 at 17:45'));
  assert.ok(lines.includes('1 passenger'));
});
