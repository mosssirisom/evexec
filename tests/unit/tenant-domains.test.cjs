'use strict';

// scripts/build-tenant-domains.js: one explicit route per business domain in vercel.json, so
// EV Exec's own pages can never be affected. Run: npm run test:unit

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { validate, apply, routeFor, tidy } = require('../../scripts/build-tenant-domains');

const CURRENT = fs.readFileSync(path.join(__dirname, '..', '..', 'vercel.json'), 'utf8');
const routesOf = (text) => JSON.parse(text).routes.filter((r) => String(r.dest || '').includes('r=site&p='));

test('an empty list changes nothing in vercel.json', () => {
  assert.equal(apply(CURRENT, []), CURRENT);
  assert.equal(routesOf(CURRENT).length, 0, 'no business route is live until a domain is listed');
});

test('each domain gets one route that matches only that domain (with or without www)', () => {
  const out = apply(CURRENT, ['othercabs.co.uk', 'southportcars.com']);
  const routes = routesOf(out);
  assert.equal(routes.length, 2);
  const host = (r) => new RegExp(r.has[0].value);
  assert.ok(host(routes[0]).test('othercabs.co.uk'));
  assert.ok(host(routes[0]).test('www.othercabs.co.uk'));
  assert.ok(!host(routes[0]).test('notothercabs.co.uk'));
  assert.ok(!host(routes[0]).test('othercabs.co.uk.evil.test'));
  assert.ok(!host(routes[0]).test('southportcars.com'));
  for (const r of routes) {
    assert.ok(!host(r).test('www.evexec.co.uk') && !host(r).test('evexec.co.uk'), 'never EV Exec\'s own domain');
    assert.ok(!host(r).test('evexec.vercel.app'));
  }
});

test('the route sends pages (not the API or assets) to the business website', () => {
  const r = routesOf(apply(CURRENT, ['othercabs.co.uk']))[0];
  const src = new RegExp(`^${r.src}$`);
  assert.ok(src.test('/') && src.test('/booking') && src.test('/terms') && src.test('/robots.txt'));
  assert.ok(!src.test('/api/booking/create'), 'API calls are untouched');
  assert.ok(!src.test('/public/css/fonts.css'), 'assets are untouched');
  assert.ok(!src.test('/t/other-cabs/terms'), 'the published terms pages are untouched');
  assert.equal(r.dest, '/api/booking/index.js?r=site&p=$1');
});

test('running it again replaces its own routes and leaves every other route alone', () => {
  const once = apply(CURRENT, ['a-cabs.co.uk', 'b-cabs.co.uk']);
  const twice = apply(once, ['a-cabs.co.uk', 'b-cabs.co.uk']);
  assert.equal(once, twice, 'idempotent');
  const fewer = apply(once, ['a-cabs.co.uk']);
  assert.equal(routesOf(fewer).length, 1);
  assert.equal(apply(fewer, []), CURRENT, 'removing every domain restores the original file');
});

test('the generated file is still valid JSON with the same other routes', () => {
  const out = JSON.parse(apply(CURRENT, ['othercabs.co.uk']));
  const base = JSON.parse(CURRENT);
  assert.equal(out.routes.length, base.routes.length + 1);
  assert.deepEqual(out.builds, base.builds);
});

test('bad lists are refused: junk, duplicates and this website\'s own domains', () => {
  assert.throws(() => validate(['not a domain']), /not a domain/);
  assert.throws(() => validate(['https://']), /not a domain/);
  assert.throws(() => validate(['a.co.uk', 'www.A.co.uk']), /twice/);
  assert.throws(() => validate(['www.evexec.co.uk']), /own domain/);
  assert.throws(() => validate(['evexec.co.uk']), /own domain/);
  assert.throws(() => validate(['evexec.vercel.app']), /own domain/);
  assert.deepEqual(validate(['HTTPS://WWW.Example.co.uk/']), ['example.co.uk']);
  assert.equal(tidy(' www.X.com/ '), 'x.com');
});

test('routeFor writes a regular expression that escapes the dots', () => {
  assert.match(routeFor('othercabs.co.uk'), /othercabs\\\\\.co\\\\\.uk/);
});
