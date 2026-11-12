'use strict';
const test = require('node:test');
const assert = require('node:assert');
const brand = require('../../lib/brand');
const E = require('../../lib/emailContent');

const TID = '12292a56-8240-4741-958b-509950c15cfe';
const booking = (overrides = {}) => ({
  id: 'b1111111-0000-4000-8000-000000000001', ref: 'TEST-0001', tenant_id: TID, customer_name: 'Sam Smith',
  customer_email: 'sam@example.invalid', customer_phone: '07123456789', pickup_location: 'Manchester Airport',
  dropoff_address: '9 Norman Close, FY5 3UA', airport: 'Manchester Airport', travel_date: '2027-01-05', travel_time: '10:30',
  passengers: 1, status: 'Dispatched', quoted_price: 90, payment_status: 'Unpaid', source: 'website', ...overrides,
});

test('a business with its own website gets pay links on its own site, never EV Exec\'s', () => {
  brand._setBrands({ [TID]: { name: 'Test Operator', contact_email: 'ops@test.invalid', brand: { site_url: 'https://testoperator.example' }, ref_prefix: 'TEST' } });
  const m = E.bookingConfirmed(booking(), { payUrl: 'https://testoperator.example/booking?id=b1111111-0000-4000-8000-000000000001' });
  assert.match(m.text, /https:\/\/testoperator\.example\/booking/);
  assert.doesNotMatch(m.text + m.html, /evexec\.co\.uk/);
});

test('a business with no website gets no Pay link and no link to EV Exec', () => {
  brand._setBrands({ [TID]: { name: 'Test Operator', contact_email: 'ops@test.invalid', brand: {}, ref_prefix: 'TEST' } });
  const m = E.bookingConfirmed(booking(), {});
  assert.doesNotMatch(m.text, /Pay now or choose cash/);
  assert.doesNotMatch(m.text + m.html, /evexec\.co\.uk/);
  assert.doesNotMatch(m.html, /href="\/booking/);
});
