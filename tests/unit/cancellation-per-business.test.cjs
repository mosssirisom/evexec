'use strict';
// Each operator's own cancellation bands (brand.legal.policy) decide the charge
// for its bookings on the current terms version. Older versions keep their fixed
// bands, and EV Exec's charges do not change.
const test = require('node:test');
const assert = require('node:assert/strict');

const EV = '00000000-0000-0000-0000-000000000001';
const COASTAL = 'dddddddd-0000-4000-8000-000000000002';
const brand = require('../../lib/brand');
const P = require('../../lib/cancellation');

brand._setBrands({
  [EV]: { name: 'EV Exec', brand: {} },
  [COASTAL]: { name: 'Coastal Cars', brand: { legal: { policy: { standard: [
    { hours: 72, pct: 0 }, { hours: 24, pct: 50 }, { hours: 4, pct: 75 },
  ] } } } },
});

// A confirmed booking with a pickup at a fixed UK time, and `hoursBefore` as the moment of cancelling.
const pickupAt = new Date('2026-12-01T12:00:00Z');
const booking = (over = {}) => ({
  travel_date: '2026-12-01', travel_time: '12:00', status: 'Dispatched', operator_response: 'accepted',
  source: 'website', quoted_price: 100, payment_status: 'Unpaid', terms_version: '4', tenant_id: COASTAL, ...over,
});
const at = (hours) => new Date(pickupAt.getTime() - hours * 3600000);

test('an operator\'s own bands set the charge for its bookings on the current terms', () => {
  assert.equal(P.cancellationQuote(booking(), at(100)).pct, 0, 'more than 72 hours: free');
  assert.equal(P.cancellationQuote(booking(), at(30)).pct, 50, 'between 24 and 72 hours: its 50%');
  assert.equal(P.cancellationQuote(booking(), at(10)).pct, 75, 'between 4 and 24 hours: its 75%');
  assert.equal(P.cancellationQuote(booking(), at(2)).pct, 100, 'under 4 hours: 100%');
  assert.equal(P.cancellationQuote(booking(), at(30)).charge, 50, 'the charge is the percentage of the fare');
});

test('the free-cancellation deadline follows the operator\'s own first band', () => {
  const line = P.freeCancellationLine(booking(), at(100));
  assert.match(line, /^Free cancellation until 12:00 on 28\/11\/2026\.$/, '72 hours before pickup');
});

test('a booking on an older terms version keeps that version\'s fixed bands', () => {
  // Version 3 is 25% from 48 hours; the operator's own 50% band does not apply to it.
  assert.equal(P.cancellationQuote(booking({ terms_version: '3' }), at(30)).pct, 25);
});

test('EV Exec, and any business that has not set its own bands, keep the standard bands', () => {
  const ev = booking({ tenant_id: EV });
  assert.equal(P.cancellationQuote(ev, at(30)).pct, 25);
  assert.equal(P.cancellationQuote(ev, at(100)).pct, 0);
  assert.equal(P.cancellationQuote(booking({ tenant_id: null }), at(30)).pct, 25);
});

test('the operator\'s bands can never make the first band anything but free', () => {
  brand._setBrands({ [COASTAL]: { name: 'X', brand: { legal: { policy: { standard: [
    { hours: 72, pct: 10 }, { hours: 24, pct: 50 }, { hours: 4, pct: 75 },
  ] } } } } });
  assert.equal(brand.brandFor(COASTAL).policy, null, 'a first band above 0% is ignored');
  assert.equal(P.cancellationQuote(booking(), at(30)).pct, 25, 'the standard bands are used instead');
});

test('bands that do not get stricter are ignored', () => {
  brand._setBrands({ [COASTAL]: { name: 'X', brand: { legal: { policy: { standard: [
    { hours: 24, pct: 0 }, { hours: 72, pct: 50 }, { hours: 4, pct: 75 },
  ] } } } } });
  assert.equal(brand.brandFor(COASTAL).policy, null);
});
