'use strict';

// Terms & Conditions and Privacy Policy for one business, built from its row in
// public.tenants (name, contact details, licence, brand.legal).
//
//   const { termsDocument, privacyDocument } = require('./lib/legal');
//   const doc = termsDocument(tenantRow, { date: '12/11/2026' });
//   doc.html   // numbered content cards, ready to drop into a page
//   doc.gaps   // details the business still has to fill in
//   doc.ready  // true when nothing required is missing
//
// DRAFT FOR REVIEW: see docs/legal/template-review.md before publishing.

const { legalDetails, legalGaps, legalAdvice, POLICY_DEFAULTS } = require('./details');
const { termsSections, glance } = require('./terms');
const { privacySections, PLATFORM_PROCESSORS } = require('./privacy');
const { renderSections, sectionsText, esc } = require('./render');

const TERMS_TEMPLATE_VERSION = '1';
const PRIVACY_TEMPLATE_VERSION = '1';

function build(kind, tenant, opts = {}) {
  const d = legalDetails(tenant);
  const sections = kind === 'terms' ? termsSections(d) : privacySections(d);
  const gaps = legalGaps(d).filter((g) => g.for === 'both' || g.for === kind);
  return {
    kind,
    version: kind === 'terms' ? TERMS_TEMPLATE_VERSION : PRIVACY_TEMPLATE_VERSION,
    date: opts.date || '',
    details: d,
    sections,
    glance: kind === 'terms' ? glance(d) : '',
    gaps,
    advice: legalAdvice(d),
    ready: gaps.length === 0,
    html: renderSections(sections, kind === 'terms' ? { 4: 'cancellation', 5: 'cancellation-charges' } : {}),
    text: sectionsText(sections),
  };
}

const termsDocument = (tenant, opts) => build('terms', tenant, opts);
const privacyDocument = (tenant, opts) => build('privacy', tenant, opts);

module.exports = { termsDocument, privacyDocument, legalDetails, legalGaps, legalAdvice, POLICY_DEFAULTS, PLATFORM_PROCESSORS, esc };
