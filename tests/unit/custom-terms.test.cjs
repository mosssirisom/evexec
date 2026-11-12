'use strict';
const test = require('node:test');
const assert = require('node:assert');
const { termsDocument, privacyDocument } = require('../../lib/legal');

const base = (legal) => ({ name: 'Acme Cars', contact_email: 'a@acme.invalid', contact_phone: '07700 900123',
  brand: { licence: 'X1', legal: Object.assign({ legal_name: 'Acme Cars Ltd', status: 'limited company', base: 'Leeds', area: 'Leeds', insurance_confirmed: true }, legal) } });
const text = '## Our terms\nYou agree to pay.\n\n- Item one\n- Item two\n\n## Cancelling\nTell us early. ' + 'x'.repeat(80);

test('standard terms are used by default', () => {
  const d = termsDocument(base({}));
  assert.equal(d.custom, false);
  assert.match(d.html, /id="cancellation"/);
});
test('custom terms need the confirmation tick and enough text', () => {
  assert.equal(termsDocument(base({ terms_mode: 'custom', custom_terms: text })).custom, false);
  assert.equal(termsDocument(base({ terms_mode: 'custom', custom_terms: 'short', numbers_confirmed: true })).custom, false);
});
test('custom terms render as numbered sections and are versioned', () => {
  const d = termsDocument(base({ terms_mode: 'custom', custom_terms: text, numbers_confirmed: true, custom_terms_version: 3 }));
  assert.equal(d.custom, true);
  assert.equal(d.version, 'custom-3');
  assert.equal(d.sections.length, 2);
  assert.match(d.html, /<h2>Our terms<\/h2>/);
  assert.match(d.html, /<li>Item two<\/li>/);
  assert.doesNotMatch(d.html, /id="cancellation"/);
});
test('operator text cannot inject markup', () => {
  const evil = '## <script>alert(1)</script>\n<img src=x onerror=alert(1)> ' + 'y'.repeat(100);
  const d = termsDocument(base({ terms_mode: 'custom', custom_terms: evil, numbers_confirmed: true }));
  assert.doesNotMatch(d.html, /<script|<img/);
  assert.match(d.html, /&lt;script&gt;/);
});
test('privacy keeps the standard policy and adds the extra section', () => {
  const plain = privacyDocument(base({}));
  const extra = privacyDocument(base({ privacy_extra: '## Our CCTV\nWe record in cars.' }));
  assert.equal(extra.sections.length, plain.sections.length + 1);
  assert.match(extra.html, /Our CCTV/);
  assert.match(extra.html, /We record in cars/);
});
