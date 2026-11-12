'use strict';
// The legal templates. With EV Exec's own details they must reproduce EV Exec's
// published terms.html and privacy.html section by section; for any other
// business they must never show EV Exec's details, and they must say what is
// still missing.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { termsDocument, privacyDocument, legalGaps, legalDetails } = require('../../lib/legal');

const ROOT = path.join(__dirname, '..', '..');
const ENTITIES = { amp: '&', lt: '<', gt: '>', quot: '"', ldquo: '“', rdquo: '”', rsquo: '’', lsquo: '‘', middot: '·', nbsp: ' ', ndash: '–', mdash: '—', pound: '£', rarr: '→' };
const decode = (s) => s.replace(/&(#\d+|[a-z]+);/gi, (m, e) => (e[0] === '#' ? String.fromCharCode(+e.slice(1)) : ENTITIES[e.toLowerCase()] ?? m));
const flat = (html) => decode(html.replace(/<(script|style)[\s\S]*?<\/\1>/g, '').replace(/<[^>]+>/g, '')).replace(/\s+/g, '');

// The cards of a published page, by section number.
function cards(file) {
  const html = fs.readFileSync(path.join(ROOT, file), 'utf8');
  const out = {};
  const re = /<div class="content-card"[^>]*>\s*<p class="section-label">(\d+)<\/p>([\s\S]*?)\n<\/div>/g;
  let m;
  while ((m = re.exec(html))) out[+m[1]] = m[0];
  return out;
}

// EV Exec as it is on live (shared with scripts/legal/build.js).
const EV_RECORD = require('../../scripts/legal/ev-exec-tenant');
// The template tests need a business that has confirmed the operator responsibilities statement.
const EV = { ...EV_RECORD, brand: { ...EV_RECORD.brand, legal: { ...EV_RECORD.brand.legal, responsibilities_confirmed: true } } };

test('with EV Exec\'s details the terms reproduce every section of terms.html', () => {
  const doc = termsDocument(EV);
  const live = cards('terms.html');
  assert.equal(doc.sections.length, 20);
  const html = require('../../lib/legal/render').renderSections(doc.sections);
  const mine = {};
  const re = /<div class="content-card"[^>]*>\s*<p class="section-label">(\d+)<\/p>([\s\S]*?)\n<\/div>/g;
  let m; while ((m = re.exec(html))) mine[+m[1]] = m[0];
  for (let i = 1; i <= 20; i++) {
    let want = flat(live[i]);
    if (i === 20) want = want.replace(/Previousversions:.*$/, ''); // EV Exec's own version history
    assert.equal(flat(mine[i]), want, `terms section ${i} differs from terms.html`);
  }
  assert.equal(doc.ready, true);
});

test('with EV Exec\'s details the privacy policy matches privacy.html', () => {
  const doc = privacyDocument(EV);
  const live = cards('privacy.html');
  const html = require('../../lib/legal/render').renderSections(doc.sections);
  const mine = {};
  const re = /<div class="content-card"[^>]*>\s*<p class="section-label">(\d+)<\/p>([\s\S]*?)\n<\/div>/g;
  let m; while ((m = re.exec(html))) mine[+m[1]] = m[0];
  assert.equal(doc.sections.length, 10);
  for (let i = 1; i <= 10; i++) assert.equal(flat(mine[i]), flat(live[i]), `privacy section ${i} differs from privacy.html`);
});

// ── Another business ────────────────────────────────────────────────────────

const COASTAL = {
  id: 'dddddddd-0000-4000-8000-000000000002', name: 'Coastal Cars', contact_email: 'hello@coastal.test', contact_phone: '+44 7123 456789',
  brand: {
    licence: 'PHO1234',
    legal: {
      insurance_confirmed: true, responsibilities_confirmed: true, status: 'limited company', legal_name: 'Coastal Cars Ltd', company_number: '12345678', registered_address: '1 High Street, Southport PR8 1AA',
      base: 'Southport, Merseyside', area: 'Southport and Sefton', service: 'airport transfers and private hire',
      licensing_authority: 'Sefton Council', fleet: 'a fleet of three saloon cars', max_passengers: 3, jurisdiction: 'england-wales',
      policy: { standard: [{ hours: 72, pct: 0 }, { hours: 24, pct: 50 }, { hours: 4, pct: 75 }], free_changes: 1, change_fee: 15, wait_address: 10, wait_airport: 45 },
    },
  },
  pricing: { extra_stop: 8 },
};
const LEAK = /ev exec|evexec|07721|070370|PHO0079|Blackpool|Fylde|Tesla|Enyaq|Privilege/i;

test('another business\'s documents carry its own details and none of EV Exec\'s', () => {
  for (const doc of [termsDocument(COASTAL), privacyDocument(COASTAL)]) {
    assert.equal(doc.ready, true, JSON.stringify(doc.gaps));
    assert.doesNotMatch(doc.html + doc.text, LEAK, `${doc.kind} mentions EV Exec`);
    assert.doesNotMatch(doc.html, /legal-gap/, 'no placeholder left when every detail is set');
  }
  const t = termsDocument(COASTAL);
  assert.match(t.text, /Coastal Cars Ltd, trading as Coastal Cars is a limited company \(company number 12345678, registered office 1 High Street, Southport PR8 1AA\)/);
  assert.match(t.text, /private hire operator licence PHO1234, issued by Sefton Council/);
  assert.match(t.text, /hello@coastal\.test/);
  assert.match(t.text, /07123 456789/);
  assert.match(t.text, /up to 3 passengers/);
  assert.match(privacyDocument(COASTAL).text, /based in Southport, Merseyside/);
});

test('its own cancellation numbers and charges are used', () => {
  const t = termsDocument(COASTAL).text;
  assert.match(t, /More than 72 hours before the scheduled pickup time/);
  assert.match(t, /More than 24 hours and up to 72 hours before50% of the journey price/);
  assert.match(t, /More than 4 hours and up to 24 hours before75% of the journey price/);
  assert.match(t, /4 hours or less before, or after the driver has set off/);
  assert.match(t, /£8 per extra stop/);
  assert.match(t, /The first change is free, apart from any price difference/);
  assert.match(t, /charge £15 per change/);
  assert.match(t, /wait free for 10 minutes/);
  assert.match(t, /waits free for 45 minutes after the flight/);
  assert.match(termsDocument(COASTAL).glance, /^Free more than 72 hours before pickup\. 50% of the fare from 72 hours, 75% from 24 hours, and the full fare from 4 hours/);
});

test('a business that has set nothing gets visible placeholders and a list of what is missing', () => {
  const bare = { id: 'eeeeeeee-0000-4000-8000-000000000003', name: 'Bare Business', brand: {} };
  const t = termsDocument(bare);
  const keys = t.gaps.map((g) => g.key).sort();
  assert.deepEqual(keys, ['area', 'email', 'insurance', 'licence', 'phone', 'responsibilities', 'status'].sort());
  assert.equal(t.ready, false);
  assert.match(t.html, /legal-gap/);
  assert.doesNotMatch(t.html + t.text, LEAK);
  const pr = privacyDocument(bare);
  assert.deepEqual(pr.gaps.map((g) => g.key).sort(), ['base', 'email', 'phone', 'status']);
  assert.match(pr.html, /legal-gap/);
  assert.doesNotMatch(pr.html + pr.text, LEAK);
});

test('a limited company must give its company number and registered office', () => {
  const t = { name: 'X Ltd', contact_email: 'a@b.test', contact_phone: '07123456789', brand: { licence: 'L1', legal: { status: 'limited company', base: 'Leeds', area: 'Leeds' } } };
  const keys = legalGaps(legalDetails(t)).map((g) => g.key);
  assert.ok(keys.includes('company_number') && keys.includes('registered_address'));
});

test('Scottish and Northern Irish businesses get their own governing law', () => {
  const sc = termsDocument({ ...COASTAL, brand: { ...COASTAL.brand, legal: { ...COASTAL.brand.legal, jurisdiction: 'scotland' } } }).text;
  assert.match(sc, /governed by the laws of Scotland/);
  assert.match(sc, /living in England, Wales or Northern Ireland/);
  assert.doesNotMatch(sc, /England and Wales/);
  const ni = termsDocument({ ...COASTAL, brand: { ...COASTAL.brand, legal: { ...COASTAL.brand.legal, jurisdiction: 'northern-ireland' } } }).text;
  assert.match(ni, /laws of Northern Ireland/);
});

test('business-supplied text is escaped, so it cannot inject markup', () => {
  const evil = { name: '<script>alert(1)</script>', contact_email: 'a@b.test', contact_phone: '07123456789', brand: { licence: '"><img src=x>', legal: { status: 'sole trader', base: '<b>x</b>', area: 'a' } } };
  const html = termsDocument(evil).html + privacyDocument(evil).html;
  assert.doesNotMatch(html, /<script>alert|<img src=x>|<b>x<\/b>/);
});

test('invalid policy numbers fall back to the defaults', () => {
  const bad = { ...COASTAL, brand: { ...COASTAL.brand, legal: { ...COASTAL.brand.legal, policy: { standard: [{ hours: 10, pct: 0 }, { hours: 20, pct: 25 }, { hours: 2, pct: 50 }], wait_address: -5, change_fee: 'lots' } } } };
  const t = termsDocument(bad).text;
  assert.match(t, /More than 48 hours before the scheduled pickup time/, 'unordered bands fall back to the defaults');
  assert.match(t, /wait free for 15 minutes/);
});


// ── The audit fixes (docs/legal/audit-2026-11-12.md) ─────────────────────────

test('the published pages are built from the templates (run npm run build:legal after changing them)', () => {
  const t = fs.readFileSync(path.join(ROOT, 'terms.html'), 'utf8');
  assert.match(t, /Version 4 &middot; effective 12\/11\/2026/);
  assert.match(t, /href="\/terms-v3">Version 3<\/a>/);
  const v3 = fs.readFileSync(path.join(ROOT, 'terms-v3.html'), 'utf8');
  assert.match(v3, /<meta name="robots" content="noindex, follow"\/>/);
  assert.match(v3, /canonical" href="https:\/\/www\.evexec\.co\.uk\/terms-v3"/);
  assert.match(v3, /Version 3\. These terms applied to bookings accepted from 16\/10\/2026 until version 4/);
  const P = require('../../lib/cancellation');
  assert.equal(P.TERMS_VERSION, '4');
  assert.equal(P.policyPath('3'), '/terms-v3');
  assert.equal(P.policyPath('4'), '/terms');
  assert.deepEqual(P.BANDS['4'], P.BANDS['3'], 'version 4 charges are the same as version 3');
});

test('terms: consumers are not stripped of rights the law gives them', () => {
  const t = termsDocument(EV).text;
  assert.match(t, /Assistance dogs\. We always accept a booking from a disabled passenger who travels with an assistance dog, and we never charge extra/);
  assert.match(t, /you agree that if we confirm your booking you are obliged to pay the price shown and any charge due under section 5/);
  assert.match(t, /unless it was caused by our failure to take reasonable care\. Please insure valuable items/);
  assert.match(t, /Losses that were not reasonably foreseeable when you booked/);
  assert.doesNotMatch(t, /Any indirect, consequential or economic loss arising from use of our service/, 'no blanket exclusion for consumers');
  assert.match(t, /Business customers only: we are not liable for loss of profit, loss of business or any other indirect or consequential loss/);
  assert.match(t, /Nothing in these terms limits our liability for death, personal injury caused by our negligence/);
  assert.match(t, /reasonable cost of repair or professional valeting/);
  assert.match(t, /Normal wear and tear is not charged, and this does not apply to an assistance dog/);
  assert.match(t, /We add no fee for paying by card/);
  assert.match(t, /If we cancel for a reason within our control, or fail to turn up, we refund in full/);
  assert.match(t, /A later version applies to your booking only if you agree to it/);
});

test('privacy: carries what the ICO says a privacy notice must contain', () => {
  const t = privacyDocument(EV).text;
  assert.match(t, /Your right to object\. You can object at any time/);
  assert.match(t, /Withdrawing consent\. Where we rely on your consent/);
  assert.match(t, /without undue delay and within one month/);
  assert.doesNotMatch(t, /within 30 days\.\s*$/m);
  assert.match(t, /Complaints to us\.[^\n]*acknowledge your complaint within 30 days and tell you the outcome without undue delay/);
  assert.match(t, /Information Commissioner's Office \(ICO\)/);
  assert.match(t, /You do not have to give us your information, but we cannot arrange a booking without/);
  assert.match(t, /do not use automated decision-making or profiling/);
  assert.match(t, /enquiries, quote requests and messages, only for as long as we need it/);
  assert.match(t, /keep booking and invoice records for six years/);
  assert.match(t, /contact us for details of the safeguards/);
  assert.doesNotMatch(t, /constitutes acceptance/, 'a privacy notice is not something people agree to');
});

test('the ICO data protection fee is flagged, not guessed', () => {
  const doc = privacyDocument(EV);
  assert.equal(doc.ready, true);
  assert.equal(doc.advice.length, 1);
  assert.match(doc.advice[0].label, /ICO data protection fee/);
  const withNumber = privacyDocument({ ...EV, brand: { ...EV.brand, legal: { ...EV.brand.legal, ico_registration: 'ZA123456' } } });
  assert.equal(withNumber.advice.length, 0);
  assert.match(withNumber.text, /ICO registration number: ZA123456/);
  const exempt = privacyDocument({ ...EV, brand: { ...EV.brand, legal: { ...EV.brand.legal, ico_registration: 'exempt' } } });
  assert.equal(exempt.advice.length, 0);
  assert.doesNotMatch(exempt.text, /ICO registration number/);
});

test('the booking form makes the obligation to pay clear before the request is sent', () => {
  const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
  assert.match(html, /I understand that if my booking is confirmed I must pay the price and any cancellation charge/);
  assert.match(html, /id="bwOrderLine"/);
  assert.match(html, /Request Transfer &middot; I Agree to Pay if Confirmed/);
  assert.ok(html.indexOf('id="bwOrderLine"') < html.indexOf('id="bwSubmit"'), 'the total price line sits directly before the button');
});

test('insurance and DBS statements appear only once the operator has confirmed them', () => {
  const bare = { ...COASTAL, brand: { ...COASTAL.brand, legal: { ...COASTAL.brand.legal, insurance_confirmed: false } } };
  const t = termsDocument(bare);
  assert.ok(t.gaps.some((g) => g.key === 'insurance'), 'the confirmation is listed as missing');
  assert.equal(t.ready, false);
  assert.match(t.text, /We are fully licensed, \[insurance confirmation to be added\] and \[DBS confirmation to be added\]/);
  assert.match(t.html, /legal-gap/);
  const ok = termsDocument(COASTAL);
  assert.match(ok.text, /We are fully licensed, insured and enhanced DBS checked/);
  assert.doesNotMatch(ok.text, /to be added\]\s*and/);
});

test('the operator responsibilities confirmation is listed until given, and a named provider is not a party to the booking', () => {
  const unconfirmed = { ...EV_RECORD };
  assert.ok(termsDocument(unconfirmed).gaps.some((g) => g.key === 'responsibilities'));
  assert.ok(!termsDocument(EV).gaps.some((g) => g.key === 'responsibilities'));
  const named = { ...EV, brand: { ...EV.brand, legal: { ...EV.brand.legal, platform_provider: 'Example Software Ltd' } } };
  const t = termsDocument(named);
  assert.equal(t.sections.length, termsDocument(EV).sections.length + 1);
  assert.match(t.text, /Example Software Ltd is not a party to your booking/);
  assert.match(t.text, /not responsible for your journey, our drivers or vehicles, our licences or our insurance/);
});
