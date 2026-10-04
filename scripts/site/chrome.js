'use strict';

// The one EV Exec site chrome: header (with dropdowns), full-screen mobile
// menu and footer. Modelled on the original homepage header (floating pill
// nav, gold underline links, gold gradient Book button, full-screen overlay
// menu with a gold close button) so every page looks like the same site.
//
// build.js writes it into the generated pages and injects it between
// <!-- evx:header --> / <!-- evx:footer --> markers in the hand-maintained
// pages (homepage, terms, privacy, blog, articles, my booking). Styles live in
// public/css/chrome.css, behaviour in public/js/site.js.

const { BUSINESS, RATING, AREAS } = require('./data');

const chevron = '<svg class="evx-chev" viewBox="0 0 24 24" aria-hidden="true"><path d="m6 9 6 6 6-6"/></svg>';
const userIcon = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM4 21c1.6-4 4.2-6 8-6s6.4 2 8 6"/></svg>';
const bolt = '<svg class="evx-btn-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M13 2 4 14h7l-1 8 9-12h-7l1-8z"/></svg>';

// Navigation structure (user-specified, 2026-10-03).
const MENU = [
  {
    key: 'services', label: 'Services', items: [
      { label: 'Airport Transfers', href: '/airport-transfers', sub: 'Fixed prices to every UK airport' },
      { label: 'Corporate Travel', href: '/corporate-travel', sub: 'Business and executive travel, invoiced' },
      { label: 'Private Hire', href: '/private-hire', sub: 'Pre-booked journeys across the North West' },
      { label: 'Event & Concert Transfers', href: '/event-transfers', sub: 'There and back, with the ride home booked' },
    ],
    more: { label: 'Long-distance transfers', href: '/long-distance-transfers' },
  },
  {
    key: 'prices', label: 'Prices', items: [
      { label: 'Prices', href: '/prices', sub: 'Fixed airport prices from the Fylde Coast' },
      { label: 'How Pricing Works', href: '/prices#how-pricing-works', sub: 'What is included, returns and payment' },
      { label: 'Get a Quote', href: '/quote', sub: 'For any journey not on the price list' },
    ],
  },
  { key: 'fleet', label: 'Fleet', href: '/fleet' },
  {
    key: 'areas', label: 'Areas', items: [
      { label: 'Blackpool', href: '/areas#blackpool', sub: 'Bispham, North Shore, South Shore, Marton' },
      { label: 'Fylde Coast', href: '/areas', sub: 'Every area we cover' },
      ...AREAS.filter((a) => a.slug).map((a) => ({ label: a.name, href: `/${a.slug}` })),
    ],
  },
  { key: 'reviews', label: 'Reviews', href: '/reviews' },
];

function header({ current = '', book = '/#quote' } = {}) {
  const items = MENU.map((m) => {
    const cur = m.key === current ? ' is-current' : '';
    if (m.href) return `<li><a class="evx-navlink${cur}" href="${m.href}"${cur ? ' aria-current="page"' : ''}>${m.label}</a></li>`;
    const links = m.items.map((i) => `<a href="${i.href}"><b>${i.label}</b>${i.sub ? `<span>${i.sub}</span>` : ''}</a>`).join('');
    const more = m.more ? `<a class="evx-dd-more" href="${m.more.href}">${m.more.label} →</a>` : '';
    return `<li class="evx-has-dd"><button class="evx-navlink${cur}" type="button" aria-expanded="false" aria-controls="evx-dd-${m.key}">${m.label}${chevron}</button><div class="evx-dd" id="evx-dd-${m.key}">${links}${more}</div></li>`;
  }).join('');
  return `<!-- evx:header -->
<header class="evx-header" id="siteHeader">
<nav class="evx-nav" aria-label="Main">
<a class="evx-brand" href="/" aria-label="EV Exec home"><img src="/public/images/opt/ev-exec-logo-160.jpg" alt="EV Exec logo" width="64" height="64" decoding="async"><span class="evx-brand-text"><span class="evx-brand-name">EV EXEC</span><span class="evx-brand-motto">Exclusive<i aria-hidden="true"></i>Executive<i aria-hidden="true"></i>Electric</span></span></a>
<ul class="evx-menu">${items}</ul>
<div class="evx-actions">
<a class="evx-phone" href="tel:${BUSINESS.phoneIntl}" aria-label="Call EV Exec on ${BUSINESS.phone}"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 4h4l2 5-2.5 1.5a11 11 0 0 0 5 5L15 13l5 2v4a2 2 0 0 1-2 2A16 16 0 0 1 3 6a2 2 0 0 1 2-2"/></svg>${BUSINESS.phone}</a>
<a class="evx-btn evx-btn-dark evx-hide-sm" href="/quote">Get a Quote</a>
<a class="evx-btn evx-btn-gold evx-hide-xs" href="${book}">Book Now</a>
<div class="evx-has-dd evx-account"><button class="evx-icon-btn" type="button" aria-label="Account and help" aria-expanded="false" aria-controls="evx-dd-account">${userIcon}</button>
<div class="evx-dd evx-dd-right" id="evx-dd-account"><a id="navSignInBtn" href="/account"><b>Sign in</b><span>Your bookings and privilege points</span></a><a id="navAccountBtn" href="/account" style="display:none"><b>My account</b></a><a href="/booking"><b>My booking</b><span>Check a booking with your reference</span></a><a id="navSupportBtn" href="/faq"><b>Help &amp; FAQ</b></a><a href="tel:${BUSINESS.phoneIntl}"><b>Call ${BUSINESS.phone}</b></a></div></div>
<button class="evx-menu-btn" id="menuToggle" type="button" aria-label="Open menu" aria-expanded="false" aria-controls="mobileMenu"><span id="menuToggleLabel">Menu</span></button>
</div>
</nav>
</header>
<div class="evx-mmenu" id="mobileMenu" role="dialog" aria-modal="true" aria-label="Navigation menu">
<div class="evx-mmenu-top"><button id="menuClose" type="button" aria-label="Close menu"><svg viewBox="0 0 18 18" aria-hidden="true"><path d="M1.5 1.5l15 15M16.5 1.5l-15 15"/></svg></button></div>
<nav class="evx-mmenu-links" aria-label="Mobile">
${MENU.map((m) => m.href
    ? `<a href="${m.href}">${m.label}</a>`
    : `<details><summary>${m.label}${chevron}</summary><div>${m.items.map((i) => `<a href="${i.href}">${i.label}</a>`).join('')}${m.more ? `<a href="${m.more.href}">${m.more.label}</a>` : ''}</div></details>`).join('\n')}
<a href="/booking">My Booking</a>
<a href="/faq" id="mobileSupportBtn">Help &amp; FAQ</a>
<a href="/account">Sign In</a>
</nav>
<div class="evx-mmenu-foot"><a class="evx-btn evx-btn-gold" href="${book}">Book Now</a><a class="evx-btn evx-btn-dark" href="/quote">Get a Quote</a><p class="evx-mmenu-contact"><a href="tel:${BUSINESS.phoneIntl}">Call ${BUSINESS.phone}</a><span aria-hidden="true">&middot;</span><a href="${BUSINESS.whatsapp}" target="_blank" rel="noopener">WhatsApp</a></p></div>
</div>
<!-- /evx:header -->`;
}

function footer() {
  const areas = AREAS.filter((a) => a.slug).map((a) => `<li><a href="/${a.slug}">${a.name}</a></li>`).join('');
  return `<!-- evx:footer -->
<footer class="evx-footer" id="contact">
<div class="evx-foot-grid">
<div class="evx-foot-brand">
<a class="evx-brand" href="/"><img src="/public/images/opt/ev-exec-logo-160.jpg" alt="EV Exec logo" width="56" height="56" loading="lazy"><span class="evx-brand-name evx-gold">EV EXEC</span></a>
<p>Premium airport transfers and private hire from Blackpool &amp; the Fylde Coast, in a fully electric fleet.</p>
<p class="evx-foot-rating"><a href="${BUSINESS.googleProfile}" target="_blank" rel="noopener"><span class="evx-stars" aria-hidden="true">★★★★★</span> ${RATING.value} on Google &middot; ${RATING.count} reviews</a></p>
<address class="evx-nap"><strong>EV Exec</strong><span>Serving Blackpool, Fylde &amp; Wyre</span><a href="tel:${BUSINESS.phoneIntl}">${BUSINESS.phone}</a><a href="mailto:${BUSINESS.email}">${BUSINESS.email}</a><a href="${BUSINESS.whatsapp}" target="_blank" rel="noopener">WhatsApp us</a></address>
</div>
<div><h2>Services</h2><ul><li><a href="/airport-transfers">Airport Transfers</a></li><li><a href="/corporate-travel">Corporate Travel</a></li><li><a href="/private-hire">Private Hire</a></li><li><a href="/event-transfers">Event &amp; Concert Transfers</a></li><li><a href="/long-distance-transfers">Long-Distance Transfers</a></li><li><a href="/fleet">Our Fleet</a></li></ul></div>
<div><h2>Airports &amp; Prices</h2><ul><li><a href="/manchester-airport-transfer-blackpool">Manchester Airport</a></li><li><a href="/liverpool-airport-transfer-blackpool">Liverpool Airport</a></li><li><a href="/leeds-bradford-airport-transfer-blackpool">Leeds Bradford Airport</a></li><li><a href="/prices">All prices</a></li><li><a href="/quote">Get a quote</a></li></ul></div>
<div><h2>Areas</h2><ul><li><a href="/areas#blackpool">Blackpool</a></li>${areas}<li><a href="/areas">All areas</a></li></ul></div>
</div>
<div class="evx-foot-base"><p>&copy; ${new Date().getFullYear()} EV Exec. Licensed private hire.</p><p><a href="/booking">My booking</a> &middot; <a href="/reviews">Reviews</a> &middot; <a href="/faq">FAQ</a> &middot; <a href="/blog">Travel guides</a> &middot; <a href="/terms">Terms</a> &middot; <a href="/privacy">Privacy</a></p></div>
</footer>
<!-- /evx:footer -->`;
}

function mobileCta({ book = '/#quote', bookLabel = 'Book Now', quote = '/quote', quoteLabel = 'Get a Quote' } = {}) {
  return `<!-- evx:cta -->
<div class="evx-mobile-cta" id="evxMobileCta"><a class="evx-btn evx-btn-gold" href="${book}">${bookLabel}</a><a class="evx-btn evx-btn-dark" href="${quote}">${quoteLabel}</a></div>
<!-- /evx:cta -->`;
}

const HEAD = '<link rel="stylesheet" href="/public/css/chrome.css">';
const SCRIPT = '<script defer src="/public/js/site.js"></script>';

module.exports = { header, footer, mobileCta, HEAD, SCRIPT, MENU, bolt };
