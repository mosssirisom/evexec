'use strict';

// Single source for business facts used across the generated pages and their
// structured data. Keep in line with lib/format.js PRICES (what the booking
// form charges), terms.html and the Google Business Profile.

const SITE = 'https://evexec.co.uk';

const BUSINESS = {
  name: 'EV Exec',
  tagline: 'Premium Airport Transfers & Private Hire',
  area: 'Blackpool & the Fylde Coast',
  phone: '07721 070370',
  phoneIntl: '+447721070370',
  email: 'book@evexec.co.uk',
  whatsapp: 'https://wa.me/447721070370',
  googleProfile: 'https://g.page/r/CVPMqDntIQ3xEAE',
  googleReview: 'https://g.page/r/CVPMqDntIQ3xEAE/review',
};

// Google rating as shown on the Business Profile (user-confirmed 2026-10-03).
// Update both numbers together when the profile changes.
const RATING = { value: '5.0', count: 18 };

// Real Google reviews already published on the homepage.
const REVIEWS = [
  { name: 'David S.', date: 'March 2025', text: 'Used Moss last week on a trip to Liverpool. Clean car, on time, everything went smoothly. Would recommend.' },
  { name: 'Matthew J.', date: 'February 2025', text: 'From booking to drop off, first class. Great price for the quality you get. Highly recommended.' },
  { name: 'Lynn V.', date: 'January 2025', text: 'Excellent service. On time, friendly and professional. Smooth journey, clean vehicle, great communication.' },
];

// Fixed prices from anywhere on the Fylde Coast (same as lib/format.js).
const PRICES = {
  manchester: { name: 'Manchester Airport', oneWay: 90, ret: 160, slug: 'manchester-airport-transfer-blackpool' },
  liverpool: { name: 'Liverpool John Lennon Airport', short: 'Liverpool Airport', oneWay: 95, ret: 170, slug: 'liverpool-airport-transfer-blackpool' },
  leeds: { name: 'Leeds Bradford Airport', oneWay: 135, ret: 250, slug: 'leeds-bradford-airport-transfer-blackpool' },
  birmingham: { name: 'Birmingham Airport', oneWay: 215, ret: 410, slug: 'airport-transfer-birmingham-blackpool' },
  newcastle: { name: 'Newcastle Airport', oneWay: 250, ret: 480 },
};

const FLEET = [
  {
    name: 'Tesla Model Y',
    img: 'ev-exec-tesla-model-y-navy-1000',
    alt: 'EV Exec navy Tesla Model Y at night with an airport control tower behind',
    pax: 4, cases: 4,
    points: ['Panoramic glass roof', 'Wireless and USB-C phone charging', 'Quiet, smooth electric drive', 'Climate set before you get in'],
  },
  {
    name: 'Tesla Model Y Juniper',
    img: 'ev-exec-tesla-model-y-juniper-1000',
    alt: 'EV Exec grey Tesla Model Y Juniper at night with an airport control tower behind',
    pax: 4, cases: 4,
    points: ['The refreshed Model Y', 'Rear-seat touchscreen for passengers', 'Quieter, more refined cabin', 'Wireless and USB-C charging'],
  },
  {
    name: 'Škoda Enyaq',
    img: 'ev-exec-skoda-enyaq-1000',
    alt: 'EV Exec blue Skoda Enyaq at night with an airport control tower behind',
    pax: 4, cases: 5,
    points: ['Room for five suitcases', 'Family-friendly and spacious', 'Generous rear legroom', 'Fully electric'],
  },
];

// Pickup towns with their own page. `slug` is the existing URL.
const AREAS = [
  { name: 'Blackpool', slug: '', note: 'Including Bispham, North Shore, South Shore and Marton' },
  { name: 'Lytham St Annes', slug: 'airport-transfer-lytham-st-annes' },
  { name: 'Poulton-le-Fylde', slug: 'airport-transfer-poulton-le-fylde' },
  { name: 'Thornton-Cleveleys', slug: 'airport-transfer-thornton-cleveleys' },
  { name: 'Fleetwood', slug: 'airport-transfer-fleetwood' },
  { name: 'Kirkham, Freckleton & Warton', slug: 'airport-transfer-kirkham' },
  { name: 'Preston', slug: 'airport-transfer-preston' },
];

const SERVICES = [
  { name: 'Airport Transfers', slug: 'airport-transfers', blurb: 'Fixed-price transfers to Manchester, Liverpool, Leeds Bradford and every other UK airport, with flight monitoring on your return.' },
  { name: 'Corporate & Executive Travel', slug: 'corporate-travel', blurb: 'Reliable, presentable travel for staff, clients and visiting executives, with invoices for your accounts team.' },
  { name: 'Private Hire', slug: 'private-hire', blurb: 'Pre-booked journeys around Lancashire and the North West: stations, hospitals, city centres and appointments.' },
  { name: 'Long-Distance Transfers', slug: 'long-distance-transfers', blurb: 'Door-to-door trips anywhere in the UK, quoted up front, in a quiet electric car built for motorway miles.' },
  { name: 'Event & Concert Transfers', slug: 'event-transfers', blurb: 'Gigs, matches, weddings and nights out, with a booked return so you are not queueing for a taxi at the end.' },
];

module.exports = { SITE, BUSINESS, RATING, REVIEWS, PRICES, FLEET, AREAS, SERVICES };
