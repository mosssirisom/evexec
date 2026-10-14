'use strict';

// Per-operator prices (tenants.pricing) on the website: loading, caching,
// fallback, and that getPrice/lookupPrice and /api/config use them.
// Run: npm run test:unit

const test = require('node:test');
const assert = require('node:assert/strict');

process.env.SUPABASE_SERVICE_ROLE_KEY = 'service-role-unit';
process.env.SUPABASE_URL = 'https://db.test';

const pricing = require('../../lib/pricing');
const { lookupPrice, getPrice } = require('../../lib/format');

const ROW = {
  airports: [
    { name: 'Manchester Airport', code: 'MAN', one_way: 99, return_fare: 180 },
    { name: 'Preston Station', one_way: 40, return_fare: 75 },
  ],
  extra_stop: 7,
};

function fakeFetch(handler) {
  const calls = [];
  global.fetch = async (url, opts) => { calls.push(String(url)); return handler(String(url), opts); };
  return calls;
}
const ok = (body) => ({ ok: true, status: 200, json: async () => body, text: async () => JSON.stringify(body) });

test.afterEach(() => { pricing._setPricing(null); delete global.fetch; });

test('built-in prices are used until the operator list is loaded', () => {
  assert.equal(lookupPrice('Manchester Airport', false), 90);
  assert.equal(lookupPrice('Manchester Airport', true), 160);
  assert.equal(lookupPrice('Nowhere', false), null);
});

test('loads the operator prices and uses them everywhere', async () => {
  const calls = fakeFetch(() => ok([{ pricing: ROW }]));
  await pricing.refreshPricing({ force: true });
  assert.match(calls[0], /\/rest\/v1\/tenants\?id=eq\.00000000-0000-0000-0000-000000000001&select=pricing/);
  assert.equal(lookupPrice('Manchester Airport', false), 99);
  assert.equal(lookupPrice('manchester airport', true), 180);
  assert.equal(lookupPrice('Preston Station', false), 40);
  assert.equal(lookupPrice('Liverpool Airport', false), null, 'an airport the operator removed has no fixed price');
  assert.equal(getPrice({ airport: 'Manchester Airport', return_journey: true }), 180);
  assert.equal(getPrice({ airport: 'Manchester Airport', quoted_price: '85' }), 85, 'a stored price always wins');
  assert.equal(pricing.currentPricing().extraStop, 7);
});

test('loads at most once a minute', async () => {
  const calls = fakeFetch(() => ok([{ pricing: ROW }]));
  await pricing.refreshPricing({ force: true });
  await pricing.refreshPricing();
  await pricing.refreshPricing();
  assert.equal(calls.length, 1);
});

test('falls back to the built-in list when the database fails or has no prices', async () => {
  fakeFetch(() => ({ ok: false, status: 500, json: async () => ({}), text: async () => 'down' }));
  await pricing.refreshPricing({ force: true });
  assert.equal(lookupPrice('Manchester Airport', false), 90);

  fakeFetch(() => ok([{ pricing: null }]));
  await pricing.refreshPricing({ force: true });
  assert.equal(lookupPrice('Leeds Bradford Airport', false), 135);

  fakeFetch(() => ok([{ pricing: { airports: [{ name: 'Bad', one_way: '90', return_fare: 1 }] } }]));
  await pricing.refreshPricing({ force: true });
  assert.equal(lookupPrice('Manchester Airport', false), 90, 'unusable rows are ignored');
});

test('/api/config gives the booking form the operator prices', async () => {
  fakeFetch(() => ok([{ pricing: ROW }]));
  const handler = require('../../api/booking/index.js');
  const res = { headers: {}, statusCode: 0, body: '', setHeader(k, v) { this.headers[k] = v; }, end(b) { this.body = b; } };
  await handler({ method: 'GET', url: '/api/config', headers: {} }, res);
  const body = JSON.parse(res.body);
  assert.deepEqual(body.pricing, {
    airports: [{ name: 'Manchester Airport', oneWay: 99, ret: 180 }, { name: 'Preston Station', oneWay: 40, ret: 75 }],
    extraStop: 7,
  });
});
