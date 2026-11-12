'use strict';
const test = require('node:test');
const assert = require('node:assert');
process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-key';
const { handOffSmsToOperator } = require('../../lib/notify');

const booking = { id: 'b0000000-0000-4000-8000-000000000001', customer_name: 'Sam Smith', customer_phone: '07123456789' };

// A tiny fake of the REST API: one operator_sms_tasks table plus push config and the push route.
function fake(initialRows) {
  const rows = initialRows.map((r) => ({ ...r }));
  const calls = [];
  global.fetch = async (url, opts = {}) => {
    const method = opts.method || 'GET';
    calls.push(`${method} ${String(url).replace(/^https?:\/\/[^/]+/, '').split('?')[0]}`);
    const json = (b, ok = true) => ({ ok, json: async () => b, text: async () => JSON.stringify(b) });
    if (String(url).includes('/push_config')) return json([{ webhook_secret: 's3cret' }]);
    if (String(url).includes('/api/push/dispatch')) return json({ ok: true });
    if (String(url).includes('/operator_sms_tasks')) {
      if (method === 'GET') return json(rows.filter((r) => String(url).includes(`kind=eq.${r.kind}`)).map(({ id, message }) => ({ id, message })));
      if (method === 'POST') {
        const b = JSON.parse(opts.body);
        if (rows.some((r) => r.booking_id === b.booking_id && r.kind === b.kind)) return json([]); // ignore-duplicates
        const row = { id: `t${rows.length + 1}`, ...b }; rows.push(row); return json([row]);
      }
      if (method === 'PATCH') {
        const id = String(url).match(/id=eq\.([^&]+)/)[1];
        const row = rows.find((r) => r.id === id); Object.assign(row, JSON.parse(opts.body)); return json([row]);
      }
    }
    throw new Error(`unexpected ${method} ${url}`);
  };
  return { rows, calls };
}
const pushes = (calls) => calls.filter((c) => c.includes('/api/push/dispatch')).length;

test('without supersede, a second text of the same kind is ignored (the original bug)', async () => {
  const f = fake([{ id: 't1', booking_id: booking.id, kind: 'confirmation', message: 'We have received your request', status: 'sent' }]);
  await handOffSmsToOperator(booking, 'Your booking is confirmed', 'confirmation');
  assert.equal(f.rows.length, 1);
  assert.equal(f.rows[0].message, 'We have received your request');
  assert.equal(pushes(f.calls), 0);
});

test('the confirmed text replaces the earlier "received" text and goes back to pending, with one push', async () => {
  const f = fake([{ id: 't1', booking_id: booking.id, kind: 'confirmation', message: 'We have received your request', status: 'sent', sent_at: '2026-11-12T10:00:00Z' }]);
  await handOffSmsToOperator(booking, 'Your booking is confirmed', 'confirmation', { supersede: true });
  assert.equal(f.rows.length, 1);
  assert.equal(f.rows[0].message, 'Your booking is confirmed');
  assert.equal(f.rows[0].status, 'pending');
  assert.equal(f.rows[0].sent_at, null);
  assert.equal(pushes(f.calls), 1);
});

test('a retried accept with the same message changes nothing and does not push again', async () => {
  const f = fake([{ id: 't1', booking_id: booking.id, kind: 'confirmation', message: 'Your booking is confirmed', status: 'pending' }]);
  await handOffSmsToOperator(booking, 'Your booking is confirmed', 'confirmation', { supersede: true });
  assert.equal(f.rows[0].status, 'pending');
  assert.equal(pushes(f.calls), 0);
});

test('with no earlier text, the confirmed text is created and pushed once', async () => {
  const f = fake([]);
  await handOffSmsToOperator(booking, 'Your booking is confirmed', 'confirmation', { supersede: true });
  assert.equal(f.rows.length, 1);
  assert.equal(f.rows[0].status, 'pending');
  assert.equal(pushes(f.calls), 1);
});

// sendBookingConfirmed: the email and the text both go when the customer has both.
test('accepting sends the email AND queues the text when the customer has an email and a phone', async () => {
  process.env.RESEND_API_KEY = 're_test';
  const { sendBookingConfirmed } = require('../../lib/notify');
  const seen = [];
  const rows = [];
  global.fetch = async (url, opts = {}) => {
    const u = String(url); const method = opts.method || 'GET';
    seen.push(`${method} ${u.replace(/^https?:\/\/[^/]+/, '').split('?')[0]}`);
    const json = (b) => ({ ok: true, status: 200, json: async () => b, text: async () => JSON.stringify(b) });
    if (u.includes('api.resend.com')) return json({ id: 'email_1' });
    if (u.includes('/push_config')) return json([{ webhook_secret: 's' }]);
    if (u.includes('/operator_sms_tasks')) {
      if (method === 'GET') return json(rows.map(({ id, message }) => ({ id, message })));
      if (method === 'POST') { const r = { id: 't1', ...JSON.parse(opts.body) }; rows.push(r); return json([r]); }
    }
    return json([]);
  };
  const b = { id: 'b0000000-0000-4000-8000-000000000002', ref: 'EVX-TEST', customer_name: 'Sam Smith', customer_email: 'sam@example.invalid', customer_phone: '07123456789',
    pickup_location: 'Blackpool', airport: 'Manchester Airport', travel_date: '2027-01-05', travel_time: '10:30', quoted_price: 90, tenant_id: '00000000-0000-0000-0000-000000000001' };
  await sendBookingConfirmed(b);
  assert.ok(seen.some((c) => c === 'POST /emails'), 'email sent');
  assert.equal(rows.length, 1, 'text queued');
  assert.match(rows[0].message, /EVX-TEST/);
  assert.match(rows[0].message, /confirmed/);
});

test('accepting with a phone but no email queues only the text', async () => {
  const { sendBookingConfirmed } = require('../../lib/notify');
  const seen = [];
  const rows = [];
  global.fetch = async (url, opts = {}) => {
    const u = String(url); const method = opts.method || 'GET';
    seen.push(u);
    const json = (b) => ({ ok: true, status: 200, json: async () => b, text: async () => JSON.stringify(b) });
    if (u.includes('/push_config')) return json([{ webhook_secret: 's' }]);
    if (u.includes('/operator_sms_tasks')) {
      if (method === 'GET') return json(rows.map(({ id, message }) => ({ id, message })));
      if (method === 'POST') { const r = { id: 't1', ...JSON.parse(opts.body) }; rows.push(r); return json([r]); }
    }
    return json([]);
  };
  await sendBookingConfirmed({ id: 'b0000000-0000-4000-8000-000000000003', ref: 'EVX-TEST2', customer_name: 'Sam', customer_email: '', customer_phone: '07123456789',
    pickup_location: 'Blackpool', airport: 'Manchester Airport', travel_date: '2027-01-05', travel_time: '10:30', quoted_price: 90 });
  assert.equal(rows.length, 1);
  assert.ok(!seen.some((u) => u.includes('api.resend.com')), 'no email');
});
