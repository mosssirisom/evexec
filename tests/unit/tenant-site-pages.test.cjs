'use strict';

// The public website of a business other than EV Exec: its home page with a booking form and its
// booking page. Pure builders plus the request handler. Run: npm run test:unit

const test = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');

delete process.env.SUPABASE_SERVICE_ROLE_KEY; // no database calls
const site = require('../../lib/tenantSite');

const T = {
  id: 'cccccccc-0000-4000-8000-000000000002', slug: 'other-cabs', name: 'Other Cabs',
  contact_email: 'desk@othercabs.test', contact_phone: '07700900123',
  brand: { site_url: 'https://www.othercabs.co.uk', tagline: 'Airport transfers from Southport', licence: 'PHO9999', colors: { primary: '#123456', accent: '#e0a030' }, logo_url: 'https://cdn.example/logo.png' },
  pricing: { airports: [{ name: 'Leeds Airport', code: 'LBA', one_way: 70, return_fare: 130 }], extra_stop: 8 },
  updated_at: '2026-11-13T10:00:00Z',
};

test.beforeEach(() => site._setTenants([T]));

function scriptsOf(html) { return [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map((m) => m[1]); }

// ── which business a domain is ───────────────────────────────────────────────
test('finds a business by its own domain (www, case and port ignored)', () => {
  assert.equal(site.findByHost('www.othercabs.co.uk').slug, 'other-cabs');
  assert.equal(site.findByHost('OtherCabs.co.uk:443').slug, 'other-cabs');
  assert.equal(site.findByHost('evexec.co.uk'), null);
  assert.equal(site.findByHost(''), null);
});

// ── home page ────────────────────────────────────────────────────────────────
test('the home page is that business\'s own: name, tagline, prices, colours and licence', () => {
  const h = site.homePage(T);
  assert.match(h, /<title>Other Cabs \| Book a transfer<\/title>/);
  assert.match(h, /Airport transfers from Southport/);
  assert.match(h, /--p:#123456;--a:#e0a030/);
  assert.match(h, /Leeds Airport/);
  assert.match(h, /licence PHO9999/);
  assert.match(h, /tel:\+447700900123/);
  assert.match(h, /desk@othercabs\.test/);
  assert.doesNotMatch(h, /EV Exec|EV EXEC|07721|evexec/i, 'nothing of EV Exec\'s');
  assert.doesNotMatch(h, /Manchester Airport/, 'no other business\'s airports');
});

test('a business with no price list asks for the destination and says the price will be confirmed', () => {
  const h = site.homePage({ ...T, pricing: null });
  assert.match(h, /Airport or destination/);
  assert.match(h, /We will confirm the price with you/);
  assert.doesNotMatch(h, /Leeds Airport/);
});

test('everything a business supplies is escaped (no script injection)', () => {
  const evil = { ...T, name: '<script>alert(1)</script>', contact_email: '"><img src=x>', brand: { ...T.brand, tagline: '<b onmouseover=1>', logo_url: 'javascript:alert(1)' } };
  const h = site.homePage(evil);
  assert.doesNotMatch(h, /<script>alert\(1\)<\/script>/);
  assert.doesNotMatch(h, /<b onmouseover/);
  assert.doesNotMatch(h, /javascript:alert/);
  assert.match(h, /&lt;script&gt;alert\(1\)&lt;\/script&gt;/);
  const data = h.match(/var AIRPORTS=(.*?);\n/);
  assert.ok(data, 'prices are embedded as data');
});

test('an unsafe colour or logo falls back to safe ones', () => {
  const h = site.homePage({ ...T, brand: { colors: { primary: 'red;}body{display:none', accent: 'url(x)' }, logo_url: 'http://insecure.example/x.png' } });
  assert.match(h, /--p:#0B132B;--a:#D7A23F/);
  assert.doesNotMatch(h, /insecure\.example/);
  assert.doesNotMatch(h, /display:none\}/);
});

test('button text is readable on any accent colour', () => {
  assert.equal(site.inkOn('#ffffff'), '#0B132B');
  assert.equal(site.inkOn('#000000'), '#FFFFFF');
  assert.equal(site.inkOn('#D7A23F'), '#0B132B');
  assert.equal(site.inkOn('#123456'), '#FFFFFF');
});

test('the cancellation policy comes from the business\'s own bands, in plain words', () => {
  assert.equal(site.policyText(T),
    'Free to cancel more than 48 hours before pickup. 25% of the fare more than 24 and up to 48 hours before pickup. 50% of the fare more than 2 and up to 24 hours before pickup. The full fare 2 hours or less before pickup, or if no one is at the pickup point.');
  const own = { ...T, brand: { ...T.brand, legal: { policy: { standard: [{ hours: 72, pct: 0 }, { hours: 24, pct: 30 }, { hours: 4, pct: 60 }] } } } };
  require('../../lib/brand')._setBrands({ [T.id]: { name: T.name, brand: own.brand } });
  try {
    assert.match(site.policyText(own), /^Free to cancel more than 72 hours before pickup\. 30% of the fare more than 24 and up to 72 hours/);
    assert.match(site.policyText(own), /The full fare 4 hours or less before pickup/);
  } finally { require('../../lib/brand')._setBrands({}); }
});

test('terms and privacy links appear only when the business has published them', () => {
  assert.doesNotMatch(site.homePage(T), /href="\/terms"|href="\/privacy"/);
});

// ── the embedded scripts are valid JavaScript ───────────────────────────────
test('the home page and booking page scripts parse', () => {
  for (const html of [site.homePage(T), site.bookingPage(T)]) {
    const scripts = scriptsOf(html);
    assert.equal(scripts.length, 1);
    assert.doesNotThrow(() => new vm.Script(scripts[0]));
  }
});

// ── booking page ─────────────────────────────────────────────────────────────
test('the booking page is noindex, branded, and has the business\'s contact details', () => {
  const b = site.bookingPage(T);
  assert.match(b, /<meta name="robots" content="noindex,nofollow">/);
  assert.match(b, /<title>Your booking \| Other Cabs<\/title>/);
  assert.match(b, /Call 07700 900123/);
  assert.match(b, /Pay by card online/);
  assert.doesNotMatch(b, /EV Exec|07721|evexec/i);
});

// ── handler ──────────────────────────────────────────────────────────────────
function call(host, page, method = 'GET') {
  const res = { headers: {}, setHeader(k, v) { this.headers[k] = v; }, end(b) { this.body = b; } };
  return site.handle({ method, headers: { host }, query: { p: page } }, res).then(() => res);
}

test('the handler serves the home and booking pages on the business\'s own domain', async () => {
  const home = await call('www.othercabs.co.uk', '');
  assert.equal(home.statusCode, 200);
  assert.match(home.headers['Content-Type'], /text\/html/);
  assert.match(home.body, /Book a transfer/);
  const booking = await call('www.othercabs.co.uk', 'booking');
  assert.equal(booking.statusCode, 200);
  assert.equal(booking.headers['Cache-Control'], 'no-store');
});

test('an unknown domain gets a plain "not set up" page, never EV Exec\'s or another business\'s', async () => {
  const r = await call('nobody.example', '');
  assert.equal(r.statusCode, 404);
  assert.match(r.body, /not set up yet/);
  assert.doesNotMatch(r.body, /Other Cabs|EV Exec/);
});

test('terms and privacy go to the business\'s published pages; robots.txt hides the booking page', async () => {
  const terms = await call('othercabs.co.uk', 'terms');
  assert.equal(terms.statusCode, 302);
  assert.equal(terms.headers.Location, '/t/other-cabs/terms');
  const robots = await call('othercabs.co.uk', 'robots.txt');
  assert.match(robots.body, /Disallow: \/booking/);
  assert.match(robots.headers['Content-Type'], /text\/plain/);
});

test('any other page is a branded 404, and only GET and HEAD are served', async () => {
  const nf = await call('othercabs.co.uk', 'fleet');
  assert.equal(nf.statusCode, 404);
  assert.match(nf.body, /Page not found/);
  const post = await call('othercabs.co.uk', '', 'POST');
  assert.equal(post.statusCode, 405);
});

test('an inactive or unlisted business is not served', async () => {
  site._setTenants([]);
  const r = await call('www.othercabs.co.uk', '');
  assert.equal(r.statusCode, 404);
});
