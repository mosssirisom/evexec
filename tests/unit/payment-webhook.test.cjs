'use strict';

// Payment pipeline tests: the real /api/payment handler behind a real HTTP
// server, with Stripe, Supabase (PostgREST), Resend and the push service
// replaced by an in-memory fake. Run: npm run test:unit

const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const crypto = require('node:crypto');
const path = require('node:path');

const SECRET = 'whsec_unit_test_secret';
process.env.STRIPE_WEBHOOK_SECRET = SECRET;
process.env.STRIPE_SECRET_KEY = 'sk_test_unit';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'service-role-unit';
process.env.SUPABASE_URL = 'https://db.test';
process.env.RESEND_API_KEY = 're_unit';
process.env.OPERATOR_EMAIL = 'ops@evexec.test';
process.env.OPERATOR_APP_URL = 'https://operator.test';
process.env.SITE_URL = 'https://www.evexec.test';

// ── fake backend ───────────────────────────────────────────────────────────
const BOOKING_ID = 'ef25cc06-2339-4655-bd2c-3c5db47afada';
let db; let stripe; let calls; let failEmail; let failBookingPatch; let patchDelayMs; let patchBarrier;

function reset() {
  db = {
    bookings: [{
      id: BOOKING_ID, ref: 'EVX-UNIT0001', status: 'Dispatched', operator_response: 'accepted',
      payment_status: 'Unpaid', payment_method: null, stripe_session_id: 'cs_test_paid1',
      customer_name: 'Thomas Smith', customer_email: 'tom@example.test', customer_phone: '07700900000',
      airport: 'Manchester Airport', return_journey: false, travel_date: '2026-10-10', travel_time: '04:00',
      pickup_location: 'Kirkham'
    }],
    stripe_webhook_events: [],
    stripe_webhook_rejections: [],
    notification_log: [],
    notification_queue: []
  };
  stripe = {
    sessions: {
      cs_test_paid1: session('cs_test_paid1', 'paid', 'complete'),
      cs_test_paid2: session('cs_test_paid2', 'paid', 'complete'),
      cs_test_open: session('cs_test_open', 'unpaid', 'open')
    },
    expired: [], created: 0
  };
  calls = { emails: [], operatorPush: [], bookingPaidTransitions: 0 };
  failEmail = false; failBookingPatch = false; patchDelayMs = 0; patchBarrier = null;
}

function session(id, paymentStatus, status, extra = {}) {
  return {
    id, object: 'checkout.session', payment_status: paymentStatus, status, currency: 'gbp', amount_total: 9000,
    payment_intent: `pi_${id}`, url: `https://checkout.stripe.test/${id}`, metadata: { bookingId: BOOKING_ID }, ...extra
  };
}

const json = (body, status = 200) => ({ ok: status < 400, status, json: async () => body, text: async () => JSON.stringify(body) });
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

function matchesFilters(row, params) {
  for (const [k, v] of params) {
    if (k === 'select' || k === 'limit') continue;
    if (k === 'or') {
      // Only the form the payment code uses: or=(payment_status.is.null,payment_status.neq.Paid)
      if (v !== '(payment_status.is.null,payment_status.neq.Paid)') throw new Error(`unexpected or filter ${v}`);
      if (!(row.payment_status == null || row.payment_status !== 'Paid')) return false;
      continue;
    }
    const m = /^eq\.(.*)$/.exec(v);
    if (!m) throw new Error(`unexpected filter ${k}=${v}`);
    if (String(row[k]) !== m[1]) return false;
  }
  return true;
}

global.fetch = async (url, opts = {}) => {
  const u = new URL(url);
  const method = (opts.method || 'GET').toUpperCase();
  const body = opts.body ? (typeof opts.body === 'string' && opts.body.startsWith('{') ? JSON.parse(opts.body) : opts.body) : null;

  if (u.host === 'api.stripe.com') {
    let m = /^\/v1\/checkout\/sessions\/([^/]+)$/.exec(u.pathname);
    if (m && method === 'GET') return stripe.sessions[m[1]] ? json(stripe.sessions[m[1]]) : json({ error: {} }, 404);
    m = /^\/v1\/checkout\/sessions\/([^/]+)\/expire$/.exec(u.pathname);
    if (m) { stripe.expired.push(m[1]); stripe.sessions[m[1]].status = 'expired'; return json(stripe.sessions[m[1]]); }
    if (u.pathname === '/v1/checkout/sessions' && method === 'POST') {
      const id = `cs_test_new${++stripe.created}`;
      const form = new URLSearchParams(opts.body);
      stripe.sessions[id] = session(id, 'unpaid', 'open', { success_url: form.get('success_url'), amount_total: Number(form.get('line_items[0][price_data][unit_amount]')) });
      return json(stripe.sessions[id]);
    }
    if (u.pathname.startsWith('/v1/payment_intents/')) return json({ latest_charge: { receipt_url: 'https://pay.stripe.test/receipt' } });
  }

  if (u.host === 'api.resend.com') {
    if (failEmail) return json({ message: 'resend down' }, 500);
    calls.emails.push({ to: body.to, subject: body.subject });
    return json({ id: `email_${calls.emails.length}` });
  }

  if (u.host === 'operator.test' && u.pathname === '/api/push/dispatch') {
    calls.operatorPush.push(body.notification);
    return json({ ok: true });
  }

  if (u.host === 'db.test') {
    const table = u.pathname.replace('/rest/v1/', '');
    if (table === 'rpc/stripe_webhook_event_seen') {
      let row = db.stripe_webhook_events.find(e => e.event_id === body.p_event_id);
      if (row) { row.attempts += 1; }
      else { row = { event_id: body.p_event_id, event_type: body.p_event_type, livemode: body.p_livemode, session_id: body.p_session_id, status: 'received', attempts: 1 }; db.stripe_webhook_events.push(row); }
      return json({ ...row });
    }
    if (table === 'push_config') return json([{ webhook_secret: 'push-secret' }]);
    if (table === 'push_subscriptions') return json([]);
    if (!db[table]) return json([]);
    const params = [...u.searchParams.entries()];
    if (method === 'GET') return json(db[table].filter(r => matchesFilters(r, params)).map(r => ({ ...r })));
    if (method === 'POST') { (Array.isArray(body) ? body : [body]).forEach(r => db[table].push({ ...r })); return json([body], 201); }
    if (method === 'PATCH') {
      if (table === 'bookings' && failBookingPatch) return json({ message: 'db unavailable' }, 503);
      // Read and write in one step, like a single UPDATE statement under a row lock.
      const rows = db[table].filter(r => matchesFilters(r, params));
      if (patchDelayMs) await sleep(patchDelayMs);
      // Barrier: hold booking updates until `count` callers have all sent theirs,
      // so every caller has read the booking before anyone writes.
      if (table === 'bookings' && patchBarrier) {
        patchBarrier.arrived += 1;
        while (patchBarrier.arrived < patchBarrier.count) await sleep(1);
      }
      const recheck = rows.filter(r => matchesFilters(r, params));
      recheck.forEach(r => {
        if (table === 'bookings' && body.payment_status === 'Paid' && r.payment_status !== 'Paid') calls.bookingPaidTransitions += 1;
        Object.assign(r, body);
      });
      return json(recheck.map(r => ({ ...r })));
    }
  }
  throw new Error(`Unmocked fetch ${method} ${url}`);
};

// ── server and helpers ─────────────────────────────────────────────────────
const handler = require(path.join(__dirname, '../../api/payment/index.js'));
let server; let port;
test.before(async () => {
  server = http.createServer((req, res) => handler(req, res));
  await new Promise(r => server.listen(0, r));
  port = server.address().port;
});
test.after(() => server.close());
test.beforeEach(() => reset());

function request(pathname, { body = '', headers = {} } = {}) {
  return new Promise((resolve, reject) => {
    const req = http.request({ port, method: 'POST', path: pathname, headers: { 'content-type': 'application/json; charset=utf-8', ...headers } }, res => {
      let data = ''; res.on('data', c => { data += c; }); res.on('end', () => resolve({ status: res.statusCode, body: data }));
    });
    req.on('error', reject);
    req.end(body);
  });
}

function stripeEvent(sessionObj, { id = 'evt_1UnitTest0001', type = 'checkout.session.completed', created = Math.floor(Date.now() / 1000) - 7200 } = {}) {
  // Pretty-printed, like Stripe's own payloads, so the exact bytes matter.
  return JSON.stringify({ id, object: 'event', type, livemode: false, created, data: { object: sessionObj } }, null, 2);
}

function sign(payload, secret = SECRET, t = Math.floor(Date.now() / 1000)) {
  return `t=${t},v1=${crypto.createHmac('sha256', secret).update(`${t}.${payload}`).digest('hex')}`;
}

const sendWebhook = (payload, sig = sign(payload)) => request('/api/payment/stripe-webhook', { body: payload, headers: { 'stripe-signature': sig, 'user-agent': 'Stripe/1.0 (+https://stripe.com/docs/webhooks)' } });
const verify = (extra = {}) => request('/api/payment/verify', { body: JSON.stringify({ bookingId: BOOKING_ID, ...extra }) });
const booking = () => db.bookings[0];
const customerEmails = () => calls.emails.filter(e => e.to.includes('tom@example.test'));
const operatorEmails = () => calls.emails.filter(e => e.to.includes('ops@evexec.test'));

function assertNotifiedOnce() {
  assert.equal(calls.bookingPaidTransitions, 1, 'one Paid transition');
  assert.equal(customerEmails().length, 1, 'one customer email');
  assert.match(customerEmails()[0].subject, /^Payment received \(£90\.00\): Saturday 10\/10\/2026 at 04:00/);
  assert.equal(operatorEmails().length, 1, 'one operator email');
  assert.match(operatorEmails()[0].subject, /^Paid £90\.00: EVX-UNIT0001/);
  assert.equal(calls.operatorPush.length, 1, 'one operator alert');
}

// ── tests ──────────────────────────────────────────────────────────────────
test('successful payment: verifies, sets Paid + Card, links the session, notifies, returns 200', async () => {
  const res = await sendWebhook(stripeEvent(stripe.sessions.cs_test_paid1));
  assert.equal(res.status, 200);
  assert.equal(booking().payment_status, 'Paid');
  assert.equal(booking().payment_method, 'Card');
  assert.equal(booking().stripe_session_id, 'cs_test_paid1');
  assertNotifiedOnce();
  const ev = db.stripe_webhook_events[0];
  assert.equal(ev.status, 'recorded');
  assert.equal(ev.booking_id, BOOKING_ID);
  assert.ok(ev.notified_at);
});

test('same event delivered five times (duplicates and Stripe retries): one transition, one of each notice', async () => {
  const payload = stripeEvent(stripe.sessions.cs_test_paid1);
  for (let i = 0; i < 5; i++) assert.equal((await sendWebhook(payload)).status, 200);
  assertNotifiedOnce();
  assert.equal(db.stripe_webhook_events.length, 1);
  assert.equal(db.stripe_webhook_events[0].attempts, 5);
  assert.equal(db.stripe_webhook_events[0].status, 'recorded');
});

test('same event delivered concurrently: still exactly one transition and one of each notice', async () => {
  patchBarrier = { count: 4, arrived: 0 };
  const payload = stripeEvent(stripe.sessions.cs_test_paid1);
  const results = await Promise.all([1, 2, 3, 4].map(() => sendWebhook(payload)));
  results.forEach(r => assert.equal(r.status, 200));
  assertNotifiedOnce();
});

test('Stripe retry after a failed first attempt (database down) records the payment once', async () => {
  failBookingPatch = true;
  const payload = stripeEvent(stripe.sessions.cs_test_paid1);
  const first = await sendWebhook(payload);
  assert.equal(first.status, 500, 'Stripe is asked to retry');
  assert.equal(booking().payment_status, 'Unpaid');
  assert.equal(calls.emails.length, 0);
  assert.equal(db.stripe_webhook_events[0].status, 'failed');
  failBookingPatch = false;
  const retry = await sendWebhook(payload);
  assert.equal(retry.status, 200);
  assertNotifiedOnce();
});

test('invalid signature: 400, nothing changed, rejection recorded without secrets', async () => {
  const payload = stripeEvent(stripe.sessions.cs_test_paid1);
  const res = await sendWebhook(payload, sign(payload, 'whsec_wrong'));
  assert.equal(res.status, 400);
  assert.match(res.body, /Signature mismatch/);
  assert.equal(booking().payment_status, 'Unpaid');
  assert.equal(calls.emails.length + calls.operatorPush.length, 0);
  assert.equal(db.stripe_webhook_events.length, 0);
  const rej = db.stripe_webhook_rejections[0];
  assert.equal(rej.claimed_event_id, 'evt_1UnitTest0001');
  assert.equal(rej.diagnostics.secret_has_surrounding_whitespace, false);
  assert.ok(!JSON.stringify(rej).includes(SECRET));
});

test('tampered body with a valid-looking signature is rejected', async () => {
  const payload = stripeEvent(stripe.sessions.cs_test_paid1);
  const res = await sendWebhook(payload.replace('9000', '1'), sign(payload));
  assert.equal(res.status, 400);
  assert.equal(booking().payment_status, 'Unpaid');
});

test('old timestamp (replay) is rejected', async () => {
  const payload = stripeEvent(stripe.sessions.cs_test_paid1);
  const res = await sendWebhook(payload, sign(payload, SECRET, Math.floor(Date.now() / 1000) - 3600));
  assert.equal(res.status, 400);
  assert.match(res.body, /tolerance/);
});

test('missing signature header is rejected', async () => {
  const res = await request('/api/payment/stripe-webhook', { body: stripeEvent(stripe.sessions.cs_test_paid1) });
  assert.equal(res.status, 400);
  assert.equal(booking().payment_status, 'Unpaid');
});

test('secret rotation: header with two v1 signatures, either configured secret works', async () => {
  const payload = stripeEvent(stripe.sessions.cs_test_paid1);
  const t = Math.floor(Date.now() / 1000);
  const v1 = (s) => crypto.createHmac('sha256', s).update(`${t}.${payload}`).digest('hex');
  const res = await sendWebhook(payload, `t=${t},v1=${v1('whsec_new_rolled')},v1=${v1(SECRET)}`);
  assert.equal(res.status, 200);
  assert.equal(booking().payment_status, 'Paid');
});

test('secret configured with stray whitespace still verifies', async () => {
  const saved = process.env.STRIPE_WEBHOOK_SECRET;
  process.env.STRIPE_WEBHOOK_SECRET = ` ${SECRET}\n`;
  try {
    const payload = stripeEvent(stripe.sessions.cs_test_paid1);
    assert.equal((await sendWebhook(payload)).status, 200);
    assert.equal(booking().payment_status, 'Paid');
  } finally { process.env.STRIPE_WEBHOOK_SECRET = saved; }
});

test('unknown booking: retried by Stripe for the first hour, then acknowledged and logged', async () => {
  const s = session('cs_test_ghost', 'paid', 'complete', { metadata: { bookingId: '00000000-0000-4000-8000-000000000000' } });
  const fresh = await sendWebhook(stripeEvent(s, { id: 'evt_ghost_new', created: Math.floor(Date.now() / 1000) - 60 }));
  assert.equal(fresh.status, 503);
  assert.equal(db.stripe_webhook_events.find(e => e.event_id === 'evt_ghost_new').status, 'retrying');
  const old = await sendWebhook(stripeEvent(s, { id: 'evt_ghost_old' }));
  assert.equal(old.status, 200);
  assert.equal(db.stripe_webhook_events.find(e => e.event_id === 'evt_ghost_old').status, 'unknown_booking');
  assert.equal(calls.emails.length + calls.operatorPush.length, 0);
});

test('already-paid booking, same session (late webhook after the payment check): 200, nothing sent', async () => {
  Object.assign(booking(), { payment_status: 'Paid', payment_method: 'Card', stripe_session_id: 'cs_test_paid1' });
  const res = await sendWebhook(stripeEvent(stripe.sessions.cs_test_paid1));
  assert.equal(res.status, 200);
  assert.equal(calls.bookingPaidTransitions, 0);
  assert.equal(calls.emails.length + calls.operatorPush.length, 0);
  assert.equal(db.stripe_webhook_events[0].status, 'already_paid');
});

test('already-paid booking, different session (paid twice): booking untouched, staff alerted once to refund', async () => {
  Object.assign(booking(), { payment_status: 'Paid', payment_method: 'Card', stripe_session_id: 'cs_test_paid1' });
  const payload = stripeEvent(stripe.sessions.cs_test_paid2, { id: 'evt_second_payment' });
  assert.equal((await sendWebhook(payload)).status, 200);
  assert.equal((await sendWebhook(payload)).status, 200);
  assert.equal(booking().stripe_session_id, 'cs_test_paid1');
  assert.equal(calls.bookingPaidTransitions, 0);
  assert.equal(customerEmails().length, 0);
  assert.equal(operatorEmails().length, 1);
  assert.match(operatorEmails()[0].subject, /^Check Stripe: possible double payment/);
  assert.equal(calls.operatorPush.length, 1);
  assert.equal(db.stripe_webhook_events[0].status, 'duplicate_payment');
});

test('payment check after the webhook: reports paid, sends nothing more', async () => {
  await sendWebhook(stripeEvent(stripe.sessions.cs_test_paid1));
  const res = await verify({ sessionId: 'cs_test_paid1' });
  assert.deepEqual(JSON.parse(res.body), { paid: true });
  assertNotifiedOnce();
});

test('webhook after the payment check (customer back before Stripe): one transition, notices once', async () => {
  const v = await verify({ sessionId: 'cs_test_paid1' });
  assert.deepEqual(JSON.parse(v.body), { paid: true });
  assertNotifiedOnce();
  assert.equal((await sendWebhook(stripeEvent(stripe.sessions.cs_test_paid1))).status, 200);
  assertNotifiedOnce();
  assert.equal(db.stripe_webhook_events[0].status, 'already_paid');
});

test('payment check and webhook at the same moment: one transition, notices once', async () => {
  patchBarrier = { count: 2, arrived: 0 };
  const [w, v] = await Promise.all([sendWebhook(stripeEvent(stripe.sessions.cs_test_paid1)), verify({ sessionId: 'cs_test_paid1' })]);
  assert.equal(w.status, 200);
  assert.deepEqual(JSON.parse(v.body), { paid: true });
  assertNotifiedOnce();
});

test('payment-success page refreshed many times: notices once', async () => {
  for (let i = 0; i < 4; i++) assert.deepEqual(JSON.parse((await verify({ sessionId: 'cs_test_paid1' })).body), { paid: true });
  assertNotifiedOnce();
});

test('payment check refuses a session that belongs to another booking', async () => {
  stripe.sessions.cs_test_other = session('cs_test_other', 'paid', 'complete', { metadata: { bookingId: '11111111-1111-4111-8111-111111111111' } });
  const res = await verify({ sessionId: 'cs_test_other' });
  assert.deepEqual(JSON.parse(res.body), { paid: false });
  assert.equal(booking().payment_status, 'Unpaid');
});

test('payment check for an unpaid checkout reports not paid', async () => {
  booking().stripe_session_id = 'cs_test_open';
  assert.deepEqual(JSON.parse((await verify()).body), { paid: false });
  assert.equal(booking().payment_status, 'Unpaid');
});

test('email provider down: payment still recorded, webhook 200, failed emails queued for retry, no Stripe retry storm', async () => {
  failEmail = true;
  const payload = stripeEvent(stripe.sessions.cs_test_paid1);
  assert.equal((await sendWebhook(payload)).status, 200);
  assert.equal(booking().payment_status, 'Paid');
  assert.equal(calls.bookingPaidTransitions, 1);
  assert.equal(db.notification_queue.length, 2, 'customer and operator emails queued');
  assert.equal(calls.operatorPush.length, 1);
  failEmail = false;
  assert.equal((await sendWebhook(payload)).status, 200);
  assert.equal(calls.emails.length, 0, 'a repeat delivery does not resend');
});

test('operator payment-link session (booking ref, no bookingId) is recorded too', async () => {
  const s = session('cs_test_link', 'paid', 'complete', { metadata: { booking_ref: 'EVX-UNIT0001' }, client_reference_id: 'EVX-UNIT0001' });
  assert.equal((await sendWebhook(stripeEvent(s, { id: 'evt_link' }))).status, 200);
  assert.equal(booking().payment_status, 'Paid');
  assert.equal(booking().stripe_session_id, 'cs_test_link');
  assertNotifiedOnce();
});

test('session not linked to any booking (dashboard payment link) is acknowledged and ignored', async () => {
  const s = session('cs_test_dash', 'paid', 'complete', { metadata: {} });
  assert.equal((await sendWebhook(stripeEvent(s, { id: 'evt_dash' }))).status, 200);
  assert.equal(db.stripe_webhook_events[0].status, 'no_reference');
  assert.equal(calls.emails.length, 0);
});

test('completed but unpaid checkout is acknowledged without recording', async () => {
  assert.equal((await sendWebhook(stripeEvent(stripe.sessions.cs_test_open))).status, 200);
  assert.equal(booking().payment_status, 'Unpaid');
  assert.equal(db.stripe_webhook_events[0].status, 'not_paid');
});

test('amount different from the booking price is still recorded and flagged', async () => {
  stripe.sessions.cs_test_paid1.amount_total = 5000;
  assert.equal((await sendWebhook(stripeEvent(stripe.sessions.cs_test_paid1))).status, 200);
  assert.equal(booking().payment_status, 'Paid');
  assert.match(db.stripe_webhook_events[0].detail, /amount 5000 pence, booking price 9000 pence/);
});

test('other event types are acknowledged and ignored', async () => {
  const payload = JSON.stringify({ id: 'evt_other', type: 'payment_intent.created', livemode: false, created: 1, data: { object: {} } }, null, 2);
  assert.equal((await sendWebhook(payload)).status, 200);
  assert.equal(db.stripe_webhook_events[0].status, 'ignored');
});

test('checkout start reuses the open session instead of creating a second payable one', async () => {
  booking().stripe_session_id = 'cs_test_open';
  const res = await request('/api/payment/create-checkout-session', { body: JSON.stringify({ bookingId: BOOKING_ID }) });
  assert.equal(JSON.parse(res.body).url, 'https://checkout.stripe.test/cs_test_open');
  assert.equal(stripe.created, 0);
});

test('checkout start for an already-paid session sends the customer to the success page', async () => {
  const res = await request('/api/payment/create-checkout-session', { body: JSON.stringify({ bookingId: BOOKING_ID }) });
  assert.equal(JSON.parse(res.body).url, `https://www.evexec.test/booking?id=${BOOKING_ID}&payment=success&session_id=cs_test_paid1`);
  assert.equal(stripe.created, 0);
});

test('new checkout carries the session id in the success URL', async () => {
  booking().stripe_session_id = null;
  const res = await request('/api/payment/create-checkout-session', { body: JSON.stringify({ bookingId: BOOKING_ID }) });
  assert.equal(res.status, 200);
  assert.equal(booking().stripe_session_id, 'cs_test_new1');
  assert.match(stripe.sessions.cs_test_new1.success_url, /&payment=success&session_id=\{CHECKOUT_SESSION_ID\}$/);
});

test('choosing cash closes the open card checkout and stays Unpaid', async () => {
  booking().stripe_session_id = 'cs_test_open';
  const res = await request('/api/payment/confirm-cash', { body: JSON.stringify({ bookingId: BOOKING_ID }) });
  assert.equal(res.status, 200);
  assert.deepEqual(stripe.expired, ['cs_test_open']);
  assert.equal(booking().payment_method, 'Cash');
  assert.equal(booking().payment_status, 'Unpaid');
});

test('customer paid an older checkout; webhook and payment check race: one transition, no false duplicate alarm', async () => {
  booking().stripe_session_id = 'cs_test_open'; // a newer, unpaid checkout is the one stored
  patchBarrier = { count: 2, arrived: 0 };
  const [w, v] = await Promise.all([sendWebhook(stripeEvent(stripe.sessions.cs_test_paid1)), verify({ sessionId: 'cs_test_paid1' })]);
  assert.equal(w.status, 200);
  assert.deepEqual(JSON.parse(v.body), { paid: true });
  assertNotifiedOnce();
  assert.equal(booking().stripe_session_id, 'cs_test_paid1');
  assert.ok(!calls.emails.some(e => /double payment/.test(e.subject)));
});

// ── operator-made bookings, return bookings, approval ─────────────────────
const checkout = (extra = {}) => request('/api/payment/create-checkout-session', { body: JSON.stringify({ bookingId: BOOKING_ID, terms_accepted: true, ...extra }) });
const cash = () => request('/api/payment/confirm-cash', { body: JSON.stringify({ bookingId: BOOKING_ID, terms_accepted: true }) });
function operatorReturnBooking(o = {}) {
  Object.assign(booking(), {
    source: 'operator', operator_response: 'accepted', status: 'Unassigned', stripe_session_id: null,
    quoted_price: 160, return_journey: true, return_date: '2026-10-17', return_time: '18:30', ...o
  });
}

test('operator-made return booking: one checkout for the whole £160, no approval needed', async () => {
  operatorReturnBooking();
  const res = await checkout();
  assert.equal(res.status, 200);
  assert.equal(stripe.created, 1);
  assert.equal(stripe.sessions.cs_test_new1.amount_total, 16000);
});

test('operator-made booking from before the fix (no operator_response, no driver) can still pay', async () => {
  operatorReturnBooking({ operator_response: null });
  assert.equal((await checkout()).status, 200);
  booking().stripe_session_id = null;
  assert.equal((await cash()).status, 200);
  assert.equal(booking().payment_method, 'Cash');
});

test('website request the operator has not accepted is still refused', async () => {
  Object.assign(booking(), { source: 'website', operator_response: null, status: 'Unassigned', stripe_session_id: null });
  assert.equal((await checkout()).status, 400);
  assert.equal((await cash()).status, 400);
  assert.equal(stripe.created, 0);
});

test('website request rejected by the operator is refused', async () => {
  Object.assign(booking(), { source: 'website', operator_response: 'rejected', status: 'Cancelled', stripe_session_id: null });
  assert.equal((await checkout()).status, 400);
});

test('the £0 return leg is never charged on its own', async () => {
  operatorReturnBooking({ quoted_price: 0, return_journey: false, notes: 'Return leg created automatically from return booking. Original return fare: £160. Outbound ref: EVX-UNIT0000' });
  assert.equal((await checkout()).status, 400);
  assert.equal((await cash()).status, 400);
  assert.equal(stripe.created, 0);
});

test('an open operator payment link is closed before the booking page makes its own checkout', async () => {
  operatorReturnBooking({ stripe_session_id: 'cs_test_link' });
  stripe.sessions.cs_test_link = session('cs_test_link', 'unpaid', 'open', { amount_total: 16000, metadata: { booking_ref: 'EVX-UNIT0001' }, client_reference_id: 'EVX-UNIT0001' });
  const res = await checkout();
  assert.equal(res.status, 200);
  assert.deepEqual(stripe.expired, ['cs_test_link']);
  assert.equal(stripe.created, 1);
});

test('a paid operator payment link stops a second payment on the booking page', async () => {
  operatorReturnBooking({ stripe_session_id: 'cs_test_linkpaid' });
  stripe.sessions.cs_test_linkpaid = session('cs_test_linkpaid', 'paid', 'complete', { amount_total: 16000, metadata: { booking_ref: 'EVX-UNIT0001' } });
  const res = await checkout();
  assert.equal(res.status, 400);
  assert.match(JSON.parse(res.body).error, /already been paid/);
  assert.equal(stripe.created, 0);
});

// ── end-to-end: an operator-made return (Manchester, £160) ─────────────────
// The two rows exactly as the Operator app's createBooking() writes them
// (evexecoperator src/hooks/operator/useBookings.js), then the customer's
// journey: booking page, confirmation email, card payment, receipt.
const RETURN_ID = '7d1c2f6a-5b4e-4c3d-9a8b-0f1e2d3c4b5a';
function seedOperatorReturn() {
  const shared = { customer_name: 'Thomas Smith', customer_phone: '07700900000', customer_email: 'tom@example.test', payment_status: 'Unpaid', payment_method: null, source: 'operator', operator_response: 'accepted', operator_responded_at: '2026-10-17T10:00:00Z', airport: 'Manchester Airport (MAN)', driver_id: null, assigned_driver_id: null, status: 'Unassigned', stripe_session_id: null };
  db.bookings = [
    { ...shared, id: BOOKING_ID, ref: 'EVX-UNIT0001', quoted_price: 160, return_journey: true, return_pickup: 'Manchester Airport (MAN)', return_destination: 'Kirkham', return_airport: 'Manchester Airport (MAN)', return_flight: 'EK017', return_date: '2026-10-17', return_time: '18:30', pickup_location: 'Kirkham', dropoff_address: 'Manchester Airport (MAN)', travel_date: '2026-10-10', travel_time: '04:00', notes: null },
    { ...shared, id: RETURN_ID, ref: 'EVX-UNIT0002', quoted_price: 0, return_journey: false, flight_number: 'EK017', pickup_location: 'Manchester Airport (MAN)', dropoff_address: 'Kirkham', travel_date: '2026-10-17', travel_time: '18:30', notes: 'Return leg created automatically from return booking. Original return fare: £160. Outbound ref: EVX-UNIT0001' },
  ];
}
function bookingPageData(id) {
  const bookingHandler = require(path.join(__dirname, '../../api/booking/index.js'));
  return new Promise((resolve) => {
    const res = { statusCode: 200, setHeader() {}, end: (b) => resolve({ status: res.statusCode, body: JSON.parse(b) }) };
    bookingHandler({ method: 'GET', url: `/api/booking/get?id=${id}`, query: { id }, headers: {} }, res);
  });
}

test('flow: operator-made return is confirmed, charged once at £160, return leg never charged', async () => {
  seedOperatorReturn();
  const { renderQueued } = require('../../lib/emailQueueRender.js');

  // 1. Booking pages: outbound payable (no approval needed), return leg flagged.
  const out = await bookingPageData(BOOKING_ID);
  assert.equal(out.status, 200);
  assert.equal(out.body.source, 'operator');
  assert.equal(out.body.operator_response, 'accepted');
  assert.equal(out.body.return_leg, false);
  const leg = await bookingPageData(RETURN_ID);
  assert.equal(leg.body.return_leg, true);
  assert.equal(leg.body.outbound_ref, 'EVX-UNIT0001');

  // 2. The queued "is booked" email (from the DB trigger) is re-rendered as
  //    Booking Confirmed: both journeys, one £160 price, a pay button.
  const mail = await renderQueued({ type: 'received', channel: 'email', booking_id: BOOKING_ID });
  assert.match(mail.subject, /^Booking confirmed/);
  assert.match(mail.text, /£160\.00/);
  assert.doesNotMatch(mail.text, /£80\.00/);
  assert.match(mail.html, /Return journey/);
  assert.match(mail.html, new RegExp(`booking\\?id=${BOOKING_ID}`));

  // 3. Card checkout for the outbound: one session, £160.
  const c = await checkout();
  assert.equal(c.status, 200);
  assert.equal(stripe.created, 1);
  assert.equal(stripe.sessions.cs_test_new1.amount_total, 16000);

  // 4. Return leg: no checkout, no cash, no second payment.
  const legCheckout = await request('/api/payment/create-checkout-session', { body: JSON.stringify({ bookingId: RETURN_ID, terms_accepted: true }) });
  assert.equal(legCheckout.status, 400);
  const legCash = await request('/api/payment/confirm-cash', { body: JSON.stringify({ bookingId: RETURN_ID, terms_accepted: true }) });
  assert.equal(legCash.status, 400);
  assert.equal(stripe.created, 1);

  // 5. Customer pays; Stripe's signed webhook records it once, for £160.
  stripe.sessions.cs_test_new1 = { ...stripe.sessions.cs_test_new1, payment_status: 'paid', status: 'complete' };
  assert.equal((await sendWebhook(stripeEvent(stripe.sessions.cs_test_new1))).status, 200);
  assert.equal(booking().payment_status, 'Paid');
  assert.equal(calls.bookingPaidTransitions, 1);
  assert.equal(customerEmails().length, 1);
  assert.match(customerEmails()[0].subject, /^Payment received \(£160\.00\)/);
  assert.equal(db.bookings[1].payment_status, 'Unpaid'); // the leg is untouched; it was never charged

  // 6. Paying again from the booking page is impossible.
  const again = await checkout();
  assert.match(JSON.parse(again.body).url, /payment=success&session_id=cs_test_new1$/);
  assert.equal(stripe.created, 1);
});
