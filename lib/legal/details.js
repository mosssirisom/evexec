'use strict';

// The details the terms and privacy templates are filled from.
//
// They come from the business's own row in public.tenants:
//   name, contact_email, contact_phone, brand.licence, pricing.extra_stop
// and from `brand.legal`, a JSON object the business fills in under Settings:
//   legal_name, status ("sole trader" | "limited company" | "partnership"),
//   company_number, registered_address, base ("Blackpool, Lancashire"),
//   area ("Blackpool and the Fylde Coast"), service ("premium airport transfers and private hire"),
//   licensing_authority, jurisdiction ("england-wales" | "scotland" | "northern-ireland"),
//   fleet (a phrase, e.g. "a fleet of electric vehicles (currently a Tesla Model Y)"),
//   max_passengers, luggage, price_includes (list), points_name, ico_registration,
//   platform_provider, and policy numbers (see POLICY_DEFAULTS).
// Nothing is filled in from another business. A required detail that is missing
// is reported by legalGaps() and shows as a visible placeholder in the draft.

const POLICY_DEFAULTS = Object.freeze({
  // Charge (% of the journey price) by notice before pickup, standard bookings.
  standard: Object.freeze([{ hours: 48, pct: 0 }, { hours: 24, pct: 25 }, { hours: 2, pct: 50 }]),
  // The same for quoted bookings (hours).
  quoted: Object.freeze([{ hours: 168, pct: 0 }, { hours: 72, pct: 25 }, { hours: 24, pct: 50 }]),
  quotedOver: 300,        // £: a journey quoted above this is a quoted booking
  quotedHoldHours: 4,     // a car held this long or more is a quoted booking
  freeChanges: 2,
  changeFee: 10,          // £ per change after the free ones
  moveMonths: 12,
  waitAddress: 15,        // minutes of free waiting at an address
  waitAirport: 60,        // minutes of free waiting after an airport landing
  noShowGrace: 10,        // minutes after contact attempts before a no-show
  delayHours: 3,          // inbound delay that lets the customer change or cancel
  outboundNoticeHours: 6, // notice for an airline reschedule of an outbound flight
  invoiceDays: 14,
  refundDays: 14,
});

const STATUSES = ['sole trader', 'limited company', 'partnership'];
const JURISDICTIONS = ['england-wales', 'scotland', 'northern-ireland'];

const clean = (v) => (typeof v === 'string' ? v.trim() : '');
const num = (v, fallback, { min = 0, max = 1e6 } = {}) => {
  const n = typeof v === 'number' ? v : parseFloat(v);
  return Number.isFinite(n) && n >= min && n <= max ? n : fallback;
};
const bands = (v, fallback) => {
  if (!Array.isArray(v) || v.length !== fallback.length) return fallback;
  const out = v.map((b) => ({ hours: num(b && b.hours, NaN, { min: 1, max: 24 * 60 }), pct: num(b && b.pct, NaN, { min: 0, max: 100 }) }));
  const ordered = out.every((b, i) => Number.isFinite(b.hours) && Number.isFinite(b.pct) && (i === 0 || (b.hours < out[i - 1].hours && b.pct > out[i - 1].pct)));
  return ordered && out[0].pct === 0 ? out : fallback;
};

function displayPhone(raw) {
  const s = clean(raw);
  const digits = s.replace(/[\s()-]/g, '');
  const national = digits.startsWith('+44') ? `0${digits.slice(3)}` : digits.startsWith('0044') ? `0${digits.slice(4)}` : digits;
  return /^07\d{9}$/.test(national) ? `${national.slice(0, 5)} ${national.slice(5)}` : s;
}
const telDigits = (raw) => {
  const d = clean(raw).replace(/[\s()-]/g, '');
  return d.startsWith('+') ? d.slice(1) : d.startsWith('0044') ? d.slice(2) : /^0\d{9,10}$/.test(d) ? `44${d.slice(1)}` : '';
};

/** Everything the templates read, from a tenants row. */
function legalDetails(tenant) {
  const t = tenant || {};
  const brand = t.brand && typeof t.brand === 'object' ? t.brand : {};
  const l = brand.legal && typeof brand.legal === 'object' ? brand.legal : {};
  const pol = l.policy && typeof l.policy === 'object' ? l.policy : {};
  const jurisdiction = JURISDICTIONS.includes(l.jurisdiction) ? l.jurisdiction : 'england-wales';
  const status = STATUSES.includes(l.status) ? l.status : '';
  const phone = displayPhone(t.contact_phone);
  const pricing = t.pricing && typeof t.pricing === 'object' ? t.pricing : {};
  return Object.freeze({
    name: clean(t.name),
    legalName: clean(l.legal_name),
    status,
    companyNumber: clean(l.company_number),
    registeredAddress: clean(l.registered_address),
    base: clean(l.base),
    area: clean(l.area),
    service: clean(l.service) || 'private hire',
    licence: clean(brand.licence),
    licensingAuthority: clean(l.licensing_authority),
    email: clean(t.contact_email),
    phone,
    phoneTel: telDigits(t.contact_phone),
    jurisdiction,
    fleet: clean(l.fleet) || 'a fleet of vehicles',
    maxPassengers: num(l.max_passengers, 4, { min: 1, max: 16 }),
    luggage: clean(l.luggage) || 'typically up to 4 medium to large suitcases alongside cabin bags, depending on passenger numbers',
    priceIncludes: Array.isArray(l.price_includes) && l.price_includes.length ? l.price_includes.map(clean).filter(Boolean) : null,
    pointsName: clean(l.points_name),
    // The operator confirms this itself (Settings, Legal). Insurance and DBS checks are the operator's responsibility.
    insuranceConfirmed: l.insurance_confirmed === true,
    icoRegistration: clean(l.ico_registration),
    platformProvider: clean(l.platform_provider),
    policy: Object.freeze({
      standard: bands(pol.standard, POLICY_DEFAULTS.standard),
      quoted: bands(pol.quoted, POLICY_DEFAULTS.quoted),
      quotedOver: num(pol.quoted_over, POLICY_DEFAULTS.quotedOver),
      quotedHoldHours: num(pol.quoted_hold_hours, POLICY_DEFAULTS.quotedHoldHours, { min: 1 }),
      freeChanges: num(pol.free_changes, POLICY_DEFAULTS.freeChanges, { max: 20 }),
      changeFee: num(pol.change_fee, POLICY_DEFAULTS.changeFee, { max: 500 }),
      extraStop: num(pricing.extra_stop, 5, { max: 500 }),
      moveMonths: num(pol.move_months, POLICY_DEFAULTS.moveMonths, { min: 1, max: 36 }),
      waitAddress: num(pol.wait_address, POLICY_DEFAULTS.waitAddress, { max: 240 }),
      waitAirport: num(pol.wait_airport, POLICY_DEFAULTS.waitAirport, { max: 480 }),
      noShowGrace: num(pol.no_show_grace, POLICY_DEFAULTS.noShowGrace, { max: 120 }),
      delayHours: num(pol.delay_hours, POLICY_DEFAULTS.delayHours, { min: 1, max: 48 }),
      outboundNoticeHours: num(pol.outbound_notice_hours, POLICY_DEFAULTS.outboundNoticeHours, { min: 1, max: 72 }),
      invoiceDays: num(pol.invoice_days, POLICY_DEFAULTS.invoiceDays, { min: 1, max: 90 }),
      refundDays: num(pol.refund_days, POLICY_DEFAULTS.refundDays, { min: 1, max: 60 }),
    }),
  });
}

/**
 * What is still missing before these documents can be published, as
 * [{ key, label, for }]. A business must fill these in; the templates never
 * guess them.
 */
function legalGaps(d) {
  const gaps = [];
  const need = (key, label, value, forDoc) => { if (!value) gaps.push({ key, label, for: forDoc }); };
  need('name', 'Business name', d.name, 'both');
  need('status', 'Trading status (sole trader, limited company or partnership)', d.status, 'both');
  if (d.status === 'limited company') {
    need('company_number', 'Company number', d.companyNumber, 'both');
    need('registered_address', 'Registered office address', d.registeredAddress, 'both');
  }
  need('licence', 'Private hire operator licence number', d.licence, 'terms');
  need('email', 'Contact email', d.email, 'both');
  need('phone', 'Contact phone', d.phone, 'both');
  need('base', 'Where you are based (town and county)', d.base, 'privacy');
  if (!d.insuranceConfirmed) gaps.push({ key: 'insurance', label: 'Confirm you hold hire & reward and public liability insurance, and that your drivers are DBS checked (you are responsible for this)', for: 'terms' });
  need('area', 'The area you serve', d.area, 'terms');
  return gaps;
}

/**
 * Things a business should do or check that do not stop the documents being
 * published: [{ key, label }].
 */
function legalAdvice(d) {
  const advice = [];
  if (!d.icoRegistration) {
    advice.push({
      key: 'ico_registration',
      label: 'ICO data protection fee: a business that keeps customers\u2019 booking and contact details normally has to pay it (tier 1 is \u00a352 a year, \u00a347 by direct debit, for a small business), unless every use of personal data is exempt. Enter your ICO registration number, or "exempt" if the ICO\u2019s self-assessment says you are exempt (ico.org.uk/for-organisations/data-protection-fee).',
    });
  }
  return advice;
}

module.exports = { legalDetails, legalGaps, legalAdvice, POLICY_DEFAULTS, STATUSES, JURISDICTIONS };
