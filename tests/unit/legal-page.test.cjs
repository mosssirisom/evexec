'use strict';
const test = require('node:test');
const assert = require('node:assert');
process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-key';
const { pageFor, handle } = require('../../lib/legalPage');

const tenant = (legal = {}, extra = {}) => ({
  id: 'dddddddd-0000-4000-8000-0000000000aa', slug: 'coastal', name: 'Coastal Cars', contact_email: 'hi@coastal.invalid', contact_phone: '07123456789',
  updated_at: '2026-11-12T10:00:00Z', pricing: { extra_stop: 5 },
  brand: { licence: 'PHO1234', colors: { primary: '#112233', accent: '#ffcc00' }, legal: Object.assign({
    status: 'sole trader', base: 'Southport', area: 'Southport', insurance_confirmed: true, responsibilities_confirmed: true,
  }, legal) }, ...extra });

test('a complete business gets its terms and privacy pages with its own name and colours', () => {
  for (const kind of ['terms', 'privacy']) {
    const out = pageFor(tenant(), kind);
    assert.equal(out.status, 200);
    assert.match(out.html, /Coastal Cars/);
    assert.match(out.html, /#112233/);
    assert.match(out.html, /Last updated 12\/11\/2026/);
    assert.match(out.html, /noindex/);
    assert.doesNotMatch(out.html, /EV Exec|PHO0079|Blackpool/i);
  }
});
test('terms are not published until the responsibilities statement is confirmed', () => {
  const out = pageFor(tenant({ responsibilities_confirmed: false }), 'terms');
  assert.equal(out.status, 404);
  assert.match(out.html, /has not published its terms and conditions here yet/);
});
test('a named software provider is shown as not a party to the booking', () => {
  const out = pageFor(tenant({ platform_provider: 'Winjo Digital' }), 'terms');
  assert.match(out.html, /Winjo Digital is not a party to your booking/);
});
test('own terms are shown as the business wrote them and cannot inject markup', () => {
  const out = pageFor(tenant({ terms_mode: 'custom', numbers_confirmed: true, custom_terms: '## Rules\n<script>alert(1)</script> ' + 'x'.repeat(120) }), 'terms');
  assert.equal(out.status, 200);
  assert.doesNotMatch(out.html, /<script>alert/);
});
test('bad colours fall back to the defaults', () => {
  const t = tenant(); t.brand.colors = { primary: 'red;}body{display:none', accent: 'nope' };
  const out = pageFor(t, 'terms');
  assert.doesNotMatch(out.html, /display:none/);
  assert.match(out.html, /#0B132B/);
});

function run(query, rows, status = 200) {
  const realFetch = global.fetch;
  global.fetch = async () => ({ ok: status === 200, json: async () => rows });
  const res = { headers: {}, setHeader(k, v) { this.headers[k] = v; }, end(b) { this.body = b; } };
  return handle({ method: 'GET', query }, res).then(() => { global.fetch = realFetch; return res; });
}
test('the route rejects bad short names and unknown businesses without leaking anything', async () => {
  assert.equal((await run({ b: '../x', kind: 'terms' }, [])).statusCode, 404);
  assert.equal((await run({ b: 'coastal', kind: 'other' }, [])).statusCode, 404);
  assert.equal((await run({ b: 'nobody', kind: 'terms' }, [])).statusCode, 404);
  assert.equal((await run({ b: 'coastal', kind: 'terms' }, [], 500)).statusCode, 404);
});
test('the route serves a complete business and never indexes it', async () => {
  const res = await run({ b: 'coastal', kind: 'privacy' }, [tenant()]);
  assert.equal(res.statusCode, 200);
  assert.equal(res.headers['X-Robots-Tag'], 'noindex');
  assert.match(res.body, /Privacy Policy/);
});
test('this website\'s own business is sent to its own published pages', async () => {
  const { tenantId } = require('../../lib/brand');
  const res = await run({ b: 'ev-exec', kind: 'privacy' }, [tenant({}, { id: tenantId() })]);
  assert.equal(res.statusCode, 302);
  assert.equal(res.headers.Location, '/privacy');
});

test('the /t/ route points at a function that is actually built', () => {
  const cfg = JSON.parse(require('node:fs').readFileSync(require('node:path').join(__dirname, '..', '..', 'vercel.json'), 'utf8'));
  const route = cfg.routes.find((r) => r.src && r.src.startsWith('/t/'));
  assert.ok(route, 'route exists');
  const target = route.dest.split('?')[0].replace(/^\//, '');
  assert.ok(cfg.builds.some((b) => b.src === target), `${target} is a build entry`);
  assert.match(route.dest, /[?&]r=legal(&|$)/);
});
