'use strict';

// Customer reminder tests: the real /api/reminders/trigger handler with
// Supabase (PostgREST) and Resend replaced by an in-memory fake. Checks that
// every customer gets the email when they have one AND the driver two-tap SMS
// handoff when they have a phone number, for both the week-ahead and the
// day-before reminder. Run: npm run test:unit

const test = require('node:test');
const assert = require('node:assert/strict');

process.env.SUPABASE_SERVICE_ROLE_KEY = 'service-role-unit';
process.env.SUPABASE_URL = 'https://db.test';
process.env.RESEND_API_KEY = 're_unit';
process.env.CRON_SECRET = 'cron-unit';
delete process.env.VAPID_PUBLIC_KEY;
delete process.env.VAPID_PRIVATE_KEY;

// Dates relative to today in UK time, so the tests work on any day.
function londonDate(offsetDays) {
  const p = new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/London', year: 'numeric', month: '2-digit', day: '2-digit' })
    .formatToParts(new Date()).reduce((a, x) => { a[x.type] = x.value; return a; }, {});
  const d = new Date(Date.UTC(+p.year, +p.month - 1, +p.day + offsetDays));
  return d.toISOString().slice(0, 10);
}

const DRIVER = { id: 'drv-1', full_name: 'Moss Driver', vehicle_registration: 'EV12 XEC', vehicle_model: 'Tesla Model Y' };
let db; let emails; let failEmail;

function booking(id, extra) {
  return {
    id, ref: `EVX-${id.toUpperCase()}`, status: 'Dispatched', customer_name: 'Jane Customer',
    customer_email: 'jane@example.test', customer_phone: '07700900001', assigned_driver_id: DRIVER.id,
    journey_type: 'To Airport', pickup_location: 'Lytham St Annes', airport: 'Manchester Airport',
    travel_date: londonDate(1), travel_time: '23:30', payment_status: 'Unpaid', payment_method: 'Cash', ...extra
  };
}

function reset(bookings) {
  db = { bookings, drivers: [DRIVER], notification_log: [], driver_sms_reminders: [], notification_queue: [] };
  emails = []; failEmail = false;
}

const json = (body, status = 200) => ({ ok: status < 400, status, json: async () => body, text: async () => JSON.stringify(body) });
const inList = (v) => v.replace(/^in\.\(|\)$/g, '').split(',');

global.fetch = async (url, opts = {}) => {
  const u = new URL(url);
  const method = (opts.method || 'GET').toUpperCase();
  if (u.host === 'api.resend.com') {
    if (failEmail) return json({ message: 'Resend down' }, 500);
    emails.push(JSON.parse(opts.body));
    return json({ id: `em_${emails.length}` });
  }
  assert.equal(u.host, 'db.test', `unexpected request to ${url}`);
  const table = u.pathname.replace('/rest/v1/', '');
  const q = u.searchParams;
  if (method === 'GET' && table === 'bookings') {
    const [from, to] = q.getAll('travel_date').map(v => v.slice(4));
    return json(db.bookings.filter(b => b.travel_date >= from && b.travel_date <= to && b.status === q.get('status').slice(3)));
  }
  if (method === 'GET' && table === 'drivers') return json(db.drivers.filter(d => inList(q.get('id')).includes(d.id)));
  if (method === 'GET' && table === 'notification_log') {
    const ids = inList(q.get('booking_id')); const type = q.get('type').slice(3);
    return json(db.notification_log.filter(r => ids.includes(r.booking_id) && r.type === type));
  }
  if (method === 'POST' && table === 'notification_log') {
    const rows = [].concat(JSON.parse(opts.body)).map(r => ({ ...r, sent_at: new Date().toISOString() }));
    db.notification_log.push(...rows); return json(null, 201);
  }
  if (method === 'POST' && table === 'driver_sms_reminders') {
    // Unique (booking_id, reminder_type) with Prefer: resolution=ignore-duplicates.
    const row = JSON.parse(opts.body);
    if (!db.driver_sms_reminders.some(r => r.booking_id === row.booking_id && r.reminder_type === row.reminder_type)) db.driver_sms_reminders.push(row);
    return json(null, 201);
  }
  if (method === 'POST' && table === 'notification_queue') { db.notification_queue.push(JSON.parse(opts.body)); return json([{ id: 'q1' }], 201); }
  throw new Error(`unexpected ${method} ${url}`);
};

const handler = require('../../api/reminders/trigger.js');

async function run() {
  const res = { statusCode: 0, body: '', setHeader() {}, end(b) { this.body = b; } };
  await handler({ headers: { authorization: 'Bearer cron-unit' } }, res);
  assert.equal(res.statusCode, 200, res.body);
  return JSON.parse(res.body);
}
const handoffs = (id) => db.driver_sms_reminders.filter(r => r.booking_id === id);
const channels = (id, type) => db.notification_log.filter(r => r.booking_id === id && r.type === type).map(r => r.channel).sort();

test('day before: customer with email and phone gets the email AND the driver SMS handoff', async () => {
  reset([booking('both')]);
  const out = await run();
  assert.equal(out.day1, 1);
  assert.equal(emails.length, 1);
  assert.deepEqual(emails[0].to, ['jane@example.test']);
  assert.equal(emails[0].subject, 'Reminder: Your Transfer is Tomorrow');
  const h = handoffs('both');
  assert.equal(h.length, 1);
  assert.equal(h[0].reminder_type, '24hr');
  assert.equal(h[0].driver_id, DRIVER.id);
  assert.equal(h[0].customer_phone, '07700900001');
  assert.equal(h[0].status, 'pending');
  assert.match(h[0].message, /TOMORROW/);
  assert.match(h[0].message, /Your driver, Moss, will be in a Tesla Model Y \(registration EV12 XEC\)/);
  assert.deepEqual(channels('both', 'reminder_24h'), ['driver_sms_handoff', 'email', 'push']);
});

test('day before: phone only gets the driver SMS handoff and no email', async () => {
  reset([booking('phone', { customer_email: null })]);
  await run();
  assert.equal(emails.length, 0);
  assert.equal(handoffs('phone').length, 1);
  assert.deepEqual(channels('phone', 'reminder_24h'), ['driver_sms_handoff', 'push']);
});

test('day before: email but no driver assigned yet still gets the email', async () => {
  reset([booking('nodriver', { assigned_driver_id: null })]);
  await run();
  assert.equal(emails.length, 1);
  assert.equal(handoffs('nodriver').length, 0);
  assert.deepEqual(channels('nodriver', 'reminder_24h'), ['email', 'push']);
});

test('week ahead: email AND driver SMS handoff, with the real number of days', async () => {
  reset([booking('week', { travel_date: londonDate(6), travel_time: '10:00' })]);
  const out = await run();
  assert.equal(out.week7, 1);
  assert.equal(emails.length, 1);
  assert.equal(emails[0].subject, 'Reminder: Your Transfer in 6 Days');
  const h = handoffs('week');
  assert.equal(h.length, 1);
  assert.equal(h[0].reminder_type, '7day');
  assert.match(h[0].message, /your EV Exec transfer is in 6 days/);
  assert.deepEqual(channels('week', 'reminder_7d'), ['driver_sms_handoff', 'email', 'push']);
});

test('running the cron again the same day sends nothing twice', async () => {
  reset([booking('both'), booking('week', { travel_date: londonDate(6), travel_time: '10:00' })]);
  await run();
  const out = await run();
  assert.deepEqual([out.week7, out.day1], [0, 0]);
  assert.equal(emails.length, 2);
  assert.equal(db.driver_sms_reminders.length, 2);
});

test('an email outage does not stop the driver SMS handoff (email is queued for retry)', async () => {
  reset([booking('both')]);
  failEmail = true;
  await run();
  assert.equal(handoffs('both').length, 1);
  assert.equal(db.notification_queue.length, 1);
  assert.equal(db.notification_queue[0].channel, 'email');
});

test('no reminders for bookings that are not dispatched, already past, or out of range', async () => {
  reset([
    booking('unaccepted', { status: 'Unassigned' }),
    booking('past', { travel_date: londonDate(0), travel_time: '00:00' }),
    booking('far', { travel_date: londonDate(10) })
  ]);
  const out = await run();
  assert.deepEqual([out.week7, out.day1], [0, 0]);
  assert.equal(emails.length, 0);
  assert.equal(db.driver_sms_reminders.length, 0);
});
