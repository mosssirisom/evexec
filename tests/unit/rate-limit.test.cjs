'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const rl = require('../../lib/rateLimit');

const req = (ip) => ({ headers: { 'x-forwarded-for': ip }, socket: { remoteAddress: '10.0.0.1' } });

test.beforeEach(() => rl._reset());

test('allows up to the limit, then refuses with a wait time', () => {
  const r = req('1.1.1.1');
  for (let i = 0; i < 3; i++) assert.equal(rl.hit(r, 'b', 3, 60, 1000 + i).limited, false);
  const over = rl.hit(r, 'b', 3, 60, 2000);
  assert.equal(over.limited, true);
  assert.ok(over.retryAfter >= 1 && over.retryAfter <= 60);
});

test('the limit is per visitor address and per form', () => {
  const a = req('1.1.1.1'), b = req('2.2.2.2');
  for (let i = 0; i < 2; i++) rl.hit(a, 'b', 2, 60, 1000);
  assert.equal(rl.hit(a, 'b', 2, 60, 1001).limited, true);
  assert.equal(rl.hit(b, 'b', 2, 60, 1001).limited, false, 'another visitor is unaffected');
  assert.equal(rl.hit(a, 'other', 2, 60, 1001).limited, false, 'another form is unaffected');
});

test('allows again once the window has passed', () => {
  const r = req('3.3.3.3');
  rl.hit(r, 'b', 1, 60, 1000);
  assert.equal(rl.hit(r, 'b', 1, 60, 2000).limited, true);
  assert.equal(rl.hit(r, 'b', 1, 60, 1000 + 61000).limited, false);
});

test('uses the first address in x-forwarded-for, and falls back to the socket', () => {
  assert.equal(rl.clientAddress({ headers: { 'x-forwarded-for': '9.9.9.9, 10.0.0.2' } }), '9.9.9.9');
  assert.equal(rl.clientAddress({ headers: {}, socket: { remoteAddress: '8.8.8.8' } }), '8.8.8.8');
});

test('tooMany sends a 429 with Retry-After and a plain message', () => {
  const r = req('4.4.4.4');
  const res = { headers: {}, setHeader(k, v) { this.headers[k] = v; }, end(b) { this.body = b; } };
  assert.equal(rl.tooMany(r, res, 'x', 1, 60), false);
  assert.equal(rl.tooMany(r, res, 'x', 1, 60), true);
  assert.equal(res.statusCode, 429);
  assert.ok(Number(res.headers['Retry-After']) >= 1);
  assert.match(JSON.parse(res.body).error, /Too many requests/);
});
