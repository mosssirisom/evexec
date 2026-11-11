'use strict';
// Whose emails these are (lib/brand.js): the business name, phone, licence,
// website and colours come from the booking's own business. EV Exec's emails
// must read exactly as before; another business must never show EV Exec's.

process.env.SITE_URL = 'https://www.evexec.co.uk';
process.env.SUPABASE_URL = 'https://db.test';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'service-key';

const test = require('node:test');
const assert = require('node:assert/strict');

const brand = require('../../lib/brand');
const C = require('../../lib/emailContent');
const R = require('../../lib/emailQueueRender');

const EV = '00000000-0000-0000-0000-000000000001';
const COASTAL = 'dddddddd-0000-4000-8000-000000000002';
const BARE = 'eeeeeeee-0000-4000-8000-000000000003';

// EV Exec exactly as its row is in the live database (10/11/2026): the phone has no space.
const EV_ROW = { name: 'EV Exec', contact_email: 'book@evexec.co.uk', contact_phone: '07721070370', brand: { invoice: { business_name: 'EV Exec' } } };
const COASTAL_ROW = {
  name: 'Coastal Cars', contact_email: 'hello@coastal.test', contact_phone: '+44 7123 456789',
  brand: { licence: 'PHO1234', site_url: 'https://coastal.test/', tagline: 'Airport transfers from Southport', colors: { primary: '#123456', accent: '#FF8800' } },
};
const BARE_ROW = { name: 'Bare Business', contact_email: null, contact_phone: null, brand: {} };

const booking = (tenant_id) => ({
  id: '11111111-1111-4111-8111-111111111111', ref: 'EVX-BRAND1', customer_name: 'Jo Bloggs', customer_phone: '07000000001', customer_email: 'jo@example.test',
  travel_date: '2099-03-14', travel_time: '09:30:00', pickup_location: '1 Test Street, Southport', dropoff_address: 'Liverpool Airport', airport: 'Liverpool Airport',
  status: 'Dispatched', payment_status: 'Unpaid', quoted_price: 90, passengers: 2, luggage: '2 bags', flight_number: 'EZY123', journey_type: 'To Airport',
  notes: '', return_journey: false, driver_notes: '', tenant_id,
});
const ctx = { driver: { full_name: 'Sam Driver', phone: '07000000002', vehicle_model: 'Tesla Model Y', vehicle_registration: 'AB12CDE' }, message: 'Hello from your driver' };

test.beforeEach(() => {
  brand._setBrands({ [EV]: EV_ROW, [COASTAL]: COASTAL_ROW, [BARE]: BARE_ROW });
});

// ── details ─────────────────────────────────────────────────────────────────
test('phone numbers are shown the house way, and tel: links are international', () => {
  assert.equal(brand.displayPhone('07721070370'), '07721 070370');
  assert.equal(brand.displayPhone('07721 070370'), '07721 070370');
  assert.equal(brand.displayPhone('+44 7721 070370'), '07721 070370');
  assert.equal(brand.displayPhone('+447721070370'), '07721 070370');
  assert.equal(brand.displayPhone('01253 123456'), '01253 123456'); // landline: as typed
  assert.equal(brand.displayPhone(null), '');
  assert.equal(brand.telNumber('07721 070370'), '+447721070370');
  assert.equal(brand.telNumber('+44 7123 456789'), '+447123456789');
  assert.equal(brand.telNumber('01253 123456'), '+441253123456');
  assert.equal(brand.telNumber(''), '');
  assert.equal(brand.telNumber('abc'), '');
});

test('EV Exec\'s live database row gives exactly the built-in EV Exec details', () => {
  const b = brand.fromRow({ id: EV, ...EV_ROW });
  for (const k of ['name', 'wordmark', 'phone', 'email', 'licence', 'site', 'tagline', 'primary', 'accent']) {
    assert.equal(b[k], brand.EV_EXEC[k], k);
  }
});

test('another business gets only what its own row holds, never EV Exec\'s', () => {
  const b = brand.fromRow({ id: COASTAL, ...COASTAL_ROW });
  assert.deepEqual({ ...b }, {
    name: 'Coastal Cars', wordmark: 'COASTAL CARS', phone: '07123 456789', email: 'hello@coastal.test', licence: 'PHO1234',
    site: 'https://coastal.test', tagline: 'Airport transfers from Southport', primary: '#123456', accent: '#FF8800',
  });
  const bare = brand.fromRow({ id: BARE, ...BARE_ROW });
  assert.equal(bare.phone, '');
  assert.equal(bare.licence, '');
  assert.equal(bare.site, '');
  assert.equal(bare.tagline, '');
});

test('colours must be six-digit hex, otherwise they are ignored', () => {
  const b = brand.fromRow({ id: COASTAL, name: 'X', brand: { colors: { primary: 'red', accent: '#12345' } } });
  assert.equal(b.primary, null);
  assert.equal(b.accent, null);
});

test('a business that is not loaded gets blank details, not EV Exec\'s; no business means this site\'s own', () => {
  assert.equal(brand.brandFor('ffffffff-0000-4000-8000-0000000000ff').phone, '');
  assert.equal(brand.brandFor(undefined).phone, '07721 070370');
  assert.equal(brand.brandFor(EV).licence, 'PHO0079');
});

// ── EV Exec's emails ────────────────────────────────────────────────────────
test('EV Exec\'s emails still carry its wordmark, phone, licence and footer', () => {
  const m = C.requestReceived(booking(EV));
  assert.match(m.html, />EV EXEC<\/a>/);
  assert.match(m.html, /tel:\+447721070370/);
  assert.match(m.html, />07721 070370<\/a>/);
  assert.match(m.html, /Premium airport transfers from Blackpool &amp; the Fylde Coast/);
  assert.match(m.html, /Private hire operator licence PHO0079/);
  assert.match(m.text, /EV Exec · evexec\.co\.uk · 07721 070370/);
  assert.match(m.text, /Private hire operator licence PHO0079/);
});

test('a booking with no business set is built for this site\'s own business', () => {
  const b = booking(undefined); delete b.tenant_id;
  assert.match(C.requestReceived(b).html, /EV EXEC/);
});

// ── another business's emails ───────────────────────────────────────────────
const LEAKS = /EV Exec|EV EXEC|07721|PHO0079|book@evexec|070370/i;

test('no email type shows EV Exec\'s details when sent for another business', () => {
  const b = booking(COASTAL);
  const names = Object.keys(R._SAMPLES);
  assert.ok(names.length >= 29, 'all sample emails are covered');
  for (const name of names) {
    const m = R._SAMPLES[name](b, ctx);
    if (!m) continue;
    const text = `${m.subject}\n${m.html}\n${m.text}`;
    assert.doesNotMatch(text, LEAKS, `${name} leaks EV Exec details`);
  }
});

test('another business\'s email shows its own name, phone, licence, website and colours', () => {
  const m = C.requestReceived(booking(COASTAL));
  assert.match(m.html, />COASTAL CARS<\/a>/);
  assert.match(m.html, /href="https:\/\/coastal\.test"/);
  assert.match(m.html, /tel:\+447123456789/);
  assert.match(m.html, />07123 456789<\/a>/);
  assert.match(m.html, /Airport transfers from Southport/);
  assert.match(m.html, /Private hire operator licence PHO1234/);
  assert.match(m.html, /background:#123456/);       // header band
  assert.match(m.html, /color:#FF8800/);            // wordmark
  assert.match(m.text, /Coastal Cars · coastal\.test · 07123 456789/);
  assert.match(m.text, /Private hire operator licence PHO1234/);
});

test('the staff and driver help lines name the right business and number', () => {
  const driver = C.driverNewJob(booking(COASTAL));
  assert.match(driver.html, /Call the office on <a href="tel:\+447123456789"[^>]*>07123 456789<\/a>/);
  const staff = C.staffNewBooking(booking(COASTAL), { acceptUrl: 'https://x.test/a', rejectUrl: 'https://x.test/r' });
  assert.match(staff.html, /Sent automatically by the Coastal Cars booking system\./);
});

test('invoice and quote emails use the business on the record', () => {
  const inv = C.invoice({ tenant_id: COASTAL, number: 'INV-9', customer_name: 'Jo', total: 90, terms: 'Pay within 15 days.' });
  assert.match(inv.subject, /^Your Coastal Cars invoice INV-9/);
  assert.match(inv.html, /Thank you for travelling with Coastal Cars\./);
  const quote = C.quoteReceived({ tenant_id: COASTAL, customer_name: 'Jo', pickup_location: 'A', destination: 'B' });
  assert.equal(quote.subject, 'Your Coastal Cars quote request');
});

test('a business with no phone, licence or website leaves them out instead of showing blanks or EV Exec\'s', () => {
  const cancelled = C.cancelledByUs(booking(BARE));
  assert.doesNotMatch(cancelled.html, /Call 07|tel:|undefined|null/);
  assert.match(cancelled.html, /please contact us straight away/);
  const sorry = C.bookingUnavailable(booking(BARE));
  assert.doesNotMatch(sorry.html, /wa\.me/);
  const m = C.requestReceived(booking(BARE));
  assert.match(m.html, /Questions or changes\? Just reply to this email\./);
  // (The "View your booking" button correctly points at the shared booking page.)
  assert.doesNotMatch(m.html, /licence|undefined|null/i);
  assert.doesNotMatch(m.text, /licence|undefined|null/i);
  assert.doesNotMatch(m.html, LEAKS);
  assert.doesNotMatch(m.text, LEAKS);
  assert.match(m.html, />BARE BUSINESS<\/a>/);
});

test('the WhatsApp and call buttons use the business\'s own number', () => {
  assert.match(C.bookingUnavailable(booking(COASTAL)).html, /href="https:\/\/wa\.me\/447123456789"/);
  assert.match(C.cancelledByUs(booking(COASTAL)).html, /href="tel:\+447123456789"/);
  assert.match(C.bookingUnavailable(booking(EV)).html, /href="https:\/\/wa\.me\/447721070370"/);
});

test('a builder called inside another builder keeps its own business afterwards', () => {
  // Building for one business must not change the one used by the next call.
  C.requestReceived(booking(COASTAL));
  const after = C.requestReceived(booking(EV));
  assert.match(after.html, /EV EXEC/);
  assert.doesNotMatch(after.html, /COASTAL/);
});

// ── loading the businesses ──────────────────────────────────────────────────
test('businesses are loaded once a minute and an outage keeps the last good copy', async () => {
  const realFetch = global.fetch;
  let calls = 0; let ok = true;
  global.fetch = async (url) => {
    calls++;
    assert.match(String(url), /^https:\/\/db\.test\/rest\/v1\/tenants\?select=id,name,contact_email,contact_phone,brand/);
    if (!ok) throw new Error('database down');
    return { ok: true, json: async () => [{ id: COASTAL, ...COASTAL_ROW, name: 'Coastal Cars Ltd' }] };
  };
  try {
    await brand.refreshBrands({ force: true });
    assert.equal(calls, 1);
    assert.equal(brand.brandFor(COASTAL).name, 'Coastal Cars Ltd');
    await brand.refreshBrands();               // within a minute: no new request
    assert.equal(calls, 1);
    ok = false;
    await brand.refreshBrands({ force: true }); // outage: keep what we had
    assert.equal(calls, 2);
    assert.equal(brand.brandFor(COASTAL).name, 'Coastal Cars Ltd');
  } finally {
    global.fetch = realFetch;
  }
});
