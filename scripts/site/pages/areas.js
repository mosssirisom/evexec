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
      { type: 'prose', alt: true, eyebrow: 'Local pickups', title: t.localTitle, html: t.localHtml },
      {
        type: 'prices', keys: ['manchester', 'liverpool', 'leeds', 'birmingham', 'newcastle'], eyebrow: 'Fixed prices',
        title: `Airport transfer prices from ${t.short || t.name}`,
        intro: `The same fixed prices as everywhere on the Fylde Coast. ${t.priceNote || ''}`,
      },
      {
        type: 'cards', cols: 3, alt: true, eyebrow: 'What is included', title: 'Every booking includes',
        items: [
          { icon: 'plane', title: 'Flight monitoring', text: 'On your way home we track the flight and move your pickup if it lands early or late.' },
          { icon: 'bell', title: 'Updates as you travel', text: 'Booking confirmation, a reminder with your driver and car, and a message when your driver sets off.' },
          { icon: 'card', title: 'Flexible payment', text: 'Pay securely online by card, by bank transfer or on the day.' },
        ],
      },
      ...(t.extra ? [t.extra] : []),
      {
        type: 'links', eyebrow: 'Nearby', title: 'Other areas we cover',
        items: [{ label: 'Blackpool', href: '/' }, ...AREAS.filter((a) => a.slug && a.slug !== t.slug).map((a) => ({ label: a.name, href: `/${a.slug}` })), { label: 'All areas', href: '/areas' }],
      },
      { type: 'faq', alt: true },
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
      slug: 'airport-transfer-thornton-cleveleys',
      name: 'Thornton-Cleveleys', short: 'Thornton-Cleveleys', areas: ['Thornton-Cleveleys', 'Thornton', 'Cleveleys', 'Anchorsholme'],
      title: 'Thornton-Cleveleys Airport Transfers | Fixed Prices | EV Exec',
      description: `Airport transfers from Thornton, Cleveleys and Anchorsholme to Manchester (£${PRICES.manchester.oneWay}), Liverpool and Leeds Bradford. Fixed prices and flight monitoring.`,
      eyebrow: 'Thornton-Cleveleys · FY5',
      lead: 'Door-to-terminal transfers from Thornton, Cleveleys and Anchorsholme, at the same fixed price as Blackpool even though you are further up the coast.',
      times: ['about 70 min', 'about 75 min', 'about 2 hours'],
      routeNotes: [
        'Down the A585 to the M55, then the M6, M61 and M60. We allow for the A585 at peak times.',
        'A585 and M55 to the M6, then the M58 into south Liverpool.',
        'Across the Pennines; pickup times include a margin for weather.',
      ],
      localTitle: 'Thornton, Cleveleys and Anchorsholme',
      localHtml: `<p>We collect from the promenade end of Cleveleys, the streets around Victoria Road, and across Thornton out towards the Wyre. The A585 can be slow at rush hour, so for early flights we leave a little more margin than we would from central Blackpool.</p>
<p>Going away for longer than a week usually means more luggage. Let us know if you have more than four cases or anything bulky and we will send the right car. Help with bags to and from the car is always part of the service.</p>`,
      priceNote: 'There is no extra charge for being further up the coast.',
      faqs: [
        { q: 'How much is a transfer from Cleveleys to Manchester Airport?', a: `${gbp(PRICES.manchester.oneWay)} one way or ${gbp(PRICES.manchester.ret)} return, the same as from Blackpool.` },
        { q: 'Will the driver help with luggage?', a: 'Yes. Your driver loads and unloads your bags as standard.' },
        { q: 'How early will you collect me for a morning flight?', a: 'For a European flight from Manchester, usually around three and a half hours before departure. We confirm the exact time when we confirm your booking.' },
      ],
    }),
    town({
      slug: 'airport-transfer-fleetwood',
      name: 'Fleetwood', short: 'Fleetwood', areas: ['Fleetwood', 'Larkholme', 'Broadwater'],
      title: 'Fleetwood Airport Transfers | Manchester £90 Fixed | EV Exec',
      description: `Airport transfers from Fleetwood to Manchester (£${PRICES.manchester.oneWay}), Liverpool (£${PRICES.liverpool.oneWay}) and Leeds Bradford. Same fixed price as Blackpool, flight monitoring included.`,
      eyebrow: 'Fleetwood · FY7',
      lead: 'Fleetwood is the furthest point of the Fylde from the motorway, but our prices are the same as from Blackpool. Collected from your door, taken to your terminal.',
      times: ['about 75 min', 'about 80 min', 'about 2 hrs 10'],
      routeNotes: [
        'The full length of the A585 to the M55 first, then the M6, M61 and M60.',
        'A585 and M55, then the M6 and M58 into south Liverpool.',
        'The longest run from the Fylde; we plan it around traffic and weather.',
      ],
      localTitle: 'Collections across Fleetwood',
      localHtml: `<p>From the Mount and the seafront to Larkholme and Broadwater, we collect from every Fleetwood address. Because the A585 is the only main road out of the town, we leave extra time for early-morning pickups so a slow start on the Amounderness Way never puts your flight at risk.</p>
<p>Fleetwood is a long way from any airport by public transport, so it makes sense to book both legs together: out and home in one booking, with your return flight tracked. A return to Manchester is ${gbp(PRICES.manchester.ret)} for both journeys.</p>`,
      priceNote: `There is no Fleetwood surcharge: Manchester is ${gbp(PRICES.manchester.oneWay)} one way, the same as from Blackpool.`,
      faqs: [
        { q: 'How much is a taxi from Fleetwood to Manchester Airport?', a: `${gbp(PRICES.manchester.oneWay)} one way or ${gbp(PRICES.manchester.ret)} return, fixed. There is no extra charge for Fleetwood.` },
        { q: 'How long does it take to get from Fleetwood to Manchester Airport?', a: 'About an hour and a quarter outside rush hour. We add time for the A585 when we set your pickup.' },
        { q: 'Can I book the return journey at the same time?', a: 'Yes. Choose Return in the booking form and add your return flight. We track it and collect you when it lands.' },
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
    description: 'EV Exec covers Blackpool, Lytham St Annes, Poulton-le-Fylde, Thornton-Cleveleys, Fleetwood, Kirkham and Preston, with the same fixed airport prices everywhere.',
    eyebrow: 'Areas we cover',
    h1: 'Blackpool, the Fylde Coast <span>and Preston</span>',
    crumb: 'Areas',
    lead: 'We are a Fylde Coast business. Every pickup across Blackpool, Fylde, Wyre and Preston pays the same fixed airport price, whether you live on the seafront or the furthest village.',
    hero: { media: { img: 'ev-exec-image-6-1100', alt: 'EV Exec Tesla Model Y parked beneath Blackpool Tower at night', w: 828, h: 1100 } },
    service: { name: 'Airport transfers and private hire across Blackpool and the Fylde Coast', type: 'Airport transfer', areas: ['Blackpool', 'Lytham St Annes', 'Poulton-le-Fylde', 'Thornton-Cleveleys', 'Fleetwood', 'Kirkham', 'Freckleton', 'Warton', 'Preston'] },
    sections: [
      {
        type: 'links', eyebrow: 'Choose your area', title: 'Pickup areas',
        intro: 'Each page covers the neighbourhoods we collect from and typical journey times to each airport.',
        items: [{ label: 'Blackpool (incl. Bispham, North Shore, South Shore, Marton)', href: '/' }, ...AREAS.filter((a) => a.slug).map((a) => ({ label: a.name, href: `/${a.slug}` }))],
      },
      {
        type: 'prose', alt: true, eyebrow: 'Outside the area', title: 'Live further afield?',
        html: `<p>We can also collect from places just outside our area, such as Garstang, Knott End, Longridge, Chorley and Lancaster. These are priced individually because of the extra distance: <a href="${quoteHref('airport')}">ask for a quote</a> and you will get a fixed price before you book.</p>`,
      },
      { type: 'prices', eyebrow: 'Fixed prices', title: 'One price list for the whole Fylde Coast' },
      { type: 'cta', title: 'Book your transfer', text: 'Same fixed price from every town on the Fylde Coast.' },
    ],
  });

  return pages;
};
