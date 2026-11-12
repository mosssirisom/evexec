'use strict';
// A website deployed for a business other than EV Exec (TENANT_ID set) files
// everything a customer creates under THAT business, never under EV Exec.
process.env.TENANT_ID = 'dddddddd-0000-4000-8000-000000000002';

const test = require('node:test');
const assert = require('node:assert/strict');
const H = require('./_siteHarness.cjs');

const COASTAL = process.env.TENANT_ID;
H.install([{
  id: COASTAL, name: 'Coastal Cars', ref_prefix: 'COAS', contact_email: 'hello@coastal.test', contact_phone: '07123456789', brand: {},
  pricing: { airports: [{ name: 'Manchester Airport', code: 'MAN', one_way: 50, return_fare: 90 }], extra_stop: 2 },
}]);

const booking = require('../../api/booking/index.js');
const leads = require('../../api/leads.js');
const tables = (name) => H.posts.filter((p) => p.table === name);

test('a booking is filed under this site\'s business, not EV Exec', async () => {
  H.posts.length = 0;
  const r = await H.call(booking, '/api/booking/create', H.bookingBody());
  assert.ok(r.status < 400, `create failed: ${r.status} ${r.body}`);
  const rows = tables('bookings');
  assert.equal(rows.length, 1);
  assert.equal(rows[0].body.tenant_id, COASTAL);
  assert.match(rows[0].body.ref, /^COAS-[A-Z0-9]+$/, 'reference uses this business\'s own prefix');
  assert.equal(rows[0].body.quoted_price, 50, 'priced from this business\'s own price list');
});

test('both legs of a return booking are filed under this site\'s business', async () => {
  H.posts.length = 0;
  const r = await H.call(booking, '/api/booking/create', H.bookingBody({ return_journey: true, return_date: H.futureDate(), return_time: '18:00' }));
  assert.ok(r.status < 400, `create failed: ${r.status} ${r.body}`);
  const rows = tables('bookings');
  assert.equal(rows.length, 2, 'outbound and return leg');
  for (const row of rows) { assert.equal(row.body.tenant_id, COASTAL); assert.match(row.body.ref, /^COAS-/); }
});

test('a quote request and a contact message are filed under this site\'s business', async () => {
  H.posts.length = 0;
  const q = await H.call(leads, '/api/quote-request', { customer_name: 'Jo', phone: '07000000001', pickup_location: 'A', destination: 'B' });
  assert.ok(q.status < 400, `quote failed: ${q.status} ${q.body}`);
  const c = await H.call(leads, '/api/contact', { name: 'Jo', message: 'Hello' });
  assert.ok(c.status < 400, `contact failed: ${c.status} ${c.body}`);
  assert.equal(tables('quote_requests')[0].body.tenant_id, COASTAL);
  assert.equal(tables('contact_messages')[0].body.tenant_id, COASTAL);
});
