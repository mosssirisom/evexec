'use strict';

// Email template tests: every builder renders, follows the house date/time
// style, has a plain-text version, and queued rows are re-rendered (or left
// alone) correctly. Run: npm run test:unit

const test = require('node:test');
const assert = require('node:assert/strict');

process.env.SUPABASE_URL = 'https://db.test';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'service-role-unit';

const C = require('../../lib/emailContent.js');
const { renderQueued } = require('../../lib/emailQueueRender.js');
const { relativeDay, when } = require('../../lib/emailTemplate.js');

const NOW = new Date('2026-10-14T08:00:00Z');
const B = {
  id: 'b-1', ref: 'EVX-TEST0001', status: 'Dispatched', source: 'website', customer_name: 'Tom Smith', customer_phone: '07700 900123',
  customer_email: 'tom@example.com', journey_type: 'To Airport', pickup_location: '12 Clifton Drive, Lytham St Annes, FY8 5RE',
  dropoff_address: 'Manchester Airport, Terminal 2', airport: 'Manchester Airport', travel_date: '2026-10-15', travel_time: '07:00:00',
  passengers: 2, luggage: '2 cases', quoted_price: 90, payment_method: 'Cash', payment_status: 'Unpaid', assigned_driver_id: 'd-1',
};
const D = { id: 'd-1', full_name: 'Moss Sirisom', phone: '07700 900999', vehicle_model: 'Tesla Model Y', vehicle_registration: 'ev12 xec' };

const ALL = () => [
  C.requestReceived(B, { cancelUrl: 'https://x/cancel' }), C.bookingConfirmed(B), C.bookingUnavailable(B), C.paymentReceived({ ...B, payment_status: 'Paid' }),
  C.cashChosen(B), C.cancelledByCustomer(B), C.cancelledByUs(B), C.reminder(B, { type: '7day', driver: D }), C.reminder(B, { type: '24hr', driver: D }),
  C.driverOnTheWay(B, { driver: D }), C.driverArrived(B, { driver: D }), C.paymentLink(B, { url: 'https://pay' }), C.journeyReceipt(B, { amount: 90, driver: D }),
  C.invoice({ number: 'INV-1', customer_name: 'Tom', total: 90, due: '2026-10-28' }), C.quoteReceived({ customer_name: 'Sarah', pickup_location: 'Poulton', destination: 'Heathrow', pickup_date: '2026-11-02', pickup_time: '03:30' }),
  C.staffNewBooking(B, { acceptUrl: 'a', rejectUrl: 'r' }), C.staffPayment(B, { paid: false }), C.staffCustomerCancelled(B), C.staffNewQuote({ customer_name: 'Sarah', phone: '07700', pickup_location: 'Poulton', destination: 'Heathrow' }),
  C.staffDuplicatePayment(B, { amount: 90 }), C.driverNewJob(B), C.driverReminder(B, { type: '24h' }), C.driverReminder(B, { type: '1h' }), C.driverJobCancelled(B),
  C.driverJobUpdated(B, { changes: [['Time', '07:00', '06:30']] }), C.driverCustomerReminderDue(B, { message: 'Hi Tom' }), C.driverConfirmPickup(B), C.staffDriverNotConfirmed(B, { driver: D }),
];

test('every email renders with a subject, HTML and a plain-text version', () => {
  for (const e of ALL()) {
    assert.ok(e.subject && !/[\r\n]/.test(e.subject), `subject: ${e.subject}`);
    assert.match(e.html, /^<!doctype html>/);
    assert.ok(e.text && e.text.length > 40, `text for ${e.subject}`);
    assert.ok(!/<[a-z]/i.test(e.text), `plain text has no tags: ${e.subject}`);
  }
});

test('house style: no written-out months, no YYYY-MM-DD, no 12-hour times, no images', () => {
  const months = /\b(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Sept|Oct|Nov|Dec)(uary|ruary|ch|il|e|y|ust|tember|ober|ember)?\b/;
  for (const e of ALL()) {
    for (const s of [e.subject, e.text]) {
      assert.ok(!months.test(s), `month word in: ${s.slice(0, 120)}`);
      assert.ok(!/\b20\d\d-\d\d-\d\d\b/.test(s), `ISO date in: ${s.slice(0, 120)}`);
      assert.ok(!/\b\d{1,2}(:\d\d)?\s?(am|pm)\b/i.test(s), `12-hour time in: ${s.slice(0, 120)}`);
    }
    assert.ok(!/<img\b/i.test(e.html), 'no images');
  }
});

test('dates: weekday + DD/MM/YYYY + HH:MM, relative days from UK date', () => {
  assert.equal(when('2026-10-15', '07:00:00'), 'Thursday 15/10/2026 at 07:00');
  assert.equal(relativeDay('2026-10-15', NOW), 'Tomorrow');
  assert.equal(relativeDay('2026-10-14', NOW), 'Today');
  assert.equal(relativeDay('2026-10-20', NOW), 'In 6 days');
  assert.equal(relativeDay('2026-10-13', NOW), null);
});

test('driver reminder email says who, what day and time, and shows the text', () => {
  const e = C.driverCustomerReminderDue(B, { message: 'Hi Tom, see you tomorrow.' });
  assert.match(e.subject, /^Text Tom Smith their reminder: .*Thursday 15\/10\/2026 at 07:00 \(Ref EVX-TEST0001\)$/);
  assert.match(e.text, /Hi Tom, see you tomorrow\./);
  assert.match(e.html, /\?reminder=24hr/);
});

test('driver fare line says exactly what to collect', () => {
  assert.equal(C.fareText(B), 'Collect £90.00 in cash.');
  assert.equal(C.fareText({ ...B, payment_status: 'Paid' }), 'Paid in advance. Nothing to collect.');
  assert.equal(C.fareText({ ...B, payment_method: 'Bank Transfer' }), 'Paid to the office. Do not collect.');
});

// ── Queued rows ──
const db = { bookings: [B, { ...B, id: 'b-op', source: 'operator' }], drivers: [D], driver_sms_reminders: [{ booking_id: 'b-1', reminder_type: '24hr', message: 'Hi Tom, reminder text.' }] };
global.fetch = async (url) => {
  const u = new URL(url); const table = u.pathname.replace('/rest/v1/', '');
  const id = (u.searchParams.get('id') || u.searchParams.get('booking_id') || '').replace(/^eq\./, '');
  const rows = (db[table] || []).filter(r => (r.id || r.booking_id) === id);
  return { ok: true, status: 200, json: async () => rows };
};

test('queued database and driver-app emails are re-rendered in the new design', async () => {
  const cases = [
    [{ type: 'driver_allocated' }, /^New job: Thursday 15\/10\/2026 at 07:00, Lytham St Annes → Manchester Airport/],
    [{ type: 'driver_reminder_24h' }, /^Job tomorrow: /],
    [{ type: 'status_update', body: 'EV Exec: your driver is on the way. Ref EVX-TEST0001.' }, /^Your driver is on the way/],
    [{ type: 'status_update', body: 'EV Exec: your driver has arrived at the pickup point.' }, /^Your driver has arrived/],
    [{ type: 'status_update', body: 'EV Exec: your booking EVX-TEST0001 has been cancelled.' }, /^Cancelled: your transfer on Thursday 15\/10\/2026/],
    [{ type: 'customer_sms_reminder' }, /^Text Tom Smith their reminder/],
  ];
  for (const [row, re] of cases) {
    const out = await renderQueued({ channel: 'email', booking_id: 'b-1', meta: {}, ...row });
    assert.ok(out, `rendered ${row.type}`); assert.match(out.subject, re);
  }
  const msg = await renderQueued({ channel: 'email', booking_id: 'b-1', type: 'customer_sms_reminder', meta: {} });
  assert.match(msg.text, /Hi Tom, reminder text\./);
});

test('queued rows that must keep their stored email are left alone', async () => {
  assert.equal(await renderQueued({ channel: 'email', booking_id: 'b-1', type: 'received', meta: { label: 'customer_email' } }), null, 'site retry');
  assert.equal(await renderQueued({ channel: 'email', booking_id: 'b-1', type: 'received', meta: {} }), null, 'received for a website booking');
  assert.ok(await renderQueued({ channel: 'email', booking_id: 'b-op', type: 'received', meta: {} }), 'received for a phone booking');
  assert.equal(await renderQueued({ channel: 'email', booking_id: 'b-1', type: 'sample_preview', meta: {} }), null, 'unknown type');
  assert.equal(await renderQueued({ channel: 'email', booking_id: 'missing', type: 'driver_allocated', meta: {} }), null, 'booking gone');
  assert.equal(await renderQueued({ channel: 'sms', booking_id: 'b-1', type: 'driver_allocated' }), null, 'not email');
});

test('test sends: email_sample renders the named email from a real booking', async () => {
  const { SAMPLE_BUILDERS } = require('../../lib/emailQueueRender.js');
  assert.equal(SAMPLE_BUILDERS.length, 29);
  for (const builder of SAMPLE_BUILDERS) {
    const out = await renderQueued({ channel: 'email', booking_id: 'b-1', type: 'email_sample', meta: { builder, n: '1/29' } });
    assert.ok(out, builder); assert.match(out.subject, /^\[EV Exec sample 1\/29\] /);
  }
  assert.equal(await renderQueued({ channel: 'email', booking_id: 'b-1', type: 'email_sample', meta: { builder: 'nope' } }), null);
});

test('operator-made return booking: one confirmation with both journeys, one £160 price and a pay button', () => {
  const out = { ...B, source: 'operator', operator_response: 'accepted', payment_method: null, quoted_price: 160, return_journey: true, return_date: '2026-10-22', return_time: '18:30', return_pickup: 'Manchester Airport, Terminal 2', return_destination: '12 Clifton Drive, Lytham St Annes, FY8 5RE' };
  const e = C.bookingConfirmed(out, { now: NOW });
  assert.match(e.text, /£160\.00/);
  assert.doesNotMatch(e.text, /£80\.00/);
  assert.match(e.text, /Return journey/);
  assert.match(e.html, /Pay now or choose cash/);
  // The £0 return leg's own confirmation has no price and nothing to pay.
  const leg = C.bookingConfirmed({ ...B, source: 'operator', payment_method: null, quoted_price: 0, travel_date: '2026-10-22', notes: 'Return leg created automatically from return booking. Original return fare: £160. Outbound ref: EVX-TEST0001' }, { now: NOW });
  assert.doesNotMatch(leg.html, /Pay now/);
  assert.doesNotMatch(leg.text, /£\d/);
});

test('My Account: operator-made and accepted bookings are confirmed, unaccepted website requests await approval', () => {
  const { customerStatus } = require('../../api/account/index.js');
  assert.equal(customerStatus({ status: 'Unassigned', source: 'operator', operator_response: 'accepted' }), 'Trip Confirmed');
  assert.equal(customerStatus({ status: 'Unassigned', source: 'operator', operator_response: null }), 'Trip Confirmed');
  assert.equal(customerStatus({ status: 'Unassigned', source: 'website', operator_response: 'accepted' }), 'Trip Confirmed');
  assert.equal(customerStatus({ status: 'Unassigned', source: 'website', operator_response: null }), 'Awaiting Approval');
  assert.equal(customerStatus({ status: 'Cancelled', source: 'website', operator_response: 'rejected' }), 'Cancelled');
});
