'use strict';

// Whose emails these are: the business name, phone, licence, website and
// colours shown in an email's header, help line and footer.
//
// The details come from the business's own row in public.tenants:
//   name, contact_email, contact_phone, and in its brand column
//   { licence, site_url, tagline, colors: { primary, accent } }.
// EV Exec (this website's own business) also has built-in defaults for anything
// its row does not hold, so its emails never change. Any OTHER business starts
// from nothing: it never inherits EV Exec's name, number or licence, and a
// detail it has not set is simply left out.
//
// Like prices (lib/pricing.js), the rows are loaded at most once a minute per
// server instance: `await refreshBrands()` before building emails, then the
// builders in lib/emailContent.js pick the right business from the booking's
// tenant_id. If the load fails, the last good copy (or the defaults) is used.

const DEFAULT_TENANT_ID = () => process.env.TENANT_ID || '00000000-0000-0000-0000-000000000001';

const EV_EXEC = Object.freeze({
  name: 'EV Exec',
  wordmark: 'EV EXEC',
  phone: '07721 070370',
  email: 'book@evexec.co.uk',
  licence: 'PHO0079',
  site: 'https://www.evexec.co.uk',
  tagline: 'Premium airport transfers from Blackpool & the Fylde Coast',
  primary: null,
  accent: null,
});

const NONE = Object.freeze({ name: '', wordmark: '', phone: '', email: '', licence: '', site: '', tagline: '', primary: null, accent: null });

const HEX = /^#[0-9a-f]{6}$/i;
const clean = (v) => (typeof v === 'string' ? v.trim() : '');

// "07721070370" and "+44 7721 070370" both read "07721 070370"; anything else
// (a landline, an overseas number) is shown as it was typed.
function displayPhone(raw) {
  const s = clean(raw);
  if (!s) return '';
  const digits = s.replace(/[\s()-]/g, '');
  const national = digits.startsWith('+44') ? `0${digits.slice(3)}` : digits.startsWith('0044') ? `0${digits.slice(4)}` : digits;
  if (/^07\d{9}$/.test(national)) return `${national.slice(0, 5)} ${national.slice(5)}`;
  return s;
}

// The number for a tel: link ("+447721070370"), or '' if it is not a UK number.
function telNumber(raw) {
  const digits = clean(raw).replace(/[\s()-]/g, '');
  if (digits.startsWith('+')) return digits;
  if (digits.startsWith('0044')) return `+${digits.slice(2)}`;
  if (/^0\d{9,10}$/.test(digits)) return `+44${digits.slice(1)}`;
  return '';
}

// An operator's own standard cancellation bands (brand.legal.policy.standard):
// three bands, stricter each time, first 0 percent. Anything else is ignored
// and the standard bands are used. Checked again in the database on save.
function standardPolicy(policy) {
  const s = policy && Array.isArray(policy.standard) ? policy.standard : null;
  if (!s || s.length !== 3) return null;
  const ok = s.every((b) => b && Number.isFinite(b.hours) && Number.isFinite(b.pct) && b.hours >= 1 && b.hours <= 336 && b.pct >= 0 && b.pct <= 100);
  if (!ok || s[0].pct !== 0) return null;
  const stricter = s[1].hours < s[0].hours && s[2].hours < s[1].hours && s[1].pct > s[0].pct && s[2].pct > s[1].pct;
  return stricter ? s.map((b) => ({ hours: b.hours, pct: b.pct })) : null;
}

function fromRow(row) {
  const isDefault = row && row.id === DEFAULT_TENANT_ID();
  const base = isDefault ? EV_EXEC : NONE;
  const b = (row && row.brand && typeof row.brand === 'object') ? row.brand : {};
  const colors = (b.colors && typeof b.colors === 'object') ? b.colors : {};
  const name = clean(row && row.name) || base.name;
  const site = clean(b.site_url).replace(/\/$/, '');
  return Object.freeze({
    name,
    wordmark: name.toUpperCase(),
    phone: displayPhone(row && row.contact_phone) || base.phone,
    email: clean(row && row.contact_email) || base.email,
    licence: clean(b.licence) || base.licence,
    site: /^https?:\/\//i.test(site) ? site : base.site,
    tagline: clean(b.tagline) || base.tagline,
    primary: HEX.test(clean(colors.primary)) ? clean(colors.primary) : null,
    accent: HEX.test(clean(colors.accent)) ? clean(colors.accent) : null,
    policy: standardPolicy(b.legal && typeof b.legal === 'object' ? b.legal.policy : null),
  });
}

let cache = new Map();   // tenant id -> brand
let prefixes = new Map(); // tenant id -> booking-reference prefix ("EVX")
let loadedAt = 0;
let inflight = null;
const TTL_MS = 60 * 1000;

async function refreshBrands({ force = false } = {}) {
  if (!force && Date.now() - loadedAt < TTL_MS) return;
  if (inflight) return inflight;
  const url = process.env.SUPABASE_URL || 'https://yoltkmhtxwluqxxpewbl.supabase.co';
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!key) return;
  inflight = (async () => {
    try {
      const headers = { apikey: key, Authorization: `Bearer ${key}` };
      const cols = 'id,name,contact_email,contact_phone,brand';
      let res = await fetch(`${url}/rest/v1/tenants?select=${cols},ref_prefix`, { headers });
      // Before the ref_prefix column exists the request is refused: load the rest as before.
      if (!res.ok) res = await fetch(`${url}/rest/v1/tenants?select=${cols}`, { headers });
      if (!res.ok) return;
      const rows = await res.json();
      if (!Array.isArray(rows)) return;
      cache = new Map(rows.map((r) => [r.id, fromRow(r)]));
      prefixes = new Map(rows.filter((r) => /^[A-Z]{2,5}$/.test(r.ref_prefix || '')).map((r) => [r.id, r.ref_prefix]));
      loadedAt = Date.now();
    } catch (_) { /* keep the last good copy */ } finally { inflight = null; }
  })();
  return inflight;
}

// The brand for a tenant id. No id means this website's own business. A
// business not loaded (yet) gets NONE rather than EV Exec's details.
function brandFor(tenantId) {
  const id = tenantId || DEFAULT_TENANT_ID();
  if (cache.has(id)) return cache.get(id);
  return id === DEFAULT_TENANT_ID() ? EV_EXEC : NONE;
}

// The booking-reference prefix for a business ("EVX" for EV Exec). A business
// whose row is not loaded (yet) gets "EVX", which is still a valid reference.
function refPrefix(tenantId) {
  return prefixes.get(tenantId || DEFAULT_TENANT_ID()) || 'EVX';
}

// Builders are synchronous, so the business of the email being built can be
// held for the duration of the call: lib/emailContent.js wraps each builder in
// this, using the tenant_id of its first argument (the booking or quote).
let current = null;
function withBrandOf(fn) {
  return function branded(...args) {
    const first = args[0];
    const previous = current;
    current = brandFor(first && typeof first === 'object' ? first.tenant_id : undefined);
    try { return fn.apply(this, args); } finally { current = previous; }
  };
}
const currentBrand = () => current || brandFor(undefined);

function _setBrands(map) {
  cache = new Map(Object.entries(map || {}).map(([id, row]) => [id, fromRow({ id, ...row })]));
  prefixes = new Map(Object.entries(map || {}).filter(([, row]) => row && row.ref_prefix).map(([id, row]) => [id, row.ref_prefix]));
  loadedAt = Date.now();
}

// Website address without the scheme ("www.evexec.co.uk"), or ''.
const siteDomain = (b) => String(b && b.site || '').replace(/^https?:\/\//i, '');
// The name followed by a space ("EV Exec "), or '' for a business with no name.
const named = (b) => (b && b.name ? `${b.name} ` : '');

// The business this website deployment belongs to when the visitor's domain is not one of any
// business's own (TENANT_ID, default EV Exec).
const tenantId = () => DEFAULT_TENANT_ID();

// "www.Example.co.uk:443" or "https://www.example.co.uk/x" -> "example.co.uk".
function hostOf(v) {
  const raw = clean(v);
  if (!raw) return '';
  try { return new URL(/^[a-z][a-z0-9+.-]*:\/\//i.test(raw) ? raw : `https://${raw}`).hostname.toLowerCase().replace(/^www\./, ''); }
  catch (_) { return ''; }
}

// The business a visitor's domain belongs to: the one whose own website address (brand.site_url)
// is that domain, ignoring "www." and the port. One deployment can serve many businesses this
// way, each on its own domain. A domain that matches none (a preview address, localhost) gets the
// deployment's own business (TENANT_ID, default EV Exec), so nothing is ever left without one.
function tenantIdFor(req) {
  const h = req && req.headers ? req.headers : {};
  const host = hostOf(String(h['x-forwarded-host'] || h.host || '').split(',')[0]);
  if (host) {
    for (const [id, b] of cache) if (b && b.site && hostOf(b.site) === host) return id;
  }
  return DEFAULT_TENANT_ID();
}

// Where a business's staff alerts go. This deployment's own business (EV Exec) keeps OPERATOR_EMAIL;
// any other business gets its own contact email, never EV Exec's. '' when there is none.
function staffEmailFor(tenantId) {
  const id = tenantId || DEFAULT_TENANT_ID();
  if (id === DEFAULT_TENANT_ID()) { const e = clean(process.env.OPERATOR_EMAIL); if (e) return e; }
  return clean(brandFor(id).email);
}

// The website address to put in a link for a business. EV Exec's own address can be overridden by
// SITE_URL (preview deployments); no other business's address ever is.
function siteFor(tenantId) {
  const s = brandFor(tenantId).site;
  return (s === EV_EXEC.site && process.env.SITE_URL) ? process.env.SITE_URL.replace(/\/$/, '') : s;
}

module.exports = { tenantId, tenantIdFor, siteFor, staffEmailFor, hostOf, refPrefix, siteDomain, named, refreshBrands, brandFor, currentBrand, withBrandOf, fromRow, displayPhone, telNumber, EV_EXEC, NONE, _setBrands };
