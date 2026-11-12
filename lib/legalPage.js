'use strict';

// Public terms and privacy page for any business: /t/<short name>/terms and
// /t/<short name>/privacy. Built from the business's own row in public.tenants
// by lib/legal, so nothing of another business's is ever shown. A page is shown
// only when that business's legal details are complete and it has confirmed the
// operator responsibilities statement; until then the page says so.
// The software provider is not a party to the business's bookings (see the
// "Our Booking System" section when the business names its provider).

const { termsDocument, privacyDocument, esc } = require('./legal');
const { tenantId } = require('./brand');

const SLUG = /^[a-z0-9][a-z0-9-]{0,39}$/;
const HEX = /^#[0-9a-fA-F]{6}$/;
const SUPABASE_URL = () => process.env.SUPABASE_URL || 'https://yoltkmhtxwluqxxpewbl.supabase.co';

async function loadTenant(slug) {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!key) return null;
  const res = await fetch(`${SUPABASE_URL()}/rest/v1/tenants?slug=eq.${encodeURIComponent(slug)}&status=eq.active&select=id,slug,name,contact_email,contact_phone,brand,pricing,updated_at&limit=1`, {
    headers: { apikey: key, Authorization: `Bearer ${key}` },
  });
  if (!res.ok) return null;
  const rows = await res.json();
  return Array.isArray(rows) && rows[0] ? rows[0] : null;
}

const ukDate = (iso) => {
  const d = new Date(iso || Date.now());
  const parts = new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/London', day: '2-digit', month: '2-digit', year: 'numeric' }).formatToParts(d);
  const get = (t) => parts.find((p) => p.type === t).value;
  return `${get('day')}/${get('month')}/${get('year')}`;
};

const CSS = `
*{box-sizing:border-box}body{margin:0;font-family:Jost,system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;background:#f4f6fa;color:#0f1b33;line-height:1.6}
header{background:var(--primary);color:#fff;padding:20px 16px}header .in,main{max-width:820px;margin:0 auto}
header h1{margin:0;font-size:1.25rem;letter-spacing:.04em}header p{margin:4px 0 0;opacity:.8;font-size:.9rem}
main{padding:20px 16px 48px}.nav{margin:0 0 16px;font-size:.9rem}.nav a{color:var(--accent-text);margin-right:16px}
.content-card{background:#fff;border:1px solid #dde3ee;border-radius:12px;padding:20px;margin:0 0 16px}
.section-label{margin:0 0 4px;font-size:.75rem;letter-spacing:.14em;color:#6b7a93}
h2{margin:0 0 10px;font-size:1.15rem}p{margin:0 0 10px}ul{margin:8px 0 10px;padding-left:20px}li{margin:4px 0}
a{color:#0f4fa8}.policy-table-wrap{overflow-x:auto}.policy-table{border-collapse:collapse;width:100%;font-size:.92rem}
.policy-table th,.policy-table td{border:1px solid #dde3ee;padding:8px;text-align:left;vertical-align:top}
.legal-gap{background:#fff3cd;padding:0 4px;border-radius:3px}.note{background:#fff;border:1px solid #dde3ee;border-radius:12px;padding:20px}
footer{max-width:820px;margin:0 auto;padding:0 16px 32px;font-size:.8rem;color:#6b7a93}`;

function shell({ title, name, primary, accent, body, updated }) {
  const accentText = accent;
  return `<!doctype html><html lang="en-GB"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex"><title>${esc(title)}</title>
<style>:root{--primary:${primary};--accent:${accent};--accent-text:${accentText}}${CSS}</style></head><body>
<header><div class="in"><h1>${esc(name)}</h1><p>${esc(title)}${updated ? ` &middot; Last updated ${esc(updated)}` : ''}</p></div></header>
<main>${body}</main>
<footer>This page is published by ${esc(name)}. ${esc(name)} is responsible for its own terms and for the service it provides.</footer></body></html>`;
}

function send(res, status, html) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.setHeader('Cache-Control', 'public, max-age=60, s-maxage=60');
  res.setHeader('X-Robots-Tag', 'noindex');
  return res.end(html);
}

/** Builds the page for a tenant row. Pure: no network. */
function pageFor(tenant, kind) {
  const brand = tenant.brand && typeof tenant.brand === 'object' ? tenant.brand : {};
  const colors = brand.colors && typeof brand.colors === 'object' ? brand.colors : {};
  const primary = HEX.test(colors.primary || '') ? colors.primary : '#0B132B';
  const accent = HEX.test(colors.accent || '') ? colors.accent : '#D7A23F';
  const title = kind === 'terms' ? 'Terms and Conditions' : 'Privacy Policy';
  const doc = kind === 'terms' ? termsDocument(tenant) : privacyDocument(tenant);
  const updated = ukDate(tenant.updated_at);
  if (!doc.ready) {
    return { status: 404, html: shell({ title, name: tenant.name || 'This business', primary, accent, updated: '', body: `<div class="note"><p>${esc(tenant.name || 'This business')} has not published its ${esc(title.toLowerCase())} here yet. Please contact the business directly.</p></div>` }) };
  }
  const other = kind === 'terms' ? 'privacy' : 'terms';
  const nav = `<p class="nav"><a href="/t/${esc(tenant.slug)}/${other}">${other === 'terms' ? 'Terms and Conditions' : 'Privacy Policy'}</a></p>`;
  return { status: 200, html: shell({ title, name: tenant.name, primary, accent, updated, body: nav + doc.html }) };
}

async function handle(req, res) {
  if (req.method !== 'GET' && req.method !== 'HEAD') { res.statusCode = 405; return res.end('Method not allowed'); }
  const q = req.query || {};
  const slug = String(q.b || '').toLowerCase();
  const kind = q.kind === 'privacy' ? 'privacy' : q.kind === 'terms' ? 'terms' : '';
  if (!SLUG.test(slug) || !kind) return send(res, 404, shell({ title: 'Not found', name: 'Not found', primary: '#0B132B', accent: '#D7A23F', body: '<div class="note"><p>This page does not exist.</p></div>' }));
  let tenant = null;
  try { tenant = await loadTenant(slug); } catch (e) { console.error('legal page load failed:', e.message || e); }
  if (!tenant) return send(res, 404, shell({ title: 'Not found', name: 'Not found', primary: '#0B132B', accent: '#D7A23F', body: '<div class="note"><p>This page does not exist.</p></div>' }));
  // This website's own business has its own published pages: send people there.
  if (tenant.id === tenantId()) {
    res.statusCode = 302;
    res.setHeader('Location', `/${kind}`);
    return res.end();
  }
  const out = pageFor(tenant, kind);
  return send(res, out.status, out.html);
}

module.exports = { handle, pageFor, loadTenant };
