'use strict';

// One website deployment serving several businesses, each on its own domain: the business is
// chosen from the visitor's domain, its own prices and site address are used, and its alerts go
// to its own contact email, never another business's. Run: npm run test:unit

const test = require('node:test');
const assert = require('node:assert/strict');

delete process.env.SUPABASE_SERVICE_ROLE_KEY; // no database calls in these tests
process.env.OPERATOR_EMAIL = 'ops@evexec.test';
delete process.env.SITE_URL;
delete process.env.TENANT_ID;

const brand = require('../../lib/brand');
const pricing = require('../../lib/pricing');
const { lookupPrice, getPrice } = require('../../lib/format');

const EV = '00000000-0000-0000-0000-000000000001';
const OTHER = 'cccccccc-0000-4000-8000-000000000002';
const THIRD = 'dddddddd-0000-4000-8000-000000000003';

function businesses() {
  brand._setBrands({
    [EV]: { name: 'EV Exec', contact_email: 'book@evexec.test', brand: { site_url: 'https://www.evexec.co.uk' } },
    [OTHER]: { name: 'Other Cabs', contact_email: 'desk@othercabs.test', brand: { site_url: 'https://www.othercabs.co.uk' } },
    [THIRD]: { name: 'No Email Ltd', brand: { site_url: 'https://noemail.test' } },
  });
  pricing._setPricing({ airports: [{ name: 'Manchester Airport', code: 'MAN', oneWay: 90, ret: 160 }], extraStop: 5 }, EV);
  pricing._setPricing({ airports: [{ name: 'Leeds Airport', code: 'LBA', oneWay: 70, ret: 130 }], extraStop: 8 }, OTHER);
}

test.beforeEach(businesses);
test.afterEach(() => { pricing._setPricing(null); brand._setBrands({}); delete process.env.SITE_URL; });

const req = (host, extra = {}) => ({ headers: { host, ...extra } });

// ── which business a domain belongs to ───────────────────────────────────────
test('a visitor on a business\'s own domain gets that business', () => {
  assert.equal(brand.tenantIdFor(req('www.othercabs.co.uk')), OTHER);
  assert.equal(brand.tenantIdFor(req('www.evexec.co.uk')), EV);
});

test('www, case, port and a forwarded host all still match', () => {
  assert.equal(brand.tenantIdFor(req('OtherCabs.co.uk')), OTHER);
  assert.equal(brand.tenantIdFor(req('www.othercabs.co.uk:443')), OTHER);
  assert.equal(brand.tenantIdFor(req('internal.vercel.app', { 'x-forwarded-host': 'www.othercabs.co.uk, proxy.example' })), OTHER);
});

test('an unknown domain (a preview address, localhost) gets this deployment\'s own business', () => {
  assert.equal(brand.tenantIdFor(req('evexec-git-branch.vercel.app')), EV);
  assert.equal(brand.tenantIdFor(req('localhost:3000')), EV);
  assert.equal(brand.tenantIdFor({ headers: {} }), EV);
  assert.equal(brand.tenantIdFor(undefined), EV);
});

test('a domain that only looks similar is not matched', () => {
  assert.equal(brand.tenantIdFor(req('notothercabs.co.uk')), EV);
  assert.equal(brand.tenantIdFor(req('othercabs.co.uk.evil.test')), EV);
});

// ── prices stay with their business ──────────────────────────────────────────
test('each business is priced from its own list', () => {
  assert.equal(lookupPrice('Manchester Airport', false, EV), 90);
  assert.equal(lookupPrice('Leeds Airport', false, OTHER), 70);
  assert.equal(lookupPrice('Leeds Airport', true, OTHER), 130);
  assert.equal(pricing.currentPricing(OTHER).extraStop, 8);
});

test('a business never gets another business\'s prices', () => {
  assert.equal(lookupPrice('Manchester Airport', false, OTHER), null, 'EV Exec\'s airport is not on the other list');
  assert.equal(lookupPrice('Leeds Airport', false, EV), null);
  assert.equal(lookupPrice('Manchester Airport', false, THIRD), null, 'a business with no prices gets no fixed price, not EV Exec\'s');
});

test('getPrice uses the booking\'s own business', () => {
  assert.equal(getPrice({ airport: 'Leeds Airport', tenant_id: OTHER }), 70);
  assert.equal(getPrice({ airport: 'Leeds Airport', tenant_id: OTHER, return_journey: true }), 130);
  assert.equal(getPrice({ airport: 'Leeds Airport', tenant_id: EV }), null);
  assert.equal(getPrice({ airport: 'Manchester Airport' }), 90, 'no business means this deployment\'s own');
  assert.equal(getPrice({ airport: 'Leeds Airport', tenant_id: OTHER, quoted_price: '65' }), 65, 'a stored price wins');
});

// ── the booking form's config follows the domain ─────────────────────────────
function callConfig(host) {
  const handler = require('../../api/booking/index.js');
  const res = { headers: {}, setHeader(k, v) { this.headers[k] = v; }, end(b) { this.body = b; } };
  return handler({ method: 'GET', url: '/api/booking/config', headers: { host } }, res).then(() => ({ status: res.statusCode, body: JSON.parse(res.body) }));
}

test('the booking form gets the prices of the business whose domain it is on', async () => {
  const other = await callConfig('www.othercabs.co.uk');
  assert.equal(other.status, 200);
  assert.equal(other.body.tenantId, OTHER);
  assert.deepEqual(other.body.pricing.airports.map(a => a.name), ['Leeds Airport']);
  assert.equal(other.body.pricing.extraStop, 8);

  const ev = await callConfig('www.evexec.co.uk');
  assert.equal(ev.body.tenantId, EV);
  assert.deepEqual(ev.body.pricing.airports.map(a => a.name), ['Manchester Airport']);
});

// ── links and alerts go to the right business ────────────────────────────────
test('a business\'s staff alerts go to its own contact email, never EV Exec\'s', () => {
  assert.equal(brand.staffEmailFor(EV), 'ops@evexec.test', 'EV Exec keeps OPERATOR_EMAIL');
  assert.equal(brand.staffEmailFor(undefined), 'ops@evexec.test');
  assert.equal(brand.staffEmailFor(OTHER), 'desk@othercabs.test');
  assert.equal(brand.staffEmailFor(THIRD), '', 'no contact email means no address, not EV Exec\'s');
});

test('the SITE_URL override (previews) applies to EV Exec only', () => {
  process.env.SITE_URL = 'https://preview.example';
  assert.equal(brand.siteFor(EV), 'https://preview.example');
  assert.equal(brand.siteFor(OTHER), 'https://www.othercabs.co.uk');
});
