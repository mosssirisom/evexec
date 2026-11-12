'use strict';

// Rebuilds EV Exec's published terms (terms.html) and privacy policy
// (privacy.html) from the legal templates and EV Exec's own details
// (scripts/legal/ev-exec-tenant.js), so the pages and the templates can never
// drift apart. Run: npm run build:legal
//
// Only the numbered section cards, the version/date line and the "at a glance"
// box are replaced; the rest of each page is untouched. Changing the wording of
// the terms is a new version: archive the current page as terms-vN.html first
// and bump TERMS_VERSION in lib/cancellation.js (see docs/legal/audit-2026-11-12.md).

const fs = require('node:fs');
const path = require('node:path');
const { termsDocument, privacyDocument } = require('../../lib/legal');
const EV = require('./ev-exec-tenant');
const { renderSections } = require('../../lib/legal/render');

const ROOT = path.join(__dirname, '..', '..');
const TERMS_VERSION_LABEL = '4';
const TERMS_EFFECTIVE = '12/11/2026';
const PRIVACY_UPDATED = '12/11/2026';

const PREVIOUS = `Previous versions: <a class="gold" href="/terms-v3">Version 3</a> (bookings accepted from 16/10/2026 until version 4 took effect on ${TERMS_EFFECTIVE}), <a class="gold" href="/terms-v2">Version 2</a> (bookings accepted on 16/10/2026 before version 3) and <a class="gold" href="/terms-v1">Version 1</a> (bookings made before 16/10/2026).`;

function replaceCards(html, startMarker, sections, ids, tail, comment) {
  // Start at the first numbered card, and take the build comment above it with it,
  // so the build can run again on its own output.
  let start = html.indexOf('<div class="content-card"');
  if (start < 0) throw new Error(`no section cards found (${startMarker})`);
  const before = html.slice(0, start);
  const comment_ = before.match(/<!-- (?:Terms|Privacy policy): built from lib\/legal[^]*?-->\n$/);
  if (comment_) start -= comment_[0].length;
  const lastCard = html.lastIndexOf('<div class="content-card"');
  const cards = renderSections(sections, ids);
  return html.slice(0, start) + `<!-- ${comment} -->\n` + cards.replace(/\n<\/div>$/, tail ? `\n${tail}\n</div>` : '\n</div>') + '\n\n' + html.slice(lastCard);
}

// Terms
{
  const doc = termsDocument(EV);
  if (!doc.ready) throw new Error(`EV Exec's details are incomplete: ${JSON.stringify(doc.gaps)}`);
  const file = path.join(ROOT, 'terms.html');
  let html = fs.readFileSync(file, 'utf8');
  html = html.replace(/Version \d+ &middot; effective \d\d\/\d\d\/\d{4} &middot;/, `Version ${TERMS_VERSION_LABEL} &middot; effective ${TERMS_EFFECTIVE} &middot;`);
  html = html.replace(/(<p class="section-label">Cancellations at a glance<\/p>\s*<p class="text-white\/75 text-sm leading-relaxed">)[\s\S]*?( <a class="gold" href="#cancellation-charges">)/, `$1${doc.glance}$2`);
  html = replaceCards(html, '<!-- About EV Exec -->', doc.sections, { 4: 'cancellation', 5: 'cancellation-charges' }, `  <p id="previous-versions">${PREVIOUS}</p>`,
    'Terms: built from lib/legal by scripts/legal/build.js (npm run build:legal). Do not edit the numbered cards by hand.');
  fs.writeFileSync(file, html);
}

// Privacy
{
  const doc = privacyDocument(EV);
  if (!doc.ready) throw new Error(`EV Exec's details are incomplete: ${JSON.stringify(doc.gaps)}`);
  const file = path.join(ROOT, 'privacy.html');
  let html = fs.readFileSync(file, 'utf8');
  html = html.replace(/Last updated: \d\d\/\d\d\/\d{4}/, `Last updated: ${PRIVACY_UPDATED}`);
  html = replaceCards(html, '<!-- Who We Are -->', doc.sections, {}, '',
    'Privacy policy: built from lib/legal by scripts/legal/build.js (npm run build:legal). Do not edit the numbered cards by hand.');
  fs.writeFileSync(file, html);
}

console.log('terms.html and privacy.html rebuilt');
