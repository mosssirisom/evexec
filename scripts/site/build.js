#!/usr/bin/env node
'use strict';

// Builds EV Exec's service, airport, area, fleet, FAQ and quote pages as
// static HTML in the repo root (served by Vercel's @vercel/static build).
//
//   node scripts/site/build.js
//
// Content lives in scripts/site/pages/*.js. Shared business facts (prices,
// rating, fleet, areas) live in scripts/site/data.js. The generated .html
// files are committed; edit the sources and re-run, never the output.
// The script also keeps sitemap.xml and the page routes in vercel.json in sync.

const fs = require('fs');
const path = require('path');
const { SITE, BUSINESS, RATING, REVIEWS, PRICES, FLEET, AREAS, SERVICES } = require('./data');
const chrome = require('./chrome');

const ROOT = path.resolve(__dirname, '../..');
const PAGES_DIR = path.join(__dirname, 'pages');

// ── helpers ──────────────────────────────────────────────────────────────
const esc = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const strip = (s) => String(s ?? '').replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();
const url = (slug) => (slug ? `${SITE}/${slug}` : `${SITE}/`);
const href = (slug) => (slug ? `/${slug}` : '/');
const gbp = (n) => `£${n}`;

// Opens the homepage booking form with the airport already highlighted.
const bookHref = (airportName) => (airportName ? `/?airport=${encodeURIComponent(airportName)}#quote` : '/#quote');
const quoteHref = (service) => (service ? `/quote?service=${encodeURIComponent(service)}` : '/quote');

const ICONS = {
  check: '<path d="m5 12.5 4.2 4.2L19 7"/>',
  plane: '<path d="M3 11.5 21 4l-7.5 18-2.8-7.7L3 11.5zM21 4 10.7 14.3"/>',
  pound: '<path d="M7 20h11M8 12h8M9 20c2.5-2.8 2.7-6 1.5-9.5C9.8 8.2 10.9 5 14 5c1.7 0 3 .8 4 2"/>',
  car: '<path d="M4 14l2-5h12l2 5M5 14h14v5H5zM7 19v2M17 19v2M7 16h.1M17 16h.1"/>',
  user: '<path d="M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM4 21c1.6-4 4.2-6 8-6s6.4 2 8 6"/>',
  star: '<path d="m12 3 2.9 5.9 6.5.9-4.7 4.6 1.1 6.5L12 17.8l-5.8 3.1 1.1-6.5-4.7-4.6 6.5-.9L12 3z"/>',
  clock: '<circle cx="12" cy="12" r="8"/><path d="M12 7v5l3 2"/>',
  map: '<path d="M12 21s7-5.2 7-11a7 7 0 0 0-14 0c0 5.8 7 11 7 11z"/><circle cx="12" cy="10" r="2.2"/>',
  briefcase: '<path d="M8 7V5h8v2M4 8h16v11H4zM4 13h16"/>',
  phone: '<path d="M8 3h8a1 1 0 0 1 1 1v16a1 1 0 0 1-1 1H8a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1zM11 18h2"/>',
  chat: '<path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>',
  shield: '<path d="M12 3 5 6v6c0 4.4 3 7.6 7 9 4-1.4 7-4.6 7-9V6l-7-3z"/><path d="m9 12 2 2 4-4"/>',
  card: '<rect x="3" y="6" width="18" height="12" rx="2"/><path d="M3 10h18M7 15h3"/>',
  bell: '<path d="M6 16V11a6 6 0 1 1 12 0v5l1.5 2h-15L6 16zM10 20a2 2 0 0 0 4 0"/>',
  bolt: '<path d="M13 2 4 14h7l-1 8 9-12h-7l1-8z"/>',
  route: '<circle cx="6" cy="19" r="2"/><circle cx="18" cy="5" r="2"/><path d="M8 19h7a3 3 0 0 0 0-6H9a3 3 0 0 1 0-6h7"/>',
  calendar: '<rect x="4" y="5" width="16" height="15" rx="2"/><path d="M4 10h16M9 3v4M15 3v4"/>',
  music: '<path d="M9 18V5l11-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="17" cy="16" r="3"/>',
  case: '<rect x="6" y="7" width="12" height="13" rx="2"/><path d="M9 7V4h6v3M9 20v1M15 20v1"/>',
  leaf: '<path d="M20 4c-7.5.6-12.5 3.9-15 10 5.5.6 10-1.8 13.5-7.2M5 14c1.5 2.5 3.9 4.4 7 5"/>',
};
const icon = (name, cls = 'icon') =>
  `<svg class="${cls}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICONS[name] || ''}</svg>`;

const picture = (base, alt, { w = 1000, h = 789, eager = false, sizes = '(min-width: 900px) 50vw, 100vw' } = {}) =>
  `<picture><source type="image/webp" srcset="/public/images/opt/${base}.webp"><img src="/public/images/opt/${base}.jpg" alt="${esc(alt)}" width="${w}" height="${h}" sizes="${sizes}" ${eager ? 'fetchpriority="high"' : 'loading="lazy"'} decoding="async"></picture>`;

// ── shared blocks ────────────────────────────────────────────────────────
// Header, menus and footer come from chrome.js, shared with the homepage.

const stars = '★★★★★';

function trustRow() {
  return `<ul class="trust">
  <li><span class="stars" aria-hidden="true">${stars}</span><a href="${BUSINESS.googleProfile}" rel="noopener" target="_blank"><strong>${RATING.value}</strong> on Google &middot; ${RATING.count} reviews</a></li>
  <li>${icon('pound', '')}Fixed prices</li>
  <li>${icon('plane', '')}Flight monitoring</li>
  <li>${icon('shield', '')}Licensed &amp; DBS-checked drivers</li>
</ul>`;
}

function crumbs(page) {
  const items = [{ name: 'Home', slug: '' }, ...(page.crumbs || []), { name: page.crumb || strip(page.h1) }];
  return `<nav class="crumbs wrap" aria-label="Breadcrumb"><ol>${items.map((c, i) =>
    i === items.length - 1 ? `<li aria-current="page">${esc(c.name)}</li>` : `<li><a href="${href(c.slug)}">${esc(c.name)}</a></li>`).join('')}</ol></nav>`;
}

function heroBlock(page) {
  const h = page.hero || {};
  const chips = (h.prices || []).map((p) => `<div class="chip"><b>${esc(p.value)}</b><small>${esc(p.label)}</small></div>`).join('');
  const primary = h.primary || { label: 'Book Your Transfer', href: page.bookHref || '/#quote' };
  const secondary = h.secondary || { label: 'Get a Quote', href: quoteHref(page.quoteService) };
  return `<section class="hero">
  ${crumbs(page)}
  <div class="wrap hero-grid${h.media ? ' has-media' : ''}">
    <div>
      <span class="pill">${esc(page.eyebrow)}</span>
      <h1>${page.h1}</h1>
      <p class="lead">${page.lead}</p>
      ${chips ? `<div class="price-chips">${chips}</div>` : ''}
      <div class="btn-row" data-evx-cta-zone>
        <a class="btn btn-gold" href="${primary.href}">${icon('bolt', '')}${esc(primary.label)}</a>
        <a class="btn btn-dark" href="${secondary.href}">${esc(secondary.label)}</a>
      </div>
      ${h.trust === false ? '' : trustRow()}
    </div>
    ${h.media ? `<div class="hero-media">${picture(h.media.img, h.media.alt, { w: h.media.w || 1100, h: h.media.h || 825, eager: true, sizes: '(min-width: 900px) 40vw, 100vw' })}</div>` : ''}
  </div>
</section>`;
}

function sectionHead(s) {
  const inner = `${s.eyebrow && s.eyebrow.trim() ? `<span class="eyebrow">${esc(s.eyebrow)}</span>` : ''}${s.title ? `<h2>${s.title}</h2>` : ''}${s.intro ? `<p class="intro">${s.intro}</p>` : ''}`;
  return inner ? `<div class="section-head">${inner}</div>` : '';
}

const SECTIONS = {
  prose: (s) => `${sectionHead(s)}<div class="prose">${s.html}</div>`,

  cards: (s) => `${sectionHead(s)}<div class="grid cols-${s.cols || 3}">${s.items.map((it) => {
    const inner = `${it.icon ? icon(it.icon) : ''}<h3>${it.title}</h3><p>${it.text}</p>${it.href ? `<span class="more">${esc(it.more || 'Find out more')} →</span>` : ''}`;
    return it.href ? `<a class="card" href="${it.href}">${inner}</a>` : `<div class="card">${inner}</div>`;
  }).join('')}</div>`,

  steps: (s) => `${sectionHead(s)}<div class="grid cols-${s.items.length === 4 ? 4 : 3} steps">${s.items.map((it, i) =>
    `<div class="card"><div class="step-number">${i + 1}</div><h3>${it.title}</h3><p>${it.text}</p></div>`).join('')}</div>`,

  split: (s) => `<div class="split${s.flip ? ' flip' : ''}"><div class="media">${picture(s.img, s.alt, { w: s.w || 1100, h: s.h || 825 })}</div><div>${sectionHead(s)}<div class="prose">${s.html}</div></div></div>`,

  prices: (s) => {
    const rows = (s.keys || Object.keys(PRICES)).map((k) => {
      const p = PRICES[k];
      const name = p.slug ? `<a href="${href(p.slug)}">${esc(p.name)}</a>` : esc(p.name);
      return `<tr><td>${name}</td><td class="num">${gbp(p.oneWay)}</td><td class="num">${gbp(p.ret)}</td></tr>`;
    }).join('');
    return `${sectionHead(s)}<div class="price-card" style="max-width:900px;margin:0 auto"><table class="price-table"><thead><tr><th scope="col">Airport</th><th scope="col">One way</th><th scope="col">Return</th></tr></thead><tbody>${rows}</tbody></table>
<p class="price-note">${s.note || `Fixed prices from any pickup in Blackpool and the Fylde Coast, for up to 4 passengers with standard luggage. Airport drop-off and pickup charges are included. Other airports are <a class="gold" href="${quoteHref('airport')}">quoted on request</a>.`}</p></div>`;
  },

  // Compact price summary; the full list lives on /prices.
  priceStrip: (s) => {
    const keys = s.keys || ['manchester', 'liverpool', 'leeds'];
    const figs = keys.map((k) => {
      const p = PRICES[k];
      return `<div><b>${gbp(p.oneWay)}</b>${esc(p.short || p.name)}${keys.length === 1 ? ` one way &middot; ${gbp(p.ret)} return` : ''}</div>`;
    }).join('');
    return `<div class="price-strip"><div><div class="figs">${figs}</div><p class="intro" style="margin-top:12px;max-width:640px">${s.text || ''}</p></div><a class="btn btn-dark" href="/prices">See all prices</a></div>`;
  },

  fleet: (s) => `${sectionHead(s)}<div class="grid cols-3">${FLEET.map((v) => `<article class="card fleet-card">
  <div class="pic">${picture(v.img, v.alt, { w: 1000, h: 789, sizes: '(min-width: 980px) 33vw, (min-width: 640px) 50vw, 100vw' })}</div>
  <div class="body"><h3>${esc(v.name)}</h3>
    <div class="specs"><span>${icon('user', '')}${v.pax} passengers</span><span>${icon('case', '')}${v.cases} suitcases</span></div>
    <ul>${v.points.map((p) => `<li>${esc(p)}</li>`).join('')}</ul></div>
</article>`).join('')}</div>${s.after ? `<p class="note">${s.after}</p>` : ''}`,

  // Compact fleet summary; photos and details live on /fleet.
  fleetMini: (s) => `<div class="price-strip"><div><span class="eyebrow">The fleet</span><div class="figs" style="margin-top:10px">${FLEET.map((v) =>
    `<div><b style="font-size:19px;color:#fff">${esc(v.name)}</b>${v.pax} passengers &middot; ${v.cases} cases</div>`).join('')}</div><p class="intro" style="margin-top:12px;max-width:640px">${s.text || ''}</p></div><a class="btn btn-dark" href="/fleet">Our fleet</a></div>`,

  reviews: (s) => `${sectionHead(s)}<div class="rating-box">
  <div class="score">${RATING.value}</div>
  <div><div class="stars" aria-label="${RATING.value} out of 5 stars">${stars}</div><p>${RATING.count} Google reviews</p></div>
  <a class="btn btn-dark" href="${BUSINESS.googleProfile}" rel="noopener" target="_blank">Read all ${RATING.count} on Google</a>
</div>
<div class="grid cols-3">${REVIEWS.map((r) => `<figure class="card review">
  <figcaption class="who"><span class="avatar" aria-hidden="true">${esc(r.name[0])}</span><span><b>${esc(r.name)}</b><small>Google review &middot; ${esc(r.date)}</small></span></figcaption>
  <div class="stars" aria-label="5 out of 5 stars">${stars}</div>
  <blockquote>&ldquo;${esc(r.text)}&rdquo;</blockquote>
</figure>`).join('')}</div>${s.leave ? `<div class="links-row"><a href="${BUSINESS.googleReview}" rel="noopener" target="_blank">Travelled with us? Leave a review on Google →</a></div>` : ''}`,

  co2: (s) => `${sectionHead(s)}<div class="card calc">
  <label for="co2Route">Select your airport</label>
  <select id="co2Route">${Object.values(PRICES).map((p) => `<option>${esc(p.short || p.name)}</option>`).join('')}</select>
  <div class="calc-number" id="co2Number">12</div>
  <small>kg of CO&#8322; saved per journey compared with a typical petrol taxi</small>
  <p class="note" style="margin-top:14px">Based on the UK petrol taxi average against a Tesla Model Y on the UK electricity grid.</p>
</div>`,

  map: (s) => `<div class="split"><div>${sectionHead(s)}<div class="prose">${s.html}</div></div><div class="map-frame"><iframe title="EV Exec coverage map: Blackpool, Fylde and Wyre" src="https://www.google.com/maps?q=Blackpool%2C%20Lancashire%2C%20UK&amp;output=embed" loading="lazy" referrerpolicy="no-referrer-when-downgrade" allowfullscreen></iframe></div></div>`,

  faq: (s, page) => `${sectionHead({ title: s.title || 'Frequently asked questions', eyebrow: s.eyebrow || 'FAQ', intro: s.intro })}<div class="faq">${(s.faqs || page.faqs).map((f) =>
    `<details><summary>${esc(f.q)}</summary><div class="a">${f.a.startsWith('<') ? f.a : `<p>${f.a}</p>`}</div></details>`).join('')}</div>${s.more === false ? '' : '<p class="note" style="margin-top:18px">More answers on our <a class="gold" href="/faq">FAQ page</a>.</p>'}`,

  links: (s) => `${sectionHead(s)}<ul class="link-list${s.cols === false ? '' : ' cols'}">${s.items.map((it) =>
    `<li><a href="${it.href}">${esc(it.label)}${it.tag ? `<span>${esc(it.tag)}</span>` : '<span>→</span>'}</a></li>`).join('')}</ul>`,

  cta: (s, page) => `<div class="cta-band evx-lazy-bg" data-evx-cta-zone><div><h2>${s.title}</h2><p>${s.text}</p></div><div class="btn-row">
  <a class="btn btn-gold" href="${(s.primary && s.primary.href) || page.bookHref || '/#quote'}">${esc((s.primary && s.primary.label) || 'Book Your Transfer')}</a>
  <a class="btn btn-dark" href="${(s.secondary && s.secondary.href) || quoteHref(page.quoteService)}">${esc((s.secondary && s.secondary.label) || 'Get a Quote')}</a></div></div>`,

  quoteForm: (s) => `${sectionHead(s)}<form class="card form" id="quoteForm" novalidate data-evx-cta-zone>
  <div class="row two">
    <label>What do you need?
      <select name="service" id="qService">
        <option value="airport">Airport transfer (other airport)</option>
        <option value="corporate">Corporate or executive travel</option>
        <option value="private-hire">Private hire</option>
        <option value="long-distance">Long-distance transfer</option>
        <option value="event">Event or concert</option>
        <option value="other">Something else</option>
      </select>
    </label>
    <label>Passengers<input name="passengers" type="number" min="1" max="8" value="1" inputmode="numeric"></label>
  </div>
  <div class="row two">
    <label>Pickup address or postcode *<input name="pickup_location" required autocomplete="street-address" placeholder="e.g. FY8 1AA or a full address"></label>
    <label>Destination *<input name="destination" required placeholder="Where are you going?"></label>
  </div>
  <div class="row three">
    <label>Date *<input name="pickup_date" type="date" required></label>
    <label>Pickup time<input name="pickup_time" type="time"></label>
    <label>Luggage<input name="luggage" placeholder="e.g. 2 suitcases"></label>
  </div>
  <label class="check"><input type="checkbox" name="return_required" id="qReturn"> I need a return journey</label>
  <div class="row two hidden" id="qReturnRow">
    <label>Return date<input name="return_date" type="date"></label>
    <label>Return time<input name="return_time" type="time"></label>
  </div>
  <div class="row three">
    <label>Your name *<input name="name" required autocomplete="name"></label>
    <label>Mobile number *<input name="phone" type="tel" required autocomplete="tel" inputmode="tel"></label>
    <label>Email<input name="email" type="email" autocomplete="email"></label>
  </div>
  <label>Anything else we should know?<textarea name="notes" placeholder="Event name, flight number, child seats, extra luggage, number of stops..."></textarea></label>
  <div style="position:absolute;left:-9999px" aria-hidden="true"><label>Leave this empty<input name="company_website" tabindex="-1" autocomplete="off"></label></div>
  <button class="btn btn-gold" type="submit">Request my quote</button>
  <p class="form-msg" id="quoteMsg" role="status" aria-live="polite"></p>
  <p class="note" style="margin:0">We reply with a fixed price, usually the same day. Prefer to talk? Call <a class="gold" href="tel:${BUSINESS.phoneIntl}">${BUSINESS.phone}</a> or <a class="gold" href="${BUSINESS.whatsapp}" rel="noopener">WhatsApp us</a>.</p>
</form>`,
};

function sectionsHtml(page) {
  return (page.sections || []).map((s) => {
    const render = SECTIONS[s.type];
    if (!render) throw new Error(`${page.slug}: unknown section type ${s.type}`);
    return `<section class="section${s.alt ? ' alt' : ''}"${s.id ? ` id="${s.id}"` : ''}><div class="wrap">${render(s, page)}</div></section>`;
  }).join('\n');
}

// ── structured data ──────────────────────────────────────────────────────
const BUSINESS_REF = {
  '@type': ['TaxiService', 'LocalBusiness'],
  '@id': `${SITE}/#business`,
  name: BUSINESS.name,
  url: `${SITE}/`,
  telephone: BUSINESS.phoneIntl,
  email: BUSINESS.email,
  image: `${SITE}/public/images/ev-exec-image-1.jpg`,
  priceRange: '££',
  address: { '@type': 'PostalAddress', addressLocality: 'Blackpool', addressRegion: 'Lancashire', addressCountry: 'GB' },
  areaServed: ['Blackpool', 'Fylde', 'Wyre', 'Preston'].map((n) => ({ '@type': 'AdministrativeArea', name: n })),
};

function jsonLd(page) {
  const graph = [BUSINESS_REF];
  const trail = [{ name: 'Home', slug: '' }, ...(page.crumbs || []), { name: page.crumb || strip(page.h1), slug: page.slug }];
  graph.push({
    '@type': 'BreadcrumbList',
    itemListElement: trail.map((c, i) => ({ '@type': 'ListItem', position: i + 1, name: c.name, item: url(c.slug) })),
  });
  graph.push({
    '@type': 'WebPage', '@id': `${url(page.slug)}#webpage`, url: url(page.slug), name: page.title,
    description: page.description, isPartOf: { '@id': `${SITE}/#website` }, about: { '@id': `${SITE}/#business` },
  });
  if (page.service) {
    const svc = {
      '@type': 'Service',
      '@id': `${url(page.slug)}#service`,
      name: page.service.name,
      serviceType: page.service.type || page.service.name,
      description: page.service.description || page.description,
      provider: { '@id': `${SITE}/#business` },
      areaServed: (page.service.areas || ['Blackpool', 'Fylde', 'Wyre']).map((n) => ({ '@type': 'Place', name: n })),
      url: url(page.slug),
    };
    if (page.service.offers) {
      svc.offers = page.service.offers.map((o) => ({ '@type': 'Offer', name: o.name, price: String(o.price), priceCurrency: 'GBP', url: url(page.slug) }));
    }
    graph.push(svc);
  }
  if (page.faqs && page.faqs.length) {
    graph.push({
      '@type': 'FAQPage',
      mainEntity: page.faqs.map((f) => ({ '@type': 'Question', name: f.q, acceptedAnswer: { '@type': 'Answer', text: strip(f.a) } })),
    });
  }
  return JSON.stringify({ '@context': 'https://schema.org', '@graph': graph }, null, 1).replace(/</g, '\\u003c');
}

// ── page shell ───────────────────────────────────────────────────────────
const SCRIPT = `<script>
(function(){
  var cr=document.getElementById('co2Route'),cn=document.getElementById('co2Number');
  var co2={'Manchester Airport':12,'Liverpool Airport':9,'Leeds Bradford Airport':14,'Birmingham Airport':24,'Newcastle Airport':24};
  if(cr&&cn)cr.addEventListener('change',function(){var v=co2[cr.value];if(v===undefined)return;cn.style.opacity='0';cn.style.transform='translateY(6px)';setTimeout(function(){cn.textContent=v;cn.style.opacity='1';cn.style.transform='translateY(0)';},190);});
  var f=document.getElementById('quoteForm');if(!f)return;
  var p=new URLSearchParams(location.search),s=p.get('service'),sel=document.getElementById('qService');
  if(s&&sel&&sel.querySelector('option[value="'+s+'"]'))sel.value=s;
  var r=document.getElementById('qReturn'),rr=document.getElementById('qReturnRow');
  r.addEventListener('change',function(){rr.classList.toggle('hidden',!r.checked);});
  var today=new Date().toISOString().slice(0,10);f.querySelectorAll('input[type=date]').forEach(function(i){i.min=today;});
  f.addEventListener('submit',function(e){
    e.preventDefault();var m=document.getElementById('quoteMsg'),btn=f.querySelector('button[type=submit]');
    var bad=[].slice.call(f.querySelectorAll('[required]')).filter(function(i){return !i.value.trim();});
    if(bad.length){m.className='form-msg err';m.textContent='Please fill in the fields marked *.';bad[0].focus();return;}
    var data={};new FormData(f).forEach(function(v,k){data[k]=v;});data.return_required=r.checked;
    data.notes='['+(sel.options[sel.selectedIndex].text)+'] '+(data.notes||'');
    btn.disabled=true;btn.textContent='Sending…';m.className='form-msg';m.textContent='';
    fetch('/api/quote-request',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(data)})
      .then(function(res){return res.json().then(function(j){if(!res.ok)throw new Error(j.error||'Request failed');return j;});})
      .then(function(){f.reset();rr.classList.add('hidden');m.className='form-msg ok';m.textContent='Thank you. Your request has reached us and we will reply with a fixed price shortly.';if(window.gtag)gtag('event','generate_lead',{form:'quote'});})
      .catch(function(){m.className='form-msg err';m.innerHTML='Sorry, that did not send. Please call <a class="gold" href="tel:${BUSINESS.phoneIntl}">${BUSINESS.phone}</a> or WhatsApp us.';})
      .finally(function(){btn.disabled=false;btn.textContent='Request my quote';});
  });
})();
</script>`;

// Quoted services (and the quote page itself) lead with Get a Quote + Call;
// everything else with Book Now + Get a Quote.
function mobileCtaFor(page, book) {
  const call = { quote: `tel:${BUSINESS.phoneIntl}`, quoteLabel: 'Call us' };
  if (page.slug === 'quote') return { book: '/#quote', ...call };
  if (book.startsWith('/quote')) return { book, bookLabel: 'Get a Quote', ...call };
  return { book, quote: quoteHref(page.quoteService) };
}

function render(page) {
  const canonical = url(page.slug);
  const ogImage = `${SITE}/public/images/${page.ogImage || 'ev-exec-image-1.jpg'}`;
  const book = page.bookHref || '/#quote';
  return `<!DOCTYPE html>
<html lang="en-GB">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(page.title)}</title>
<meta name="description" content="${esc(page.description)}">
${page.noindex ? '<meta name="robots" content="noindex">' : `<link rel="canonical" href="${canonical}">`}
<meta name="theme-color" content="#020813">
<meta property="og:type" content="website">
<meta property="og:site_name" content="EV Exec">
<meta property="og:locale" content="en_GB">
<meta property="og:title" content="${esc(page.title)}">
<meta property="og:description" content="${esc(page.description)}">
<meta property="og:url" content="${canonical}">
<meta property="og:image" content="${ogImage}">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="${esc(page.title)}">
<meta name="twitter:description" content="${esc(page.description)}">
<meta name="twitter:image" content="${ogImage}">
<link rel="icon" href="/public/images/opt/ev-exec-logo-160.jpg" type="image/jpeg">
<link rel="apple-touch-icon" href="/public/images/opt/ev-exec-logo-160.jpg">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Cormorant+Garamond:wght@500;600;700&family=Inter:wght@400;500;600;700;900&display=swap">
${chrome.HEAD}
<link rel="stylesheet" href="/public/css/site.css">
<script type="application/ld+json">${jsonLd(page)}</script>
<script async src="https://www.googletagmanager.com/gtag/js?id=G-QY9XHDNSMC"></script>
<script>window.dataLayer=window.dataLayer||[];function gtag(){dataLayer.push(arguments)}gtag('js',new Date());gtag('config','G-QY9XHDNSMC');</script>
</head>
<body class="evx-has-cta">
<a class="skip" href="#main">Skip to content</a>
${chrome.header({ current: page.navKey, book: book.startsWith('/quote') ? '/#quote' : book })}
<main id="main">
${heroBlock(page)}
${sectionsHtml(page)}
</main>
${chrome.footer()}
${chrome.mobileCta(mobileCtaFor(page, book))}
${chrome.SCRIPT}
${SCRIPT}
</body>
</html>
`;
}

// ── sitemap + vercel routes ──────────────────────────────────────────────
function writeSitemap(pages, today) {
  // Hand-maintained pages that are not generated here.
  const extra = [
    { slug: '', priority: '1.0', freq: 'weekly' },
    { slug: 'blog', priority: '0.5', freq: 'monthly' },
    { slug: 'manchester-airport-parking-vs-private-transfer', priority: '0.5', freq: 'yearly' },
    { slug: 'terms', priority: '0.2', freq: 'yearly' },
    { slug: 'privacy', priority: '0.2', freq: 'yearly' },
  ];
  const all = [...extra, ...pages.filter((p) => !p.noindex).map((p) => ({ slug: p.slug, priority: p.priority || '0.8', freq: 'monthly' }))];
  const body = all.map((p) => `  <url>\n    <loc>${url(p.slug)}</loc>\n    <lastmod>${today}</lastmod>\n    <changefreq>${p.freq}</changefreq>\n    <priority>${p.priority}</priority>\n  </url>`).join('\n');
  fs.writeFileSync(path.join(ROOT, 'sitemap.xml'), `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${body}\n</urlset>\n`);
}

// Pages folded into another page keep their old URL as a permanent redirect.
const REDIRECTS = {
  '/airport-transfer-freckleton': '/airport-transfer-kirkham',
  '/airport-transfer-warton': '/airport-transfer-kirkham',
  '/executive-airport-transfers-blackpool': '/corporate-travel',
  '/airport-transfer-thornton-cleveleys': '/airport-transfer-fleetwood',
  // Thin blog post that competed with the Manchester page for the same search.
  '/manchester-airport-transfers-from-blackpool': '/manchester-airport-transfer-blackpool',
};

function syncVercel(pages) {
  const file = path.join(ROOT, 'vercel.json');
  const cfg = JSON.parse(fs.readFileSync(file, 'utf8'));
  const routes = cfg.routes.filter((r) => !REDIRECTS[r.src]);
  const anchor = routes.findIndex((r) => r.src === '/public/(.*)');
  const have = new Set(routes.map((r) => r.src));
  const add = [];
  for (const [src, to] of Object.entries(REDIRECTS)) add.push({ src, status: 301, headers: { Location: to } });
  for (const p of pages) if (!p.noindex && !have.has(`/${p.slug}`)) add.push({ src: `/${p.slug}`, dest: `/${p.slug}.html` });
  routes.splice(anchor, 0, ...add);
  cfg.routes = routes;
  // Keep the file's one-entry-per-line layout so diffs stay readable.
  const line = (o) => JSON.stringify(o).replace(/":/g, '": ').replace(/,"/g, ', "').replace(/^\{/, '{ ').replace(/\}$/, ' }');
  const arr = (a) => `[\n${a.map((o) => `    ${line(o)}`).join(',\n')}\n  ]`;
  fs.writeFileSync(file, `{\n  "version": ${cfg.version},\n  "framework": ${JSON.stringify(cfg.framework)},\n  "builds": ${arr(cfg.builds)},\n  "routes": ${arr(cfg.routes)},\n  "crons": ${arr(cfg.crons)}\n}\n`);
}

// ── shared chrome on the hand-maintained pages ───────────────────────────
// These pages are not generated, but carry the same header, menus and footer
// between <!-- evx:header --> / <!-- evx:footer --> markers.
const CHROME_PAGES = {
  'index.html': { book: '#quote', cta: true },
  'terms.html': {},
  'privacy.html': {},
  'booking.html': {},
  'blog.html': {},
  'manchester-airport-parking-vs-private-transfer.html': {},
};

function injectChrome() {
  for (const [file, opts] of Object.entries(CHROME_PAGES)) {
    const f = path.join(ROOT, file);
    let html = fs.readFileSync(f, 'utf8');
    const before = html;
    if (!/<!-- evx:header -->[\s\S]*?<!-- \/evx:header -->/.test(html)) throw new Error(`${file}: missing evx:header markers`);
    html = html.replace(/<!-- evx:header -->[\s\S]*?<!-- \/evx:header -->/, () => chrome.header({ current: opts.current || '', book: opts.book || '/#quote' }));
    if (opts.cta) html = html.replace(/<!-- evx:cta -->[\s\S]*?<!-- \/evx:cta -->/, () => chrome.mobileCta({ book: opts.book }));
    if (/<!-- evx:footer -->[\s\S]*?<!-- \/evx:footer -->/.test(html)) html = html.replace(/<!-- evx:footer -->[\s\S]*?<!-- \/evx:footer -->/, () => chrome.footer());
    if (!html.includes('/public/css/chrome.css')) html = html.replace('</head>', `${chrome.HEAD}\n</head>`);
    if (!html.includes('/public/js/site.js')) html = html.replace('</body>', `${chrome.SCRIPT}\n</body>`);
    if (html !== before) fs.writeFileSync(f, html);
  }
}

// ── main ─────────────────────────────────────────────────────────────────
function main() {
  const helpers = { esc, bookHref, quoteHref, PRICES, BUSINESS, RATING, AREAS, SERVICES, FLEET, REVIEWS, gbp };
  const pages = fs.readdirSync(PAGES_DIR).filter((f) => f.endsWith('.js')).sort()
    .flatMap((f) => {
      const mod = require(path.join(PAGES_DIR, f));
      const out = typeof mod === 'function' ? mod(helpers) : mod;
      return Array.isArray(out) ? out : [out];
    });
  const seen = new Set();
  for (const p of pages) {
    if (seen.has(p.slug)) throw new Error(`duplicate slug ${p.slug}`);
    seen.add(p.slug);
    for (const k of ['slug', 'title', 'description', 'h1', 'lead', 'eyebrow']) if (!p[k]) throw new Error(`${p.slug}: missing ${k}`);
    if (p.title.length > 65) console.warn(`! ${p.slug}: title ${p.title.length} chars`);
    if (p.description.length > 165) console.warn(`! ${p.slug}: description ${p.description.length} chars`);
    fs.writeFileSync(path.join(ROOT, `${p.slug}.html`), render(p));
  }
  for (const old of Object.keys(REDIRECTS)) {
    const f = path.join(ROOT, `${old.slice(1)}.html`);
    if (fs.existsSync(f)) fs.unlinkSync(f);
  }
  injectChrome();
  writeSitemap(pages, new Date().toISOString().slice(0, 10));
  syncVercel(pages);
  console.log(`built ${pages.length} pages: ${pages.map((p) => p.slug).join(', ')}`);
}

main();
