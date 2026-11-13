'use strict';

// Writes one route per business domain into vercel.json, so a business's own domain is served by
// lib/tenantSite.js (its home page and booking page). Only the domains listed in
// config/tenant-domains.json get a route, so EV Exec's own pages can never be affected: with an
// empty list nothing changes. Safe to run again: it replaces its own routes (those that point at
// /api/booking/index.js?r=site) and leaves every other route as it is.
//
//   npm run build:domains          write vercel.json
//   npm run build:domains -- --check   exit 1 if vercel.json is out of date (for CI)

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const DOMAIN = /^([a-z0-9]([a-z0-9-]*[a-z0-9])?\.)+[a-z]{2,}$/;
const OWN = /^(www\.)?evexec\.co\.uk$/;
const MARK = 'r=site&p=';

function tidy(d) { return String(d || '').trim().toLowerCase().replace(/^https?:\/\//, '').replace(/^www\./, '').replace(/\/+$/, ''); }

function validate(list) {
  const seen = new Set();
  const out = [];
  for (const raw of list) {
    const d = tidy(raw);
    if (!DOMAIN.test(d)) throw new Error(`"${raw}" is not a domain like example.co.uk`);
    if (OWN.test(d) || d.endsWith('.vercel.app')) throw new Error(`"${raw}" is this website's own domain; it cannot be a business domain`);
    if (seen.has(d)) throw new Error(`"${raw}" is listed twice`);
    seen.add(d);
    out.push(d);
  }
  return out;
}

const escapeRe = (d) => d.replace(/\./g, '\\\\.');
const routeFor = (d) => `    { "src": "/((?!api/|public/|t/).*)", "has": [{"type": "host", "value": "^(www\\\\.)?${escapeRe(d)}$"}], "dest": "/api/booking/index.js?${MARK}$1" },`;

/** The vercel.json text with this list's routes in place of any earlier ones. */
function apply(text, domains) {
  const lines = text.split('\n').filter((l) => !l.includes(MARK));
  const anchor = lines.findIndex((l) => l.includes('"X-Robots-Tag": "noindex"') && l.includes('evexec.vercel.app'));
  if (anchor < 0) throw new Error('vercel.json: could not find where to put the routes');
  lines.splice(anchor + 1, 0, ...domains.map(routeFor));
  const next = lines.join('\n');
  JSON.parse(next); // must stay valid
  return next;
}

function main() {
  const cfg = JSON.parse(fs.readFileSync(path.join(ROOT, 'config', 'tenant-domains.json'), 'utf8'));
  const domains = validate(Array.isArray(cfg.domains) ? cfg.domains : []);
  const file = path.join(ROOT, 'vercel.json');
  const before = fs.readFileSync(file, 'utf8');
  const after = apply(before, domains);
  if (process.argv.includes('--check')) {
    if (before !== after) { console.error('vercel.json is out of date. Run: npm run build:domains'); process.exit(1); }
    console.log(`vercel.json is up to date (${domains.length} business domain${domains.length === 1 ? '' : 's'}).`);
    return;
  }
  if (before !== after) fs.writeFileSync(file, after);
  console.log(`${domains.length} business domain${domains.length === 1 ? '' : 's'} written to vercel.json.`);
}

if (require.main === module) main();
module.exports = { validate, apply, routeFor, tidy };
