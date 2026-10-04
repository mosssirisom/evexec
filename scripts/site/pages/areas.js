'use strict';

// Town pages. Each keeps its existing URL and covers what is actually local:
// which neighbourhoods we collect from, how the drive to each airport differs
// from that end of the Fylde, and the kind of trips people book from there.

module.exports = ({ bookHref, quoteHref, PRICES, AREAS, gbp }) => {
  const crumbs = [{ name: 'Areas', slug: 'areas' }];

  const town = (t) => ({
    slug: t.slug,
    crumbs,
    navKey: 'areas',
    priority: '0.8',
    quoteService: 'airport',
    bookHref: bookHref(),
    title: t.title,
    description: t.description,
    eyebrow: t.eyebrow,
    h1: `Airport transfers from <span>${t.name}</span>`,
    crumb: t.name,
    lead: t.lead,
    hero: {
      prices: [
        { value: gbp(PRICES.manchester.oneWay), label: 'Manchester' },
        { value: gbp(PRICES.liverpool.oneWay), label: 'Liverpool' },
        { value: gbp(PRICES.leeds.oneWay), label: 'Leeds Bradford' },
      ],
    },
    service: {
      name: `Airport transfers from ${t.name}`,
      type: 'Airport transfer',
      areas: t.areas,
      offers: [
        { name: `${t.name} to Manchester Airport`, price: PRICES.manchester.oneWay },
        { name: `${t.name} to Liverpool Airport`, price: PRICES.liverpool.oneWay },
        { name: `${t.name} to Leeds Bradford Airport`, price: PRICES.leeds.oneWay },
      ],
    },
    sections: [
      {
        type: 'cards', cols: 3, eyebrow: `From ${t.short || t.name}`, title: 'Typical journey times',
        intro: 'Door to terminal, outside rush hour. We build traffic into the pickup time we suggest.',
        items: [
          { icon: 'plane', title: `Manchester &middot; ${t.times[0]}`, text: t.routeNotes[0], href: '/manchester-airport-transfer-blackpool', more: 'Manchester Airport transfers' },
          { icon: 'plane', title: `Liverpool &middot; ${t.times[1]}`, text: t.routeNotes[1], href: '/liverpool-airport-transfer-blackpool', more: 'Liverpool Airport transfers' },
          { icon: 'plane', title: `Leeds Bradford &middot; ${t.times[2]}`, text: t.routeNotes[2], href: '/leeds-bradford-airport-transfer-blackpool', more: 'Leeds Bradford transfers' },
        ],
      },
      { type: 'prose', eyebrow: 'Local pickups', title: t.localTitle, html: `${t.localHtml}\n<p>${t.priceNote || 'Prices are the same as everywhere else on the Fylde Coast.'} <a href="/prices">See all prices</a>.</p>` },
      ...(t.extra ? [t.extra] : []),
      { type: 'faq' },
      { type: 'cta', title: `Book your airport transfer from ${t.short || t.name}`, text: 'Fixed price, collected from your door, flight tracked on the way home.' },
    ],
    faqs: t.faqs,
  });

  const pages = [
    town({
      slug: 'airport-transfer-lytham-st-annes',
      name: 'Lytham St Annes', short: 'Lytham St Annes', areas: ['Lytham St Annes', 'Lytham', 'St Annes', 'Ansdell', 'Fairhaven'],
      title: 'Lytham St Annes Airport Transfers | Fixed Prices | EV Exec',
      description: `Airport transfers from Lytham, St Annes, Ansdell and Fairhaven. Manchester Airport £${PRICES.manchester.oneWay}, Liverpool £${PRICES.liverpool.oneWay}. Fixed prices, flight monitoring, electric cars.`,
      eyebrow: 'Lytham St Annes · FY8',
      lead: 'Collections from every street in Lytham, St Annes, Ansdell and Fairhaven, taken door to terminal at a fixed price.',
      times: ['about 65 min', 'about 70 min', 'about 2 hours'],
      routeNotes: [
        'A short run out to the M55, then the usual route down the M6 and M61 towards the M60.',
        'Down the M6 and across on the M58. Often the calmer choice for an early start.',
        'Across the Pennines. We plan the route on the day around traffic and weather.',
      ],
      localTitle: 'Lytham, St Annes, Ansdell and Fairhaven',
      localHtml: `<p>We collect from homes, hotels and apartments right along the FY8 coast, from St Annes town centre and the seafront out to Lytham and the Green. Holiday lets and hotels are no problem; just give us the name and any access notes when you book.</p>
<p>Every car takes four passengers. If you are bringing golf clubs or more than four suitcases, say so when you book and we will send the <a href="/fleet">Škoda Enyaq</a>, which has room for five cases.</p>`,
      faqs: [
        { q: 'How much is a taxi from Lytham St Annes to Manchester Airport?', a: `EV Exec charges a fixed ${gbp(PRICES.manchester.oneWay)} one way or ${gbp(PRICES.manchester.ret)} return from anywhere in Lytham St Annes, for up to four passengers.` },
        { q: 'Do you collect from hotels and holiday lets in St Annes?', a: 'Yes. Add the hotel or property name in the address and any access notes, and your driver will meet you at the door or reception.' },
        { q: 'Can you take golf clubs?', a: 'Yes, with notice. Tell us when you book how many bags you have so we can send a car with enough room.' },
      ],
    }),
    town({
      slug: 'airport-transfer-poulton-le-fylde',
      name: 'Poulton-le-Fylde', short: 'Poulton', areas: ['Poulton-le-Fylde', 'Carleton', 'Singleton', 'Hardhorn'],
      title: 'Poulton-le-Fylde Airport Transfers | Fixed Prices | EV Exec',
      description: `Airport transfers from Poulton-le-Fylde, Carleton and Singleton. Manchester Airport £${PRICES.manchester.oneWay}, Liverpool £${PRICES.liverpool.oneWay}, Leeds Bradford £${PRICES.leeds.oneWay}. Fixed prices.`,
      eyebrow: 'Poulton-le-Fylde · FY6',
      lead: 'Poulton sits right by the A585 and the M55, which makes it one of the quickest places on the Fylde to get away from. We collect from the town, Carleton, Hardhorn and Singleton.',
      times: ['about 60 min', 'about 70 min', 'about 1 hr 50'],
      routeNotes: [
        'Onto the M55 within minutes, then the M6, M61 and M60.',
        'M55 and M6 south, then the M58 across towards Speke.',
        'East over the Pennines, timed around traffic and weather on the day.',
      ],
      localTitle: 'Poulton, Carleton, Hardhorn and Singleton',
      localHtml: `<p>From the market town centre to the newer estates around Hardhorn and Carleton, and the villages out towards Singleton, the price is the same fixed fare as the rest of the Fylde.</p>
<p>Poulton has its own railway station, so it is fair to ask whether the train is cheaper. For one person travelling light it can be. For two or more with luggage, a door-to-terminal transfer often works out at a similar cost, without carrying cases to the station for an early flight. If you are flying on business, our <a href="/corporate-travel">corporate travel</a> page covers invoicing.</p>`,
      faqs: [
        { q: 'How much is a transfer from Poulton-le-Fylde to Manchester Airport?', a: `${gbp(PRICES.manchester.oneWay)} one way or ${gbp(PRICES.manchester.ret)} return, fixed, for up to four passengers.` },
        { q: 'Do you cover Singleton and Hardhorn?', a: 'Yes, at the same price as Poulton town centre.' },
        { q: 'Is it cheaper than the train from Poulton?', a: 'For one passenger it may not be. For two or more people with luggage, a transfer is often similar in cost and takes you from your door to the terminal.' },
      ],
    }),
    town({
      slug: 'airport-transfer-fleetwood',
      name: 'Fleetwood & Thornton-Cleveleys', short: 'Fleetwood & Cleveleys', areas: ['Fleetwood', 'Larkholme', 'Broadwater', 'Thornton-Cleveleys', 'Thornton', 'Cleveleys', 'Anchorsholme'],
      title: 'Fleetwood & Cleveleys Airport Transfers | EV Exec',
      description: `Airport transfers from Fleetwood, Thornton, Cleveleys and Anchorsholme. Manchester £${PRICES.manchester.oneWay}, Liverpool £${PRICES.liverpool.oneWay}. Same fixed price as Blackpool, flight monitoring included.`,
      eyebrow: 'Fleetwood & Thornton-Cleveleys · FY5 / FY7',
      lead: 'The top of the Fylde is the furthest point from the motorway, but our prices are the same as from Blackpool. Collected from your door in Fleetwood, Thornton, Cleveleys or Anchorsholme and taken to your terminal.',
      times: ['70 to 75 min', '75 to 80 min', 'about 2 hours'],
      routeNotes: [
        'Down the A585 to the M55, then the M6, M61 and M60. We allow for the A585 at peak times.',
        'A585 and M55 to the M6, then the M58 into south Liverpool.',
        'The longest run from the Fylde; we plan it around traffic and weather on the day.',
      ],
      localTitle: 'Fleetwood, Thornton, Cleveleys and Anchorsholme',
      localHtml: `<p>From the Mount and the seafront in Fleetwood to Larkholme and Broadwater, and from the promenade end of Cleveleys across Thornton and Anchorsholme, we collect from every address.</p>
<p>The A585 is the only main road out, so for early flights we leave a little more margin than we would from central Blackpool. A slow start on the Amounderness Way should never put your flight at risk.</p>
<p>Public transport to any airport is a long trip from here, so it makes sense to book both legs together: out and home in one booking, with your return flight tracked. A return to Manchester is ${gbp(PRICES.manchester.ret)} for both journeys.</p>`,
      priceNote: `There is no extra charge for being further up the coast: Manchester is ${gbp(PRICES.manchester.oneWay)} one way, the same as from Blackpool.`,
      faqs: [
        { q: 'How much is a taxi from Fleetwood or Cleveleys to Manchester Airport?', a: `${gbp(PRICES.manchester.oneWay)} one way or ${gbp(PRICES.manchester.ret)} return, fixed, for up to four passengers. There is no extra charge for Fleetwood or Thornton-Cleveleys.` },
        { q: 'How long does it take to get to Manchester Airport from here?', a: 'About an hour and a quarter outside rush hour. We add time for the A585 when we set your pickup.' },
      ],
    }),
    town({
      slug: 'airport-transfer-kirkham',
      name: 'Kirkham, Freckleton & Warton', short: 'Kirkham', areas: ['Kirkham', 'Wesham', 'Freckleton', 'Warton', 'Elswick', 'Wrea Green'],
      title: 'Kirkham, Freckleton & Warton Airport Transfers | EV Exec',
      description: `Airport transfers from Kirkham, Wesham, Freckleton, Warton and Wrea Green. Manchester Airport £${PRICES.manchester.oneWay}, Liverpool £${PRICES.liverpool.oneWay}. Fixed prices, flight monitoring.`,
      eyebrow: 'Kirkham, Freckleton & Warton · PR4',
      lead: 'The PR4 villages are the closest part of the Fylde to the motorway, so you are on the M55 within minutes. Fixed-price airport transfers from Kirkham, Wesham, Freckleton, Warton, Elswick and Wrea Green.',
      times: ['about 55 min', 'about 60 min', 'about 1 hr 45'],
      routeNotes: [
        'Onto the M55 at Junction 3, then the M6, M61 and M60.',
        'M55 to the M6, then across on the M58.',
        'East over the Pennines, planned around traffic and weather.',
      ],
      localTitle: 'Kirkham, Wesham, Freckleton, Warton and nearby villages',
      localHtml: `<p>We collect across the rural Fylde: Kirkham and Wesham, Freckleton and Warton along the estuary, and the villages of Elswick, Wrea Green and Treales. The fare is the same as from Blackpool.</p>
<p>Warton is also home to a large aerospace site. If you are working there or visiting, we can take you to and from the airports, hotels and Preston station, and our <a href="/corporate-travel">corporate travel</a> service can invoice your company directly.</p>`,
      extra: {
        type: 'cards', cols: 2, eyebrow: 'Business travel', title: 'Working at or visiting Warton?',
        items: [
          { icon: 'briefcase', title: 'Corporate travel', text: 'Airport runs for staff and visitors, invoiced to your company.', href: '/corporate-travel', more: 'Corporate travel' },
          { icon: 'route', title: 'Private hire', text: 'Preston station, hotels and meetings across the North West.', href: '/private-hire', more: 'Private hire' },
        ],
      },
      faqs: [
        { q: 'How much is a transfer from Kirkham to Manchester Airport?', a: `${gbp(PRICES.manchester.oneWay)} one way or ${gbp(PRICES.manchester.ret)} return, fixed, from anywhere in Kirkham, Wesham, Freckleton or Warton.` },
        { q: 'Do you cover Wrea Green, Elswick and Treales?', a: 'Yes, at the same fixed price.' },
        { q: 'Can my company be invoiced for staff transfers?', a: 'Yes. See our corporate travel page or call us to set up invoiced bookings.' },
      ],
    }),
    town({
      slug: 'airport-transfer-preston',
      name: 'Preston', short: 'Preston', areas: ['Preston', 'Fulwood', 'Penwortham', 'Ashton-on-Ribble', 'Broughton'],
      title: 'Preston Airport Transfers | Manchester £90 Fixed | EV Exec',
      description: `Airport transfers from Preston, Fulwood and Penwortham to Manchester (£${PRICES.manchester.oneWay}), Liverpool (£${PRICES.liverpool.oneWay}) and Leeds Bradford. Fixed prices, electric cars.`,
      eyebrow: 'Preston · PR1 to PR5',
      lead: 'Preston is already on the M6, so it has the quickest run of anywhere we cover to Manchester and Liverpool. We collect across the city, from Fulwood and Broughton to Penwortham.',
      times: ['about 50 min', 'about 55 min', 'about 1 hr 40'],
      routeNotes: [
        'Straight onto the M6 and M61, then the M60 to the airport.',
        'M6 south and the M58 into south Liverpool.',
        'East over the Pennines, or round via the M62, depending on the day.',
      ],
      localTitle: 'Collections across Preston',
      localHtml: `<p>From the city centre, the university and the station to Fulwood, Broughton, Ashton-on-Ribble and Penwortham, we pick up at your door. Student halls, hotels and offices are all fine: give us the building name and any access details.</p>
<p>Being based on the Fylde, we drive into Preston for your pickup, which is why the fare matches the rest of our area rather than being cheaper. What you get for it is a booked car that turns up, a fixed price and a driver who watches your flight home.</p>`,
      extra: {
        type: 'cards', cols: 2, eyebrow: 'More from Preston', title: 'Not flying?',
        items: [
          { icon: 'route', title: 'Private hire', text: 'Pre-booked journeys to stations, hospitals and city centres across the North West.', href: '/private-hire', more: 'Private hire' },
          { icon: 'calendar', title: 'Long-distance transfers', text: 'London, Edinburgh, the Lakes or anywhere else in the UK, quoted up front.', href: '/long-distance-transfers', more: 'Long-distance transfers' },
        ],
      },
      faqs: [
        { q: 'How much is a taxi from Preston to Manchester Airport?', a: `EV Exec charges a fixed ${gbp(PRICES.manchester.oneWay)} one way or ${gbp(PRICES.manchester.ret)} return from anywhere in Preston, for up to four passengers.` },
        { q: 'How long is the drive from Preston to Manchester Airport?', a: 'About 50 minutes outside rush hour, longer on weekday mornings.' },
        { q: 'Do you pick up from Preston railway station?', a: 'Yes. Give us your train time and we will meet you at the station.' },
      ],
    }),
  ];

  // Areas hub
  pages.push({
    slug: 'areas',
    navKey: 'areas',
    priority: '0.8',
    quoteService: 'airport',
    bookHref: bookHref(),
    title: 'Areas We Cover | Blackpool, Fylde, Wyre & Preston | EV Exec',
    description: 'EV Exec covers Blackpool, Lytham St Annes, Poulton-le-Fylde, Fleetwood, Thornton-Cleveleys, Kirkham and Preston, with the same fixed airport prices everywhere.',
    eyebrow: 'Areas we cover',
    h1: 'Blackpool, the Fylde Coast <span>and Preston</span>',
    crumb: 'Areas',
    lead: 'We are a Fylde Coast business. Every pickup across Blackpool, Fylde, Wyre and Preston pays the same fixed airport price, whether you live on the seafront or the furthest village.',
    hero: { media: { img: 'ev-exec-image-6-1100', alt: 'EV Exec Tesla Model Y parked beneath Blackpool Tower at night', w: 828, h: 1100 } },
    service: { name: 'Airport transfers and private hire across Blackpool and the Fylde Coast', type: 'Airport transfer', areas: ['Blackpool', 'Lytham St Annes', 'Poulton-le-Fylde', 'Thornton-Cleveleys', 'Fleetwood', 'Kirkham', 'Freckleton', 'Warton', 'Preston'] },
    sections: [
      {
        type: 'cards', id: 'blackpool', cols: 3, eyebrow: 'Blackpool · FY1 to FY4', title: 'Airport transfers from Blackpool',
        intro: 'Blackpool is home. We collect from every part of town, including Bispham, North Shore, the town centre, South Shore, Marton, Layton and Squires Gate, and the price is the same fixed fare as the rest of the Fylde Coast.',
        items: [
          { icon: 'plane', title: 'Manchester &middot; about 1 hour', text: 'M55, M6, M61 and M60 to the terminal. Our busiest route.', href: '/manchester-airport-transfer-blackpool', more: 'Manchester Airport transfers' },
          { icon: 'plane', title: 'Liverpool &middot; about 70 min', text: 'M55 and M6 south, then the M58 across to Speke.', href: '/liverpool-airport-transfer-blackpool', more: 'Liverpool Airport transfers' },
          { icon: 'plane', title: 'Leeds Bradford &middot; about 2 hours', text: 'East over the Pennines, planned around traffic and weather.', href: '/leeds-bradford-airport-transfer-blackpool', more: 'Leeds Bradford transfers' },
        ],
      },
      {
        type: 'links', eyebrow: 'Fylde Coast', title: 'Other pickup areas',
        intro: 'Each page covers the neighbourhoods we collect from and typical journey times to each airport.',
        items: [...AREAS.filter((a) => a.slug).map((a) => ({ label: a.name, href: `/${a.slug}` }))],
      },
      { type: 'priceStrip', text: 'One price list for the whole Fylde Coast: Blackpool, Fylde, Wyre and Preston all pay the same fixed fare.' },
      {
        type: 'map', eyebrow: 'Outside the area', title: 'Live further afield?',
        html: `<p>We can also collect from places just outside our area, such as Garstang, Knott End, Longridge, Chorley and Lancaster. These are priced individually because of the extra distance: <a href="${quoteHref('airport')}">ask for a quote</a> and you will get a fixed price before you book.</p>`,
      },
      { type: 'cta', title: 'Book your transfer', text: 'Same fixed price from every town on the Fylde Coast.' },
    ],
  });

  return pages;
};
