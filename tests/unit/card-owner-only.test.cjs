'use strict';
// Card payments are taken only into the Stripe account's own business until a
// business has its own connected account.
process.env.STRIPE_SECRET_KEY = 'sk_test_unit';
const test = require('node:test');
const assert = require('node:assert/strict');
const H = require('./_siteHarness.cjs');

const EV = '00000000-0000-0000-0000-000000000001';
const OTHER = 'dddddddd-0000-4000-8000-000000000002';
const BOOKING_ID = 'cccccccc-0000-4000-8000-00000000f001';
H.install([{ id: OTHER, name: 'Coastal Cars', contact_email: 'hello@coastal.test', brand: {}, pricing: null }, { id: EV, name: 'EV Exec', brand: {}, pricing: null }]);

let stripeCalls = 0;
let tenantOfBooking = OTHER;
const base = global.fetch;
global.fetch = async (url, opts = {}) => {
  const u = String(url);
  if (u.includes('api.stripe.com')) { stripeCalls++; return { ok: true, status: 200, json: async () => ({ id: 'cs_test', url: 'https://stripe.test/pay', status: 'open' }), text: async () => '{}' }; }
  if (u.includes('/rest/v1/bookings') && (opts.method || 'GET') === 'GET') {
    return { ok: true, status: 200, text: async () => '[]', json: async () => ([{
      id: BOOKING_ID, ref: 'EVX-CARD1', tenant_id: tenantOfBooking, status: 'Dispatched', operator_response: 'accepted', payment_status: 'Unpaid',
      customer_name: 'Jo', customer_email: 'jo@example.test', quoted_price: 90, airport: 'Manchester Airport', journey_type: 'To Airport',
      travel_date: '2099-01-01', travel_time: '09:00', terms_version: '4',
    }]) };
  }
  return base(url, opts);
};

const payment = require('../../api/payment/index.js');
const { cardPaymentsAllowed } = require('../../lib/payments');

test('only the Stripe account owner\'s business (or a booking with no business) may take card payments', () => {
  assert.equal(cardPaymentsAllowed(EV), true);
  assert.equal(cardPaymentsAllowed(null), true);
  assert.equal(cardPaymentsAllowed(OTHER), false);
});

test('a card checkout for another business is refused and never reaches Stripe', async () => {
  tenantOfBooking = OTHER; stripeCalls = 0;
  const r = await H.call(payment, '/api/payment/create-checkout-session', { bookingId: BOOKING_ID });
  assert.equal(r.status, 400, r.body);
  assert.match(JSON.parse(r.body).error, /Coastal Cars does not take card payments online yet/);
  assert.equal(stripeCalls, 0, 'no Stripe request was made');
});

test('EV Exec\'s own bookings still reach Stripe', async () => {
  tenantOfBooking = EV; stripeCalls = 0;
  const r = await H.call(payment, '/api/payment/create-checkout-session', { bookingId: BOOKING_ID });
  assert.notEqual(JSON.parse(r.body).error && /does not take card payments/.test(JSON.parse(r.body).error), true, r.body);
  assert.ok(stripeCalls >= 1, `Stripe was called (${r.status} ${r.body})`);
});
