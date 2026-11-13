'use strict';

// The public website for any business other than this deployment's own (EV Exec): its home page
// with a booking form, and the page where a customer sees their booking and pays. Served on the
// business's own domain (matched to brand.site_url, see tenantIdFor in lib/brand.js), and built
// only from that business's own row in public.tenants, so nothing of another business's is shown.
//
// The booking form and the booking page talk to the same endpoints EV Exec's website uses
// (/api/booking/config|create|get|lookup, /api/payment/*), which are already per business.
// Pure builders (homePage, bookingPage, notFoundPage) take a tenant row and do no network.

const { esc } = require('./legal');
const { hostOf } = require('./brand');
const { fromRow: pricingFromRow } = require('./pricing');
const { bandsFor, TERMS_VERSION } = require('./cancellation');
const legalPage = require('./legalPage');

const SUPABASE_URL = () => process.env.SUPABASE_URL || 'https://yoltkmhtxwluqxxpewbl.supabase.co';
const HEX = /^#[0-9a-fA-F]{6}$/;
const TTL_MS = 60 * 1000;

// ── loading ──────────────────────────────────────────────────────────────────
let rows = [];
let loadedAt = 0;
let inflight = null;

async function loadAll({ force = false } = {}) {
  if (!force && Date.now() - loadedAt < TTL_MS) return rows;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!key) return rows;
  if (!inflight) {
    inflight = fetch(`${SUPABASE_URL()}/rest/v1/tenants?status=eq.active&select=id,slug,name,contact_email,contact_phone,brand,pricing,updated_at`, {
      headers: { apikey: key, Authorization: `Bearer ${key}` },
    })
      .then(async (res) => { if (res.ok) { const d = await res.json(); if (Array.isArray(d)) rows = d; } })
      .catch((err) => { console.warn('[tenantSite] keeping the last list:', err.message); })
      .finally(() => { loadedAt = Date.now(); inflight = null; });
  }
  await inflight;
  return rows;
}

/** The active business whose own website address is this host (www, case and port ignored). */
function findByHost(host, list = rows) {
  const h = hostOf(host);
  if (!h) return null;
  return list.find((t) => t && t.brand && hostOf(t.brand.site_url) === h) || null;
}

function _setTenants(list) { rows = Array.isArray(list) ? list : []; loadedAt = list ? Date.now() : 0; }

// ── small helpers ────────────────────────────────────────────────────────────
const brandOf = (t) => (t && t.brand && typeof t.brand === 'object' ? t.brand : {});
const clean = (v) => (typeof v === 'string' ? v.trim() : '');

function colours(t) {
  const c = brandOf(t).colors && typeof brandOf(t).colors === 'object' ? brandOf(t).colors : {};
  return {
    primary: HEX.test(clean(c.primary)) ? clean(c.primary) : '#0B132B',
    accent: HEX.test(clean(c.accent)) ? clean(c.accent) : '#D7A23F',
  };
}

// Black or white, whichever reads better on this colour (WCAG relative luminance).
function inkOn(hex) {
  const n = parseInt(hex.slice(1), 16);
  const lin = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); };
  const L = 0.2126 * lin((n >> 16) & 255) + 0.7152 * lin((n >> 8) & 255) + 0.0722 * lin(n & 255);
  return L > 0.4 ? '#0B132B' : '#FFFFFF';
}

const logoUrl = (t) => { const u = clean(brandOf(t).logo_url); return /^https:\/\/[^\s"'<>]+$/i.test(u) ? u : ''; };

function phoneDisplay(raw) {
  const s = clean(raw);
  if (!s) return '';
  const d = s.replace(/[\s()-]/g, '');
  const national = d.startsWith('+44') ? `0${d.slice(3)}` : d.startsWith('0044') ? `0${d.slice(4)}` : d;
  return /^07\d{9}$/.test(national) ? `${national.slice(0, 5)} ${national.slice(5)}` : s;
}
const phoneTel = (raw) => {
  const d = clean(raw).replace(/[\s()-]/g, '');
  if (d.startsWith('+')) return d;
  if (d.startsWith('0044')) return `+${d.slice(2)}`;
  return /^0\d{9,10}$/.test(d) ? `+44${d.slice(1)}` : '';
};

// "Free more than 48 hours before pickup. 25% of the fare from 24 to 48 hours before, ..." built from the
// business's own bands (or the standard ones). Plain words, no markup.
function policyText(t) {
  const b = bandsFor({ tenant_id: t.id }, TERMS_VERSION);
  const h = (n) => `${n} hour${n === 1 ? '' : 's'}`;
  // Band i is charged when the booking is cancelled more than b[i].minHours and up to b[i-1].minHours before pickup;
  // exactly on a boundary takes the lower charge. The last band has no lower limit.
  const parts = [`Free to cancel more than ${h(b[0].minHours)} before pickup.`];
  for (let i = 1; i < b.length - 1; i++) parts.push(`${b[i].pct}% of the fare more than ${b[i].minHours} and up to ${h(b[i - 1].minHours)} before pickup.`);
  const last = b[b.length - 1];
  parts.push(`${last.pct === 100 ? 'The full fare' : `${last.pct}% of the fare`} ${h(b[b.length - 2].minHours)} or less before pickup, or if no one is at the pickup point.`);
  return parts.join(' ');
}

const termsReady = (t) => { try { return legalPage.pageFor(t, 'terms').status === 200; } catch (_) { return false; } };
const privacyReady = (t) => { try { return legalPage.pageFor(t, 'privacy').status === 200; } catch (_) { return false; } };

// JSON that is safe inside a <script> tag.
const scriptJson = (v) => JSON.stringify(v).replace(/</g, '\\u003c').replace(/>/g, '\\u003e').replace(/&/g, '\\u0026').replace(/\u2028/g, '\\u2028').replace(/\u2029/g, '\\u2029');

// ── styles ───────────────────────────────────────────────────────────────────
const CSS = `
*{box-sizing:border-box}html{-webkit-text-size-adjust:100%;scroll-behavior:smooth}
body{margin:0;font-family:Jost,system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;background:#f4f6fa;color:#0f1b33;line-height:1.55;font-size:16px}
a{color:inherit}img{max-width:100%}
.skip{position:absolute;left:-9999px;top:8px;background:#fff;color:#0f1b33;padding:8px 12px;border-radius:8px;z-index:20}.skip:focus{left:8px}
:focus-visible{outline:3px solid var(--a);outline-offset:2px}
.wrap{max-width:1040px;margin:0 auto;padding:0 16px}
.top{background:var(--p);color:#fff}
.bar{display:flex;align-items:center;justify-content:space-between;gap:12px;padding-top:12px;padding-bottom:12px}
.brand{display:flex;align-items:center;gap:10px;font-weight:600;font-size:1.15rem;text-decoration:none;min-width:0}
.brand img{height:40px;width:auto;max-width:150px;object-fit:contain}.brand span{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.call{display:inline-flex;align-items:center;min-height:44px;padding:0 14px;border:1px solid rgba(255,255,255,.45);border-radius:999px;text-decoration:none;font-weight:500;white-space:nowrap}
.hero{background:var(--p);color:#fff;padding:20px 0 76px}
.hero h1{margin:0 0 8px;font-size:clamp(1.7rem,5vw,2.6rem);line-height:1.15;font-weight:500}
.hero p{margin:0;max-width:34rem;opacity:.9;font-size:1.05rem}
.card{background:#fff;border:1px solid #dde3ee;border-radius:14px;padding:20px;box-shadow:0 1px 2px rgba(15,27,51,.04)}
.booking{margin-top:-52px;position:relative}
h2{margin:0 0 12px;font-size:1.25rem;font-weight:600}h3{margin:16px 0 6px;font-size:1rem}
.grid{display:grid;gap:14px;grid-template-columns:minmax(0,1fr)}
@media(min-width:640px){.grid.two{grid-template-columns:repeat(2,minmax(0,1fr))}.grid.three{grid-template-columns:repeat(3,minmax(0,1fr))}}
label,.lbl{display:block;font-size:.875rem;font-weight:500;margin:0 0 4px}
input,select,textarea{width:100%;font:inherit;color:#0f1b33;padding:10px 12px;min-height:46px;border:1px solid #b9c3d6;border-radius:10px;background:#fff}
input[type=checkbox],input[type=radio]{width:20px;height:20px;min-height:0;margin:2px 0 0;accent-color:var(--a);flex:none}
.hint{font-size:.8rem;color:#5b6b85;margin:4px 0 0}
.seg{display:grid;grid-template-columns:1fr 1fr;gap:8px}
.seg label{display:flex;align-items:center;justify-content:center;gap:8px;margin:0;min-height:46px;border:1px solid #b9c3d6;border-radius:10px;cursor:pointer;font-weight:500;background:#fff}
.seg input{position:absolute;opacity:0;pointer-events:none}.seg label:has(input:checked){border-color:var(--a);box-shadow:inset 0 0 0 2px var(--a)}.seg label:has(input:focus-visible){outline:3px solid var(--a);outline-offset:2px}
.check{display:flex;gap:10px;align-items:flex-start;font-weight:400;font-size:.9rem;margin:0}
.btn{display:inline-flex;align-items:center;justify-content:center;gap:8px;min-height:48px;padding:0 20px;border:0;border-radius:10px;background:var(--a);color:var(--ai);font:inherit;font-weight:600;cursor:pointer;text-decoration:none}
.btn.alt{background:#fff;color:#0f1b33;border:1px solid #b9c3d6}.btn:disabled{opacity:.55;cursor:not-allowed}.btn.full{width:100%}
.price{display:flex;align-items:baseline;justify-content:space-between;gap:12px;padding:12px 14px;border-radius:10px;background:#f4f6fa;border:1px solid #dde3ee}
.price strong{font-size:1.4rem}
.msg{padding:12px 14px;border-radius:10px;font-size:.92rem;margin:0}.msg.err{background:#fdecec;color:#8a1c1c;border:1px solid #f3c2c2}.msg.ok{background:#e8f6ee;color:#14532d;border:1px solid #b5dfc6}.msg.info{background:#eef3fb;color:#1c3a6b;border:1px solid #cddbf1}
.hidden{display:none!important}
.sec{padding-top:28px;padding-bottom:28px}.sec h2{font-size:1.4rem}
.facts{display:grid;gap:12px;grid-template-columns:minmax(0,1fr)}@media(min-width:720px){.facts{grid-template-columns:repeat(3,minmax(0,1fr))}}
.facts .card{padding:16px}.facts p{margin:0;color:#41516d;font-size:.95rem}
footer{background:#fff;border-top:1px solid #dde3ee;padding:22px 0 30px;font-size:.85rem;color:#5b6b85}
footer .row{display:flex;flex-wrap:wrap;gap:8px 20px}footer a{text-decoration:underline}
.pill{display:inline-block;padding:4px 12px;border-radius:999px;font-size:.8rem;font-weight:600;background:#eef3fb;color:#1c3a6b}.pill.good{background:#e8f6ee;color:#14532d}.pill.bad{background:#fdecec;color:#8a1c1c}.pill.wait{background:#fff4d6;color:#7a5200}
.route{display:grid;gap:10px;margin:14px 0;position:relative}.route div{padding-left:22px;position:relative}.route div::before{content:"";position:absolute;left:3px;top:.55em;width:10px;height:10px;border-radius:50%;background:var(--a)}.route small{display:block;color:#5b6b85;font-size:.78rem;text-transform:uppercase;letter-spacing:.06em}
.rows{margin:12px 0 0;padding:0}.rows div{display:flex;justify-content:space-between;gap:16px;padding:9px 0;border-top:1px solid #e8edf5}.rows dt{color:#5b6b85}.rows dd{margin:0;text-align:right;font-weight:500}
.stack{display:grid;gap:12px}
@media(prefers-reduced-motion:reduce){html{scroll-behavior:auto}}
`;

function shell({ title, t, body, script = '', robots = 'index,follow', description = '' }) {
  const { primary, accent } = colours(t);
  const name = clean(t.name) || 'This business';
  const phone = phoneDisplay(t.contact_phone), tel = phoneTel(t.contact_phone);
  const logo = logoUrl(t);
  return `<!doctype html><html lang="en-GB"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="robots" content="${esc(robots)}">${description ? `<meta name="description" content="${esc(description)}">` : ''}
<meta name="theme-color" content="${esc(primary)}"><title>${esc(title)}</title>
<link rel="stylesheet" href="/public/css/fonts.css">
<style>:root{--p:${primary};--a:${accent};--ai:${inkOn(accent)}}${CSS}</style></head><body>
<a class="skip" href="#main">Skip to the page</a>
<header class="top"><div class="wrap bar"><a class="brand" href="/">${logo ? `<img src="${esc(logo)}" alt="" width="150" height="40">` : ''}<span>${esc(name)}</span></a>${tel ? `<a class="call" href="tel:${esc(tel)}" aria-label="Call ${esc(name)} on ${esc(phone)}">${esc(phone)}</a>` : ''}</div></header>
${body}
<footer><div class="wrap"><div class="row"><span>&copy; ${new Date().getFullYear()} ${esc(name)}</span>${termsReady(t) ? '<a href="/terms">Terms and conditions</a>' : ''}${privacyReady(t) ? '<a href="/privacy">Privacy policy</a>' : ''}${t.contact_email ? `<a href="mailto:${esc(t.contact_email)}">${esc(t.contact_email)}</a>` : ''}</div>${clean(brandOf(t).licence) ? `<p>Licensed private hire operator, licence ${esc(clean(brandOf(t).licence))}.</p>` : ''}</div></footer>
${script ? `<script>${script}</script>` : ''}</body></html>`;
}

// ── home page ────────────────────────────────────────────────────────────────
function homePage(t) {
  const name = clean(t.name) || 'Our service';
  const p = pricingFromRow(t.pricing);
  const airports = p ? p.airports.map((a) => ({ name: a.name, oneWay: a.oneWay, ret: a.ret })) : [];
  const tagline = clean(brandOf(t).tagline) || 'Book your airport transfer online';
  const policy = policyText(t);
  const termsLink = termsReady(t) ? ' <a href="/terms">Read the full terms</a>.' : '';

  const airportField = airports.length
    ? `<div><label for="airport">Airport</label><select id="airport" name="airport" required><option value="">Choose an airport</option>${airports.map((a) => `<option value="${esc(a.name)}">${esc(a.name)}</option>`).join('')}</select></div>`
    : `<div><label for="airport">Airport or destination</label><input id="airport" name="airport" autocomplete="off" required><p class="hint">We will confirm the price with you.</p></div>`;

  const body = `<main id="main">
<section class="hero"><div class="wrap"><h1>${esc(name)}</h1><p>${esc(tagline)}</p></div></section>
<section class="wrap booking" aria-labelledby="book-h"><div class="card">
<h2 id="book-h">Book a transfer</h2>
<form id="bookForm" novalidate>
<div class="stack">
<div role="radiogroup" aria-label="Direction" class="seg"><label><input type="radio" name="dir" value="to" checked> To the airport</label><label><input type="radio" name="dir" value="from"> From the airport</label></div>
<div class="grid two">${airportField}<div><label for="address" id="addressLabel">Pickup address</label><input id="address" name="address" autocomplete="street-address" required></div></div>
<div class="grid three"><div><label for="date">Date</label><input id="date" name="date" type="date" required></div><div><label for="time">Time</label><input id="time" name="time" type="time" required></div><div><label for="pax">Passengers</label><select id="pax" name="pax">${[1, 2, 3, 4, 5, 6, 7, 8].map((n) => `<option>${n}</option>`).join('')}</select></div></div>
<div id="flightRow" class="hidden"><label for="flight">Flight number <span class="hint" style="display:inline">(optional)</span></label><input id="flight" name="flight" autocomplete="off"></div>
<label class="check"><input type="checkbox" id="ret"> I need a return journey</label>
<div id="retRow" class="grid two hidden"><div><label for="rdate">Return date</label><input id="rdate" name="rdate" type="date"></div><div><label for="rtime">Return time</label><input id="rtime" name="rtime" type="time"></div></div>
<div class="grid two"><div><label for="cname">Your name</label><input id="cname" name="name" autocomplete="name" required></div><div><label for="cphone">Mobile number</label><input id="cphone" name="phone" type="tel" autocomplete="tel" required></div></div>
<div><label for="cemail">Email <span class="hint" style="display:inline">(for your confirmation)</span></label><input id="cemail" name="email" type="email" autocomplete="email"></div>
<div id="priceBox" class="price hidden" aria-live="polite"><span id="priceLabel">Price</span><strong id="priceAmt"></strong></div>
<div style="position:absolute;left:-9999px" aria-hidden="true"><label for="company_website">Leave this empty</label><input id="company_website" name="company_website" tabindex="-1" autocomplete="off"></div>
<label class="check"><input type="checkbox" id="terms" required><span>I have read and accept the cancellation policy. ${esc(policy)}${termsLink}</span></label>
<p id="formMsg" class="msg err hidden" role="alert"></p>
<button class="btn full" id="submitBtn" type="submit">Request this booking</button>
<p class="hint">${esc(name)} will confirm your booking, then you can pay online or in cash.</p>
</div></form></div></section>
<section class="sec wrap" aria-label="About this service"><div class="facts">
<div class="card"><h3 style="margin-top:0">Fixed prices</h3><p>You see the price before you book. No surprises on the day.</p></div>
<div class="card"><h3 style="margin-top:0">Confirmed by ${esc(name)}</h3><p>Every request is checked and confirmed by the business before it is final.</p></div>
<div class="card"><h3 style="margin-top:0">Pay online or in cash</h3><p>Once confirmed, pay by card online or choose cash on the day.</p></div>
</div></section></main>`;

  const script = `(function(){
var AIRPORTS=${scriptJson(airports)};
var f=document.getElementById('bookForm'),msg=document.getElementById('formMsg'),btn=document.getElementById('submitBtn');
function $(i){return document.getElementById(i)}
function show(el,on){el.classList.toggle('hidden',!on)}
function dir(){return f.elements.dir.value}
function money(n){return '\\u00a3'+(Number.isInteger(n)?n:n.toFixed(2))}
function sync(){var from=dir()==='from';$('addressLabel').textContent=from?'Drop-off address':'Pickup address';show($('flightRow'),from);show($('retRow'),$('ret').checked);
 var sel=$('airport'),a=AIRPORTS.filter(function(x){return x.name===sel.value})[0];
 if(a){var r=$('ret').checked;$('priceLabel').textContent=r?'Return price':'One-way price';$('priceAmt').textContent=money(r?a.ret:a.oneWay);show($('priceBox'),true)}else show($('priceBox'),false)}
['change','input'].forEach(function(e){f.addEventListener(e,sync)});sync();
var today=new Date();var iso=today.getFullYear()+'-'+String(today.getMonth()+1).padStart(2,'0')+'-'+String(today.getDate()).padStart(2,'0');$('date').min=iso;$('rdate').min=iso;
function err(t){msg.textContent=t;show(msg,true);msg.scrollIntoView({block:'nearest'})}
f.addEventListener('submit',function(ev){ev.preventDefault();show(msg,false);
 var v=function(i){return ($(i).value||'').trim()};var from=dir()==='from',ret=$('ret').checked,ap=v('airport'),addr=v('address');
 if(!ap)return err('Please choose an airport.');if(!addr)return err('Please enter the '+(from?'drop-off':'pickup')+' address.');
 if(!v('date')||!v('time'))return err('Please choose a date and time.');if(ret&&(!v('rdate')||!v('rtime')))return err('Please choose a return date and time, or untick the return journey.');
 if(!v('cname'))return err('Please enter your name.');if(v('cphone').replace(/\\D/g,'').length<10)return err('Please enter a mobile number we can reach you on.');
 if(!$('terms').checked){$('terms').focus();return err('Please accept the cancellation policy to continue.')}
 var payload={journey_type:from?'From Airport':'To Airport',pickup_location:from?ap:addr,airport:ap,flight_number:from?(v('flight')||null):null,dropoff_address:from?addr:ap,travel_date:v('date'),travel_time:v('time'),passengers:parseInt($('pax').value,10)||1,luggage:null,return_journey:ret,return_pickup:ret?(from?addr:ap):null,return_airport:ret?ap:null,return_flight:null,return_date:ret?v('rdate'):null,return_time:ret?v('rtime'):null,return_destination:ret?(from?ap:addr):null,customer_name:v('cname'),customer_phone:v('cphone'),customer_email:v('cemail')||null,additional_stops:[],company_website:v('company_website'),terms_accepted:true};
 btn.disabled=true;btn.textContent='Sending\\u2026';
 fetch('/api/booking/create',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload)})
 .then(function(r){return r.text().then(function(t){var d;try{d=JSON.parse(t)}catch(e){throw new Error('Something went wrong. Please try again or contact us directly.')}if(!r.ok||!d.success)throw new Error(d.error||'We could not take your booking. Please try again or contact us directly.');return d})})
 .then(function(d){if(d.bookingId)location.href='/booking?id='+encodeURIComponent(d.bookingId);else{f.reset();sync();err('Thank you. We have your request and will be in touch shortly.')}})
 .catch(function(e){err(e.message);btn.disabled=false;btn.textContent='Request this booking'});
});})();`;

  return shell({ title: `${name} | Book a transfer`, t, body, script, description: `${tagline}. Book online with ${name}.` });
}

// ── booking page (status and payment) ────────────────────────────────────────
function bookingPage(t) {
  const name = clean(t.name) || 'the business';
  const phone = phoneDisplay(t.contact_phone), tel = phoneTel(t.contact_phone);
  const policy = policyText(t);
  const body = `<main id="main"><div class="wrap" style="padding-top:24px;padding-bottom:40px;max-width:720px">
<h1 style="font-size:1.6rem;margin:0 0 16px;font-weight:500">Your booking</h1>
<div id="stLoading" class="card"><p style="margin:0">Loading your booking&hellip;</p></div>
<div id="stError" class="card hidden"><p id="errText" class="msg err" role="alert"></p><p class="hint" style="margin-top:12px">${tel ? `Need help? <a href="tel:${esc(tel)}">Call ${esc(phone)}</a>.` : 'Please contact the business directly.'}</p></div>
<div id="stLookup" class="card hidden"><h2>Find your booking</h2>
<p class="hint" style="margin:0 0 12px">Enter your reference and the mobile number you booked with.</p>
<div class="grid two"><div><label for="lkRef">Booking reference</label><input id="lkRef" autocomplete="off" placeholder="e.g. ABC-1A2B3C"></div><div><label for="lkPhone">Mobile number</label><input id="lkPhone" type="tel" autocomplete="tel"></div></div>
<p id="lkErr" class="msg err hidden" role="alert" style="margin-top:12px"></p><div style="margin-top:12px"><button class="btn" id="lkBtn" type="button">Find my booking</button></div></div>
<div id="stBooking" class="stack hidden">
<div class="card"><div style="display:flex;justify-content:space-between;gap:12px;align-items:center;flex-wrap:wrap"><span id="pill" class="pill">Status</span><span class="hint" id="refText" style="margin:0"></span></div>
<div id="routeBox" class="route"></div><dl id="rows" class="rows"></dl>
<div id="priceRow" class="price hidden" style="margin-top:14px"><span>Total price</span><strong id="priceAmt"></strong></div></div>
<div id="pAwait" class="card hidden"><h2>Waiting for confirmation</h2><p style="margin:0">${esc(name)} is checking availability. You will get a message as soon as your booking is confirmed. This page updates when you refresh it.</p></div>
<div id="pRoad" class="card hidden"><h2>Your driver is on the way</h2><p id="roadText" style="margin:0"></p></div>
<div id="pDone" class="card hidden"><h2 id="doneTitle">Confirmed</h2><p id="doneText" style="margin:0"></p></div>
<div id="pPending" class="card hidden"><h2>Confirming your payment</h2><p style="margin:0">Thank you. We are confirming your card payment with the bank. This takes a few seconds.</p></div>
<div id="pBad" class="card hidden"><h2 id="badTitle">This booking is not going ahead</h2><p id="badText" style="margin:0"></p></div>
<div id="pPay" class="card hidden"><h2>Choose how to pay</h2>
<div id="payCancelled" class="msg info hidden" style="margin-bottom:12px">The payment was cancelled. You have not been charged. You can try again below.</div>
<p class="hint" style="margin:0 0 12px"><strong>Cancellation policy.</strong> ${esc(policy)}</p>
<label id="policyRow" class="check hidden" style="margin-bottom:12px"><input type="checkbox" id="policyOk"><span>I have read and accept the cancellation policy.</span></label>
<p id="policyErr" class="msg err hidden" role="alert" style="margin-bottom:12px">Please accept the cancellation policy to continue.</p>
<div class="stack"><button class="btn full" id="btnCard" type="button">Pay by card online</button><button class="btn alt full" id="btnCash" type="button">Pay cash on the day</button></div>
<p id="payErr" class="msg err hidden" role="alert" style="margin-top:12px"></p></div>
<p class="hint">${tel ? `Questions? <a href="tel:${esc(tel)}">Call ${esc(phone)}</a>${t.contact_email ? ` or email <a href="mailto:${esc(t.contact_email)}">${esc(t.contact_email)}</a>` : ''}.` : t.contact_email ? `Questions? Email <a href="mailto:${esc(t.contact_email)}">${esc(t.contact_email)}</a>.` : ''}</p>
</div></div></main>`;

  const script = `(function(){
var params=new URLSearchParams(location.search),queryId=params.get('id'),payment=params.get('payment'),bookingId=null,needsTerms=false;
function $(i){return document.getElementById(i)}
function show(i,on){$(i).classList.toggle('hidden',on===false)}
function hideAll(){['pAwait','pRoad','pDone','pPending','pBad','pPay'].forEach(function(i){show(i,false)})}
function fmtDate(d){var m=String(d||'').match(/^(\\d{4})-(\\d{2})-(\\d{2})/);return m?m[3]+'/'+m[2]+'/'+m[1]:(d||'To be confirmed')}
function fmtTime(x){return x?String(x).slice(0,5):''}
function isConfirmed(b){if(['Cancelled','Completed','No Show'].indexOf(b.status)>-1||b.operator_response==='rejected')return false;return b.operator_response==='accepted'||b.source==='operator'||b.status==='Dispatched'}
function isCash(b){return String(b.payment_method||'').toLowerCase()==='cash'}
function error(t){show('stLoading',false);show('stBooking',false);show('stLookup',false);$('errText').textContent=t;show('stError',true)}
function row(l,v){if(!v)return;var d=document.createElement('div'),a=document.createElement('dt'),b=document.createElement('dd');a.textContent=l;b.textContent=String(v);d.appendChild(a);d.appendChild(b);$('rows').appendChild(d)}
function point(label,value){var d=document.createElement('div'),s=document.createElement('small'),v=document.createElement('span');s.textContent=label;v.textContent=value;d.appendChild(s);d.appendChild(v);$('routeBox').appendChild(d)}
function pill(text,cls){var p=$('pill');p.textContent=text;p.className='pill'+(cls?' '+cls:'')}
function render(b){bookingId=b.id;show('stLoading',false);show('stLookup',false);show('stError',false);show('stBooking',true);hideAll();
 $('refText').textContent=b.ref?'Reference '+b.ref:'';$('routeBox').textContent='';$('rows').textContent='';
 point('Pickup',b.pickup_location||b.airport||'Pickup');point('Drop-off',b.dropoff_address||b.airport||'Your destination');
 row('Date',fmtDate(b.travel_date)+(b.travel_time?' at '+fmtTime(b.travel_time):''));if(b.passengers)row('Passengers',b.passengers);if(b.flight_number)row('Flight',b.flight_number);
 if(b.return_journey)row('Return',fmtDate(b.return_date)+(b.return_time?' at '+fmtTime(b.return_time):''));
 if(b.quoted_price&&!b.return_leg){var q=Number(b.quoted_price);$('priceAmt').textContent='\\u00a3'+(Number.isInteger(q)?q:q.toFixed(2));show('priceRow',true)}else show('priceRow',false);
 var onRoad=['En Route','Arrived','Passenger On Board'].indexOf(b.status)>-1;
 if(b.status==='Cancelled'||b.status==='No Show'||b.operator_response==='rejected'){var rej=b.operator_response==='rejected';pill(rej?'Unavailable':b.status==='No Show'?'No show':'Cancelled','bad');$('badTitle').textContent=rej?'Sorry, we cannot take this journey':'This booking has been cancelled';$('badText').textContent=rej?'No payment has been taken. Please contact us if you would like to arrange another time.':'If you think this is a mistake, please contact us.';show('pBad');return}
 if(b.status==='Completed'){pill('Completed','good');$('doneTitle').textContent='Journey completed';$('doneText').textContent='Thank you for travelling with us.';show('pDone');return}
 if(b.return_leg&&(isConfirmed(b)||onRoad)){pill('Confirmed','good');$('doneTitle').textContent='Your return journey is confirmed';$('doneText').textContent='It is paid with your outbound booking'+(b.outbound_ref?' (reference '+b.outbound_ref+')':'')+', so there is nothing to pay here.';show('pDone');return}
 if(onRoad){pill(b.status,'good');$('roadText').textContent=b.status==='En Route'?'Your driver is on the way to the pickup point.':b.status==='Arrived'?'Your driver has arrived at the pickup point.':'You are on your way. Enjoy the journey.';show('pRoad');return}
 if(isConfirmed(b)){var paid=b.payment_status==='Paid';
  if(paid||b.payment_status==='Invoiced'||isCash(b)){pill('Confirmed','good');$('doneTitle').textContent='Your transfer is confirmed';$('doneText').textContent=(paid?(isCash(b)?'Paid in cash. ':'Paid by card online. '):b.payment_status==='Invoiced'?'Payment is on account. ':'Payment: cash on the day. ')+'We will see you on the day.';show('pDone');
   if(!paid&&isCash(b)&&b.payment_status!=='Invoiced'){needsTerms=!!b.needs_terms;show('policyRow',needsTerms);show('pPay');$('btnCash').classList.add('hidden')}return}
  if(payment==='success'){pill('Accepted','wait');show('pPending');verify(0);return}
  pill('Accepted','wait');needsTerms=!!b.needs_terms;show('policyRow',needsTerms);show('payCancelled',payment==='cancelled');show('pPay');return}
 pill('Awaiting confirmation','wait');show('pAwait')}
function verify(n){fetch('/api/payment/verify',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({bookingId:queryId,sessionId:params.get('session_id')||undefined})}).then(function(r){return r.json()}).then(function(d){if(d&&d.paid)location.href='/booking?id='+encodeURIComponent(queryId);else if(n<6)setTimeout(function(){verify(n+1)},4000);else{$('pPending').querySelector('p').textContent='We have not seen the payment yet. Please refresh this page in a minute. If you were charged, you do not need to pay again.'}}).catch(function(){if(n<6)setTimeout(function(){verify(n+1)},4000)})}
function load(){if(!queryId){show('stLoading',false);show('stLookup');return}
 fetch('/api/booking/get?id='+encodeURIComponent(queryId)).then(function(r){return r.json().then(function(d){if(!r.ok)throw new Error(d.error||'We could not find that booking.');return d})}).then(render).catch(function(e){error(e.message||'We could not load your booking. Please try again.')})}
$('lkBtn').addEventListener('click',function(){var ref=($('lkRef').value||'').trim(),ph=($('lkPhone').value||'').trim(),e=$('lkErr');e.classList.add('hidden');
 if(!ref||!ph){e.textContent='Enter both your booking reference and mobile number.';e.classList.remove('hidden');return}
 var b=$('lkBtn');b.disabled=true;b.textContent='Searching\\u2026';
 fetch('/api/booking/lookup',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({ref:ref,phone:ph})}).then(function(r){return r.json().then(function(d){if(!r.ok||!d.id)throw new Error(d.error||'No booking found. Check your reference and number.');location.href='/booking?id='+encodeURIComponent(d.id)})}).catch(function(x){e.textContent=x.message;e.classList.remove('hidden');b.disabled=false;b.textContent='Find my booking'})});
function body(){var b={bookingId:bookingId};if(needsTerms){var ok=$('policyOk').checked;show('policyErr',!ok);if(!ok){$('policyOk').focus();return null}b.terms_accepted=true}return b}
function pay(url,btnId,busy,label,done){var b=body();if(!b)return;var btn=$(btnId),e=$('payErr');e.classList.add('hidden');btn.disabled=true;btn.textContent=busy;
 fetch(url,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(b)}).then(function(r){return r.json().then(function(d){if(!r.ok)throw new Error(d.error||'That did not work. Please try again.');done(d)})}).catch(function(x){e.textContent=x.message;e.classList.remove('hidden');btn.disabled=false;btn.textContent=label})}
$('btnCard').addEventListener('click',function(){pay('/api/payment/create-checkout-session','btnCard','Taking you to the payment page\\u2026','Pay by card online',function(d){if(!d.url)throw new Error('The payment page is not available. Please try again or contact us.');location.href=d.url})});
$('btnCash').addEventListener('click',function(){if(!confirm('Confirm that you will pay in cash on the day?'))return;pay('/api/payment/confirm-cash','btnCash','Confirming\\u2026','Pay cash on the day',function(){location.href='/booking?id='+encodeURIComponent(bookingId)})});
load();})();`;

  return shell({ title: `Your booking | ${name}`, t, body, script, robots: 'noindex,nofollow' });
}

// ── not found / not set up ───────────────────────────────────────────────────
function notFoundPage(t) {
  if (!t) {
    return `<!doctype html><html lang="en-GB"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex"><title>Website not set up</title><style>body{margin:0;font-family:system-ui,sans-serif;background:#f4f6fa;color:#0f1b33;display:grid;place-items:center;min-height:100vh;padding:24px}main{max-width:30rem;background:#fff;border:1px solid #dde3ee;border-radius:14px;padding:24px}h1{margin:0 0 8px;font-size:1.3rem}p{margin:0;color:#41516d}</style></head><body><main><h1>This website is not set up yet</h1><p>If you own this domain, ask your booking provider to finish connecting it.</p></main></body></html>`;
  }
  const body = `<main id="main"><div class="wrap" style="padding:32px 16px 48px;max-width:640px"><div class="card"><h1 style="margin:0 0 8px;font-size:1.4rem">Page not found</h1><p style="margin:0 0 16px">That page does not exist.</p><a class="btn" href="/">Go to the home page</a></div></div></main>`;
  return shell({ title: `Page not found | ${clean(t.name) || 'Website'}`, t, body, robots: 'noindex' });
}

// ── request handler ──────────────────────────────────────────────────────────
function send(res, status, html, { cache = 'public, max-age=60, s-maxage=60', type = 'text/html; charset=utf-8' } = {}) {
  res.statusCode = status;
  res.setHeader('Content-Type', type);
  res.setHeader('Cache-Control', cache);
  res.setHeader('X-Content-Type-Options', 'nosniff');
  return res.end(html);
}

async function handle(req, res) {
  if (req.method !== 'GET' && req.method !== 'HEAD') { res.statusCode = 405; return res.end('Method not allowed'); }
  const h = req.headers || {};
  const host = String(h['x-forwarded-host'] || h.host || '').split(',')[0];
  let list = [];
  try { list = await loadAll(); } catch (e) { console.error('tenant site load failed:', e.message || e); }
  const t = findByHost(host, list);
  if (!t) return send(res, 404, notFoundPage(null), { cache: 'no-store' });

  const page = String((req.query && req.query.p) || '').toLowerCase().replace(/^\/+|\/+$/g, '');
  if (page === '' || page === 'home') return send(res, 200, homePage(t));
  if (page === 'booking') return send(res, 200, bookingPage(t), { cache: 'no-store' });
  if (page === 'terms' || page === 'privacy') { res.statusCode = 302; res.setHeader('Location', `/t/${t.slug}/${page}`); return res.end(); }
  if (page === 'robots.txt') return send(res, 200, 'User-agent: *\nAllow: /\nDisallow: /booking\nDisallow: /api/\n', { type: 'text/plain; charset=utf-8' });
  return send(res, 404, notFoundPage(t), { cache: 'no-store' });
}

module.exports = { handle, homePage, bookingPage, notFoundPage, findByHost, loadAll, policyText, colours, inkOn, _setTenants };
