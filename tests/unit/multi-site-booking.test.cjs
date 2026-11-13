'use strict';

// A booking made on another business's own domain is filed under that business, priced from its
// own list, given its own reference prefix, and its staff alert goes to its own contact email.
// Run: npm run test:unit

const test = require('node:test');
const assert = require('node:assert/strict');

process.env.SUPABASE_SERVICE_ROLE_KEY = 'service-role-unit';
process.env.SUPABASE_URL = 'https://db.test';
process.env.OPERATOR_EMAIL = 'ops@evexec.test';
process.env.RESEND_API_KEY = 're_unit';
delete process.env.SITE_URL;
delete process.env.TENANT_ID;

const brand = require('../../lib/brand');
const pricing = require('../../lib/pricing');

const EV = '00000000-0000-0000-0000-000000000001';
const OTHER = 'cccccccc-0000-4000-8000-000000000002';

const inserts = [];
const emails = [];
global.fetch = async (url, opts = {}) => {
  const u = String(url);
  const method = (opts.method || 'GET').toUpperCase();
  const body = opts.body && typeof opts.body === 'string' && opts.body.startsWith('{') ? JSON.parse(opts.body) : null;
  const ok = (data) => ({ ok: true, status: 200, json: async () => data, text: async () => JSON.stringify(data) });
  if (u.includes('/rest/v1/bookings') && method === 'POST') {
    inserts.push(body);
    return ok([{ id: `id-${inserts.length}`, ...body }]);
  }
  if (u.includes('api.resend.com') && method === 'POST') { emails.push(body); return ok({ id: 'em1' }); }
  if (method === 'GET') return ok([]);
  return ok([]);
};

test.beforeEach(() => {
  inserts.length = 0; emails.length = 0;
  brand._setBrands({
    [EV]: { name: 'EV Exec', contact_email: 'book@evexec.test', brand: { site_url: 'https://www.evexec.co.uk' }, ref_prefix: 'EVX' },
    [OTHER]: { name: 'Other Cabs', contact_email: 'desk@othercabs.test', brand: { site_url: 'https://www.othercabs.co.uk' }, ref_prefix: 'OCB' },
  });
  pricing._setPricing({ airports: [{ name: 'Manchester Airport', code: 'MAN', oneWay: 90, ret: 160 }], extraStop: 5 }, EV);
  pricing._setPricing({ airports: [{ name: 'Leeds Airport', code: 'LBA', oneWay: 70, ret: 130 }], extraStop: 8 }, OTHER);
});
test.afterEach(() => { pricing._setPricing(null); brand._setBrands({}); });

function create(host, body) {
  const handler = require('../../api/booking/index.js');
  const chunks = [Buffer.from(JSON.stringify(body))];
  const req = { method: 'POST', url: '/api/booking/create', headers: { host, 'content-type': 'application/json', 'x-forwarded-for': `9.9.${Math.floor(Math.random() * 200)}.${Math.floor(Math.random() * 200)}` }, socket: { remoteAddress: '1.2.3.4' }, [Symbol.asyncIterator]: async function* () { for (const c of chunks) yield c; } };
  const res = { headers: {}, setHeader(k, v) { this.headers[k] = v; }, end(b) { this.body = b; } };
  return handler(req, res).then(() => ({ status: res.statusCode, body: res.body ? JSON.parse(res.body) : null }));
}

const base = (extra = {}) => ({
  customer_name: 'Sam Test', customer_phone: '07700 900123', customer_email: 'sam@example.test',
  travel_date: '2099-01-01', travel_time: '09:00', pickup_location: '1 High Street', passengers: 2,
  journey_type: 'To Airport', terms_accepted: true, ...extra,
});

test('a booking on another business\'s domain is filed under that business at its own price', async () => {
  const r = await create('www.othercabs.co.uk', base({ airport: 'Leeds Airport' }));
  assert.equal(r.status, 200, JSON.stringify(r.body));
  const b = inserts[0];
  assert.equal(b.tenant_id, OTHER);
  assert.equal(b.quoted_price, 70);
  assert.match(b.ref, /^OCB-/, 'its own reference prefix');
});

test('extra stops are charged at that business\'s own rate', async () => {
  const r = await create('www.othercabs.co.uk', base({ airport: 'Leeds Airport', additional_stops: ['A', 'B'] }));
  assert.equal(r.status, 200, JSON.stringify(r.body));
  assert.equal(inserts[0].quoted_price, 70 + 2 * 8);
});

test('another business\'s airport has no fixed price here (never EV Exec\'s list)', async () => {
  const r = await create('www.othercabs.co.uk', base({ airport: 'Manchester Airport' }));
  assert.equal(r.status, 200, JSON.stringify(r.body));
  assert.equal(inserts[0].tenant_id, OTHER);
  assert.equal(inserts[0].quoted_price, null);
});

test('EV Exec\'s own domain still files under EV Exec at EV Exec\'s price', async () => {
  const r = await create('www.evexec.co.uk', base({ airport: 'Manchester Airport' }));
  assert.equal(r.status, 200, JSON.stringify(r.body));
  assert.equal(inserts[0].tenant_id, EV);
  assert.equal(inserts[0].quoted_price, 90);
  assert.match(inserts[0].ref, /^EVX-/);
});

test('a preview address files under this deployment\'s own business', async () => {
  const r = await create('evexec-git-x.vercel.app', base({ airport: 'Manchester Airport' }));
  assert.equal(r.status, 200, JSON.stringify(r.body));
  assert.equal(inserts[0].tenant_id, EV);
});
