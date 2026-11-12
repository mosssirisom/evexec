'use strict';
// EV Exec's own website (TENANT_ID not set) still files everything under EV Exec.
delete process.env.TENANT_ID;

const test = require('node:test');
const assert = require('node:assert/strict');
const H = require('./_siteHarness.cjs');

const EV = '00000000-0000-0000-0000-000000000001';
H.install([{ id: EV, name: 'EV Exec', contact_email: 'book@evexec.co.uk', contact_phone: '07721070370', brand: {}, pricing: null }]);

const booking = require('../../api/booking/index.js');
const leads = require('../../api/leads.js');
const tables = (name) => H.posts.filter((p) => p.table === name);

test('EV Exec\'s website files a booking, a quote request and a message under EV Exec', async () => {
  H.posts.length = 0;
  const b = await H.call(booking, '/api/booking/create', H.bookingBody());
  assert.ok(b.status < 400, `create failed: ${b.status} ${b.body}`);
  await H.call(leads, '/api/quote-request', { customer_name: 'Jo', phone: '07000000001', pickup_location: 'A', destination: 'B' });
  await H.call(leads, '/api/contact', { name: 'Jo', message: 'Hello' });
  assert.equal(tables('bookings')[0].body.tenant_id, EV);
  assert.equal(tables('quote_requests')[0].body.tenant_id, EV);
  assert.equal(tables('contact_messages')[0].body.tenant_id, EV);
  assert.equal(tables('bookings')[0].body.quoted_price, 90, 'EV Exec\'s built-in prices still apply');
});
