'use strict';

// Checks every booking message template against the EV Exec correspondence
// standard, using the representative bookings in ./fixtures.js.
// Run: node --test tests/correspondence

const test = require('node:test');
const assert = require('node:assert/strict');
const M = require('../../lib/messages');
const C = require('../../lib/correspondence');
const X = require('./fixtures');

const driver = { id: 'd1', full_name: 'Sam Driver', email: 'sam@example.com', vehicle_model: 'Tesla Model Y', vehicle_registration: 'EV26 XEC' };

function strip(html) {
  return html.replace(/<[^>]+>/g, ' ').replace(/&amp;/g, '&').replace(/&#39;/g, "'").replace(/&middot;/g, '·').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ');
}

// Every rendering of a booking, as plain text, labelled.
function allRenderings(b) {
  const out = [];
  const add = (name, m) => {
    out.push([`${name}.subject`, m.subject]);
    out.push([`${name}.html`, strip(m.html)]);
    if (m.text) out.push([`${name}.text`, m.text]);
  };
  add('requestReceived', M.customerRequestReceived(b, { cancelUrl: 'https://evexec.co.uk/cancel' }));
  add('confirmed', M.customerConfirmed(b, { paymentUrl: 'https://pay.example/x' }));
  add('rejected', M.customerRejected(b));
  add('cancelled', M.customerCancelled(b));
  add('reminder', M.customerReminder(b, { when: 'tomorrow', driver }));
  add('paymentLink', M.customerPaymentLink(b, { paymentUrl: 'https://pay.example/x' }));
  add('enRoute', M.customerStatus(b, { status: 'en_route', driver }));
  add('arrived', M.customerStatus(b, { status: 'arrived', driver }));
  add('receipt', M.customerReceipt(b, { expenses: [] }));
  add('opNew', M.operatorNewBooking(b, { dispatchUrl: 'https://op/dispatch' }));
  add('opPaid', M.operatorPaymentConfirmed(b));
  add('opCancelled', M.operatorCancelled(b));
  add('drvNew', M.driverNewJob(b, { driver }));
  add('drvUpd', M.driverJobUpdated(b, { driver }));
  add('drvCan', M.driverJobCancelled(b, { driver }));
  add('drvRem', M.driverReminder(b, { driver, reminder: '24h' }));
  return out;
}

const ALL = Object.entries(X).filter(([, v]) => v && typeof v === 'object');

test('no non-standard date formats anywhere', () => {
  for (const [name, b] of ALL) {
    for (const [where, s] of allRenderings(b)) {
      assert.doesNotMatch(s, /\b\d{2}\/\d{2}\/\d{4}\b/, `${name} ${where}: DD/MM/YYYY`);
      assert.doesNotMatch(s, /\b\d{4}-\d{2}-\d{2}\b/, `${name} ${where}: ISO date`);
      assert.doesNotMatch(s, /\b\d{1,2} (Jan|Feb|Mar|Apr|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\b(?!\w)/, `${name} ${where}: short month`);
      assert.doesNotMatch(s, /\d{2}:\d{2}:\d{2}/, `${name} ${where}: seconds in time`);
    }
  }
});

test('date/time is "14:00 — 3 October 2026" style, from the stored UK time', () => {
  const t = M.customerConfirmed(X.oneWay).text;
  assert.match(t, /When: 14:00 — 3 October 2026/);
  assert.match(strip(M.customerConfirmed(X.oneWay).html), /14:00 — 3 October 2026/);
  assert.match(M.driverNewJob(X.airportPickup, { driver }).subject, /06:05 — 3 October 2026/);
  // Real timestamps render in Europe/London (BST): 13:58Z -> 14:58.
  assert.equal(C.ukWhenFromTimestamp('2026-10-03T13:58:00Z'), '14:58 — 3 October 2026');
  assert.equal(C.ukWhenFromTimestamp('2026-12-03T13:58:00Z'), '13:58 — 3 December 2026');
});

test('stops appear in order between pickup and drop-off, in every message', () => {
  const b = X.withStops;
  for (const [where, s] of allRenderings(b)) {
    if (where.endsWith('.subject')) continue;
    const iP = s.indexOf(X.HOME), i1 = s.indexOf('5 Church Street'), i2 = s.indexOf('9 Station Road'), iD = s.indexOf(X.MAN_T2);
    if (i1 === -1 && /^(enRoute|arrived)\.text$|^opCancelled\.text$|^cancelled\.text$|^receipt\.text$|^opPaid\.text$/.test(where)) continue; // one-line notices
    assert.ok(iP >= 0 && i1 > iP && i2 > i1 && iD > i2, `${where}: order pickup < stop1 < stop2 < drop-off`);
  }
  assert.equal(C.routeLine(b), `${X.HOME} → 5 Church Street, Kirkham, PR4 2SE → 9 Station Road, Preston, PR1 1AA → ${X.MAN_T2}`);
});

test('stored address wins over the airport name, and is never shortened', () => {
  const b = X.airportPickup;
  const t = M.customerConfirmed(b).text;
  assert.match(t, /Pickup: Liverpool John Lennon Airport Arrivals, Speke Hall Avenue, Liverpool, L24 1YD/);
  assert.match(t, /Drop-off: 3 Beach Road, Fleetwood, FY7 8AB/);
  assert.doesNotMatch(t, /Pickup: Liverpool Airport\n/);
  assert.match(M.operatorNewBooking(X.oneWay).text, /Pickup: 12 Example Road, Lytham St Annes, FY8 1AB, UK/);
  // Airport only fills a side that has no address.
  assert.match(C.journeyText({ ...X.oneWay, dropoff_address: null }), /Drop-off: Manchester Airport/);
});

test('outbound and return are separate legs, each with its own date/time', () => {
  const t = M.customerConfirmed(X.returnTrip).text;
  assert.match(t, /OUTBOUND\nPickup: 12 Example Road[^\n]*\nDrop-off: Manchester Airport Terminal 2[^\n]*\nWhen: 14:00 — 3 October 2026\n\nRETURN\nPickup: Manchester Airport Terminal 2[^\n]*\nDrop-off: 12 Example Road[^\n]*\nWhen: 18:35 — 10 October 2026/);
  const h = strip(M.customerConfirmed(X.returnTrip).html);
  assert.ok(h.indexOf('Outbound') < h.indexOf('Return') && h.indexOf('Return') < h.indexOf('18:35 — 10 October 2026'));
  // Reminders and driver messages show only the leg being travelled.
  assert.doesNotMatch(M.customerReminder(X.returnTrip, { when: 'tomorrow' }).text, /^RETURN$/m);
  assert.doesNotMatch(M.driverNewJob(X.returnTrip, { driver }).text, /^RETURN$/m);
});

test('payment status is explicit and never assumed to be card', () => {
  const cases = [
    [X.unpaid, 'Payment required'],
    [X.cash, 'Cash on the day'],
    [X.cashWebsite, 'Cash on the day'],
    [X.card, 'Paid by card'],
    [X.bank, 'Bank transfer (payment pending)'],
    [X.bankPaid, 'Paid by bank transfer'],
    [X.linkPending, 'Payment link available (payment pending)'],
    [X.returnLegRow, 'Included with booking EVX-RETURN'],
    [{ ...X.oneWay, payment_method: 'Cash', payment_status: 'Paid' }, 'Paid in cash']
  ];
  for (const [b, want] of cases) {
    assert.equal(C.paymentLine(b), want, b.ref);
    assert.match(M.customerConfirmed(b).text, new RegExp(`Payment: ${want.replace(/[()]/g, '\\$&')}`), b.ref);
  }
  for (const [name, b] of ALL) {
    if (C.paymentLine(b) === 'Paid by card') continue;
    for (const [where, s] of allRenderings(b)) assert.doesNotMatch(s, /Paid by card/, `${name} ${where}`);
  }
  assert.equal(C.driverPaymentLine(X.cash, '90'), 'Cash on the day (collect £90)');
  assert.equal(C.driverPaymentLine(X.card, '90'), 'Paid by card (nothing to collect)');
  assert.equal(C.driverPaymentLine(X.bank, '90'), 'Bank transfer (payment pending) (do not collect)');
});

test('titles follow the real payment state', () => {
  assert.match(M.customerConfirmed(X.card).subject, /^Payment received/);
  assert.match(M.customerConfirmed(X.cash).subject, /is confirmed/);
  assert.match(M.operatorPaymentConfirmed(X.cash).subject, /^Booking confirmed/);
});

test('return-leg rows show no price and point at the outbound booking', () => {
  const t = M.customerReminder(X.returnLegRow, { when: 'tomorrow' }).text;
  assert.match(t, /Payment: Included with booking EVX-RETURN/);
  assert.doesNotMatch(strip(M.customerReminder(X.returnLegRow, { when: 'tomorrow' }).html), /£0/);
});

test('every queued template renders', () => {
  for (const name of Object.keys(M.RENDERERS)) {
    const m = M.renderQueued(name, X.withStops, { driver, expenses: [{ type: 'parking', amount: 6.5 }], payment_url: 'https://pay.example/x', reminder: '1h' });
    assert.ok(m.subject && m.html.includes('EV Exec'), name);
    assert.doesNotMatch(m.subject, /[\r\n]/, name);
  }
});
