'use strict';

// Drives a business's website in a real browser (Chromium via Playwright). No server is started:
// every request to the business's domain is answered inside the test, with the real page builders
// and mocked API responses. Run: npm run test:browser
// Screenshots go to tests/browser/out/ (ignored by git).

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

let chromium = null;
try { ({ chromium } = require('playwright')); } catch (_) { /* skipped below */ }

delete process.env.SUPABASE_SERVICE_ROLE_KEY;
const site = require('../../lib/tenantSite');

const HOST = 'www.othercabs.co.uk';
const ORIGIN = `https://${HOST}`;
const T = {
  id: 'cccccccc-0000-4000-8000-000000000002', slug: 'other-cabs', name: 'Other Cabs',
  contact_email: 'desk@othercabs.test', contact_phone: '07700900123',
  brand: { site_url: `https://${HOST}`, tagline: 'Airport transfers from Southport', licence: 'PHO9999', colors: { primary: '#123456', accent: '#e0a030' } },
  pricing: { airports: [{ name: 'Leeds Airport', code: 'LBA', one_way: 70, return_fare: 130 }, { name: 'Manchester Airport', code: 'MAN', one_way: 55, return_fare: 100 }], extra_stop: 8 },
  updated_at: '2026-11-13T10:00:00Z',
};
const OUT = path.join(__dirname, 'out');
fs.mkdirSync(OUT, { recursive: true });

const BASE_BOOKING = { id: 'bbbbbbbb-0000-4000-8000-000000000001', ref: 'OCB-ABC123', status: 'Unassigned', source: 'website', operator_response: null, payment_status: 'Unpaid', payment_method: null, pickup_location: '1 High Street, Southport', airport: 'Leeds Airport', dropoff_address: 'Leeds Airport', travel_date: '2099-01-05', travel_time: '09:30:00', passengers: 2, quoted_price: 70, return_journey: false, return_leg: false, needs_terms: false, policy_version: '4' };

let browser;
test.before(async () => {
  if (!chromium) return;
  try { browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--no-sandbox'] }); } catch (_) { browser = null; }
});
test.after(async () => { if (browser) await browser.close(); });

// A page whose requests to the business's domain are answered here.
async function open(viewport, scenario = {}) {
  site._setTenants([T]);
  const context = await browser.newContext({ viewport, deviceScaleFactor: 1 });
  const seen = { posts: [], console: [], errors: [] };
  await context.route(`${ORIGIN}/**`, async (route) => {
    const req = route.request(); const url = new URL(req.url()); const p = url.pathname;
    const json = (status, body) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });
    if (p === '/') return route.fulfill({ status: 200, contentType: 'text/html', body: site.homePage(T) });
    if (p === '/booking') return route.fulfill({ status: 200, contentType: 'text/html', body: site.bookingPage(T) });
    if (p.endsWith('.css')) return route.fulfill({ status: 200, contentType: 'text/css', body: '' });
    if (p === '/api/booking/create') { seen.posts.push({ p, body: JSON.parse(req.postData() || '{}') }); return json(scenario.createStatus || 200, scenario.create || { success: true, bookingId: BASE_BOOKING.id }); }
    if (p === '/api/booking/get') return json(scenario.getStatus || 200, scenario.booking || BASE_BOOKING);
    if (p === '/api/booking/lookup') { seen.posts.push({ p, body: JSON.parse(req.postData() || '{}') }); return json(scenario.lookupStatus || 200, scenario.lookup || { id: BASE_BOOKING.id }); }
    if (p === '/api/payment/create-checkout-session') { seen.posts.push({ p, body: JSON.parse(req.postData() || '{}') }); return json(200, { url: `${ORIGIN}/stripe-test-page` }); }
    if (p === '/api/payment/confirm-cash') { seen.posts.push({ p, body: JSON.parse(req.postData() || '{}') }); return json(200, { success: true }); }
    if (p === '/api/payment/verify') { seen.posts.push({ p, body: JSON.parse(req.postData() || '{}') }); return json(200, { paid: false }); }
    if (p === '/stripe-test-page') return route.fulfill({ status: 200, contentType: 'text/html', body: '<h1>stripe</h1>' });
    return route.fulfill({ status: 404, body: 'not mocked: ' + p });
  });
  const page = await context.newPage();
  page.on('console', (m) => { if (m.type() === 'error') seen.console.push(m.text()); });
  page.on('pageerror', (e) => seen.errors.push(e.message));
  page.on('dialog', (d) => d.accept());
  return { page, context, seen };
}
const noOverflow = (page) => page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
// Runs the test only when Chromium launched (checked when the test starts, after the browser is up).
const bt = (name, fn) => test(name, async (t) => { if (!browser) { t.skip('Chromium is not available here'); return; } await fn(t); });

for (const [label, vp] of [['phone', { width: 390, height: 844 }], ['ipad', { width: 820, height: 1180 }], ['desktop', { width: 1366, height: 900 }]]) {
  bt(`home page renders cleanly on ${label}: no sideways scroll, no console errors`, async () => {
    const { page, context, seen } = await open(vp);
    await page.goto(`${ORIGIN}/`);
    assert.equal(await page.title(), 'Other Cabs | Book a transfer');
    assert.ok((await noOverflow(page)) <= 0, 'no horizontal overflow');
    assert.equal(await page.locator('h1').innerText(), 'Other Cabs');
    await page.screenshot({ path: path.join(OUT, `home-${label}.png`), fullPage: true });
    assert.deepEqual(seen.errors.concat(seen.console), []);
    await context.close();
  });
}

bt('home page: price follows the airport and the return tick, and the form posts that business\'s booking', async () => {
  const { page, context, seen } = await open({ width: 390, height: 844 });
  await page.goto(`${ORIGIN}/`);
  assert.ok(await page.locator('#priceBox').evaluate((e) => e.classList.contains('hidden')), 'no price before an airport is chosen');
  await page.selectOption('#airport', 'Leeds Airport');
  assert.equal(await page.locator('#priceAmt').innerText(), '£70');
  await page.check('#ret');
  assert.equal(await page.locator('#priceAmt').innerText(), '£130');
  assert.equal(await page.locator('#priceLabel').innerText(), 'Return price');

  await page.fill('#address', '1 High Street, Southport');
  await page.fill('#date', '2099-01-05'); await page.fill('#time', '09:30');
  await page.fill('#rdate', '2099-01-08'); await page.fill('#rtime', '18:00');
  await page.fill('#cname', 'Sam Test'); await page.fill('#cphone', '07700 900123'); await page.fill('#cemail', 'sam@example.test');
  await page.check('#terms');
  await Promise.all([page.waitForURL(/\/booking\?id=/), page.click('#submitBtn')]);
  const post = seen.posts.find((x) => x.p === '/api/booking/create').body;
  assert.equal(post.journey_type, 'To Airport');
  assert.equal(post.airport, 'Leeds Airport');
  assert.equal(post.pickup_location, '1 High Street, Southport');
  assert.equal(post.dropoff_address, 'Leeds Airport');
  assert.equal(post.return_journey, true);
  assert.equal(post.return_destination, '1 High Street, Southport');
  assert.equal(post.terms_accepted, true);
  assert.equal(post.company_website, '', 'the spam trap stays empty');
  await context.close();
});

bt('home page: "from the airport" swaps the labels and records the airport as the pickup', async () => {
  const { page, context, seen } = await open({ width: 390, height: 844 });
  await page.goto(`${ORIGIN}/`);
  await page.click('text=From the airport');
  assert.equal(await page.locator('#addressLabel').innerText(), 'Drop-off address');
  assert.ok(!(await page.locator('#flightRow').evaluate((e) => e.classList.contains('hidden'))), 'flight number shown');
  await page.selectOption('#airport', 'Manchester Airport');
  await page.fill('#address', '2 Low Road'); await page.fill('#date', '2099-02-01'); await page.fill('#time', '14:00');
  await page.fill('#flight', 'BA123'); await page.fill('#cname', 'Pat'); await page.fill('#cphone', '07700 900456');
  await page.check('#terms');
  await Promise.all([page.waitForURL(/\/booking\?id=/), page.click('#submitBtn')]);
  const post = seen.posts.find((x) => x.p === '/api/booking/create').body;
  assert.equal(post.journey_type, 'From Airport');
  assert.equal(post.pickup_location, 'Manchester Airport');
  assert.equal(post.dropoff_address, '2 Low Road');
  assert.equal(post.flight_number, 'BA123');
  await context.close();
});

bt('home page: missing details show a clear message and nothing is sent', async () => {
  const { page, context, seen } = await open({ width: 390, height: 844 });
  await page.goto(`${ORIGIN}/`);
  await page.click('#submitBtn');
  assert.match(await page.locator('#formMsg').innerText(), /choose an airport/i);
  await page.selectOption('#airport', 'Leeds Airport'); await page.fill('#address', 'x');
  await page.fill('#date', '2099-01-05'); await page.fill('#time', '09:30');
  await page.fill('#cname', 'Sam'); await page.fill('#cphone', '123');
  await page.click('#submitBtn');
  assert.match(await page.locator('#formMsg').innerText(), /mobile number/i);
  await page.fill('#cphone', '07700 900123');
  await page.click('#submitBtn');
  assert.match(await page.locator('#formMsg').innerText(), /cancellation policy/i);
  assert.equal(seen.posts.length, 0);
  await context.close();
});

bt('home page: a refused booking shows the server\'s message and lets the customer try again', async () => {
  const { page, context } = await open({ width: 390, height: 844 }, { createStatus: 400, create: { error: 'The travel date is in the past. Please choose another date.' } });
  await page.goto(`${ORIGIN}/`);
  await page.selectOption('#airport', 'Leeds Airport'); await page.fill('#address', '1 High St');
  await page.fill('#date', '2099-01-05'); await page.fill('#time', '09:30');
  await page.fill('#cname', 'Sam'); await page.fill('#cphone', '07700 900123'); await page.check('#terms');
  await page.click('#submitBtn');
  await page.waitForFunction(() => !document.getElementById('formMsg').classList.contains('hidden'));
  assert.match(await page.locator('#formMsg').innerText(), /in the past/);
  assert.equal(await page.locator('#submitBtn').isEnabled(), true);
  await context.close();
});

// ── booking page ─────────────────────────────────────────────────────────────
async function bookingState(booking, { vp = { width: 390, height: 844 }, query = '', shot = '' } = {}) {
  const ctx = await open(vp, { booking });
  await ctx.page.goto(`${ORIGIN}/booking?id=${BASE_BOOKING.id}${query}`);
  await ctx.page.waitForSelector('#stBooking:not(.hidden), #stError:not(.hidden)');
  if (shot) await ctx.page.screenshot({ path: path.join(OUT, `booking-${shot}.png`), fullPage: true });
  return ctx;
}
const visible = (page, id) => page.locator(`#${id}`).evaluate((e) => !e.classList.contains('hidden'));

bt('booking page: a new request says it is awaiting confirmation and offers no payment', async () => {
  const { page, context, seen } = await bookingState(BASE_BOOKING, { shot: 'awaiting' });
  assert.equal(await page.locator('#pill').innerText(), 'Awaiting confirmation');
  assert.ok(await visible(page, 'pAwait'));
  assert.ok(!(await visible(page, 'pPay')));
  assert.equal(await page.locator('#priceAmt').innerText(), '£70');
  assert.match(await page.locator('#refText').innerText(), /OCB-ABC123/);
  assert.match(await page.locator('#rows').innerText(), /05\/01\/2099 at 09:30/);
  assert.ok((await noOverflow(page)) <= 0);
  assert.deepEqual(seen.errors.concat(seen.console), []);
  await context.close();
});

bt('booking page: once accepted, the customer can pay by card (taken to the payment page)', async () => {
  const { page, context, seen } = await bookingState({ ...BASE_BOOKING, operator_response: 'accepted' }, { shot: 'pay' });
  assert.equal(await page.locator('#pill').innerText(), 'Accepted');
  assert.ok(await visible(page, 'pPay'));
  assert.match(await page.locator('#pPay').innerText(), /Free to cancel more than 48 hours/);
  await Promise.all([page.waitForURL(/stripe-test-page/), page.click('#btnCard')]);
  assert.deepEqual(seen.posts.find((x) => x.p === '/api/payment/create-checkout-session').body, { bookingId: BASE_BOOKING.id });
  await context.close();
});

bt('booking page: a booking that needs the policy accepted will not take payment until it is ticked', async () => {
  const { page, context, seen } = await bookingState({ ...BASE_BOOKING, operator_response: 'accepted', needs_terms: true });
  assert.ok(await visible(page, 'policyRow'));
  await page.click('#btnCard');
  assert.ok(await visible(page, 'policyErr'));
  assert.equal(seen.posts.length, 0, 'nothing sent before the tick');
  await page.check('#policyOk');
  await Promise.all([page.waitForURL(/stripe-test-page/), page.click('#btnCard')]);
  assert.equal(seen.posts[0].body.terms_accepted, true);
  await context.close();
});

bt('booking page: choosing cash confirms it', async () => {
  const { page, context, seen } = await bookingState({ ...BASE_BOOKING, operator_response: 'accepted' });
  await page.click('#btnCash');
  await page.waitForFunction(() => location.search.includes('id='));
  await page.waitForTimeout(200);
  assert.ok(seen.posts.some((x) => x.p === '/api/payment/confirm-cash'));
  await context.close();
});

bt('booking page: paid, cash-chosen, return-leg, on-the-road, completed, cancelled and rejected states', async () => {
  const cases = [
    [{ ...BASE_BOOKING, operator_response: 'accepted', payment_status: 'Paid', payment_method: 'Card' }, 'Confirmed', /Paid by card online/, 'pDone'],
    [{ ...BASE_BOOKING, operator_response: 'accepted', payment_method: 'Cash' }, 'Confirmed', /cash on the day/i, 'pDone'],
    [{ ...BASE_BOOKING, operator_response: 'accepted', return_leg: true, quoted_price: 0, outbound_ref: 'OCB-OUT222' }, 'Confirmed', /OCB-OUT222/, 'pDone'],
    [{ ...BASE_BOOKING, operator_response: 'accepted', status: 'En Route' }, 'En Route', /on the way/, 'pRoad'],
    [{ ...BASE_BOOKING, operator_response: 'accepted', status: 'Completed' }, 'Completed', /completed/i, 'pDone'],
    [{ ...BASE_BOOKING, status: 'Cancelled' }, 'Cancelled', /cancelled/i, 'pBad'],
    [{ ...BASE_BOOKING, status: 'Cancelled', operator_response: 'rejected' }, 'Unavailable', /No payment has been taken/, 'pBad'],
  ];
  for (const [b, pill, text, panel] of cases) {
    const { page, context } = await bookingState(b);
    assert.equal(await page.locator('#pill').innerText(), pill, JSON.stringify(b.status + b.payment_status));
    assert.ok(await visible(page, panel), panel);
    assert.match(await page.locator(`#${panel}`).innerText(), text);
    assert.ok(!(await visible(page, 'pPay')) || panel === 'pDone', 'no payment offered');
    await context.close();
  }
});

bt('booking page: returning from the card page asks the server to check the payment', async () => {
  const { page, context, seen } = await bookingState({ ...BASE_BOOKING, operator_response: 'accepted' }, { query: '&payment=success&session_id=cs_test_1' });
  assert.ok(await visible(page, 'pPending'));
  await page.waitForTimeout(300);
  assert.equal(seen.posts.find((x) => x.p === '/api/payment/verify').body.sessionId, 'cs_test_1');
  await context.close();
});

bt('booking page: a cancelled card payment says nothing was charged', async () => {
  const { page, context } = await bookingState({ ...BASE_BOOKING, operator_response: 'accepted' }, { query: '&payment=cancelled' });
  assert.ok(await visible(page, 'payCancelled'));
  assert.match(await page.locator('#payCancelled').innerText(), /not been charged/);
  await context.close();
});

bt('booking page: no reference opens the look-up, which accepts the business\'s own reference format', async () => {
  const ctx = await open({ width: 390, height: 844 });
  await ctx.page.goto(`${ORIGIN}/booking`);
  await ctx.page.waitForSelector('#stLookup:not(.hidden)');
  await ctx.page.fill('#lkRef', 'ocb-abc123'); await ctx.page.fill('#lkPhone', '07700 900123');
  await Promise.all([ctx.page.waitForURL(/booking\?id=/), ctx.page.click('#lkBtn')]);
  assert.deepEqual(ctx.seen.posts.find((x) => x.p === '/api/booking/lookup').body, { ref: 'ocb-abc123', phone: '07700 900123' });
  await ctx.context.close();
});

bt('booking page: an unknown booking shows a plain message with the business\'s phone number', async () => {
  const ctx = await open({ width: 390, height: 844 }, { getStatus: 404, booking: { error: 'Booking not found' } });
  await ctx.page.goto(`${ORIGIN}/booking?id=${BASE_BOOKING.id}`);
  await ctx.page.waitForSelector('#stError:not(.hidden)');
  assert.match(await ctx.page.locator('#stError').innerText(), /Booking not found/);
  assert.match(await ctx.page.locator('#stError').innerText(), /07700 900123/);
  await ctx.context.close();
});

for (const [label, vp] of [['ipad', { width: 820, height: 1180 }], ['desktop', { width: 1366, height: 900 }]]) {
  bt(`booking page fits on ${label}`, async () => {
    const { page, context } = await bookingState({ ...BASE_BOOKING, operator_response: 'accepted' }, { vp, shot: `pay-${label}` });
    assert.ok((await noOverflow(page)) <= 0);
    await context.close();
  });
}
