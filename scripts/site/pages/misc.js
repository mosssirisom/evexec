'use strict';

// Fleet, FAQ and quote pages. FAQ answers follow terms.html and how the
// booking system actually works (online card payment via Stripe, flight
// tracking on inbound airport pickups, driver messages on En Route / Arrived).

module.exports = ({ bookHref, quoteHref, BUSINESS, PRICES, RATING, gbp }) => {
  const groups = [
    {
      title: 'Booking',
      faqs: [
        { q: 'How far in advance should I book?', a: 'As soon as your plans are fixed. Early-morning airport runs and school-holiday dates are the first to go. The online form takes bookings from today onwards; for a pickup in the next few hours, call or WhatsApp us on 07721 070370 so we can check a car is free.' },
        { q: 'How do I book?', a: `For airport transfers, use the <a href="/#quote">booking form</a>: it takes about two minutes and gives you a reference straight away. For anything else, <a href="/quote">request a quote</a>, call ${BUSINESS.phone} or WhatsApp us.` },
        { q: 'When is my booking confirmed?', a: 'Once we have checked availability and confirmed by email, phone or WhatsApp. If you have not heard from us within a few hours, please call to check.' },
        { q: 'Can I book for someone else?', a: 'Yes. Put the passenger’s name and mobile number on the booking so the driver can contact them on the day. You can add your own details in the notes.' },
        { q: 'Can I book a return transfer?', a: 'Yes. Choose Return in the booking form and add the return date, time and flight number. A return costs less than two single journeys.' },
        { q: 'How do I check or change my booking?', a: 'Go to <a href="/booking">My Booking</a> with your reference and phone number, or contact us. Changes more than 24 hours before travel are free.' },
      ],
    },
    {
      title: 'Prices and payment',
      faqs: [
        { q: 'How much are your airport transfers?', a: `From anywhere on the Fylde Coast, one way: Manchester ${gbp(PRICES.manchester.oneWay)}, Liverpool ${gbp(PRICES.liverpool.oneWay)}, Leeds Bradford ${gbp(PRICES.leeds.oneWay)}, Birmingham ${gbp(PRICES.birmingham.oneWay)}, Newcastle ${gbp(PRICES.newcastle.oneWay)}. Prices cover up to four passengers and include airport drop-off and pickup charges.` },
        { q: 'Can I pay online?', a: 'Yes. Once your booking is confirmed you can pay securely online by card. You can also pay by bank transfer or in cash on the day.' },
        { q: 'Are there any extra charges?', a: 'Not for standard bookings. Extra charges only apply to things agreed with you in advance, such as pickups outside our area, excess luggage or long waiting beyond a reasonable flight delay.' },
        { q: 'What is your cancellation policy?', a: 'Cancel more than 24 hours before travel for a full refund or free rebooking. Between 2 and 24 hours, up to 50% of the fare may be charged. Under 2 hours or a no-show, the full fare is payable. Full details are in our <a href="/terms">terms</a>.' },
      ],
    },
    {
      title: 'Flights and airports',
      faqs: [
        { q: 'Do you monitor flights?', a: 'Yes, on every pickup from an airport. Add your inbound flight number when you book and we track it in real time.' },
        { q: 'What happens if my flight is delayed?', a: 'We move your pickup to the new landing time at no extra charge. If a delay runs into many hours, we will contact you to rearrange. Extended waiting is only charged if agreed with you first.' },
        { q: 'Where will my driver meet me at the airport?', a: 'We agree the meeting point with you when we confirm the booking, and your driver messages you when they have arrived. Take your time through passport control and baggage reclaim.' },
        { q: 'How early will you collect me for my flight?', a: 'It depends on the airport and the flight. For a European flight from Manchester we typically collect around three and a half hours before departure. We suggest a time when we confirm.' },
        { q: 'Which airports do you go to?', a: `Most often Manchester, Liverpool and Leeds Bradford, plus Birmingham and Newcastle at fixed prices. Heathrow, Gatwick, Stansted, Luton, Edinburgh and others are <a href="${quoteHref('airport')}">quoted on request</a>.` },
      ],
    },
    {
      title: 'Cars and luggage',
      faqs: [
        { q: 'What vehicles do you have?', a: 'A Tesla Model Y, a Tesla Model Y Juniper and a Škoda Enyaq. All are fully electric and take up to four passengers. See <a href="/fleet">our fleet</a>.' },
        { q: 'How much luggage can I bring?', a: 'Up to four medium to large suitcases plus cabin bags in the Teslas, and up to five in the Škoda Enyaq. For golf clubs, pushchairs or anything bulky, tell us when you book.' },
        { q: 'Do you provide child seats?', a: 'Tell us when you book if you are travelling with a child who needs a car or booster seat, and we will make arrangements where we can.' },
        { q: 'How many passengers can travel?', a: 'Up to four per car. For larger groups, ask about booking two cars.' },
      ],
    },
    {
      title: 'Services and areas',
      faqs: [
        { q: 'Do you operate outside Blackpool?', a: 'Yes. Our fixed prices cover all of Blackpool, Lytham St Annes, Poulton-le-Fylde, Fleetwood, Thornton-Cleveleys, Kirkham and Preston. Pickups further afield are quoted individually. See <a href="/areas">areas we cover</a>.' },
        { q: 'Do you provide corporate transfers?', a: 'Yes, including invoiced bookings for companies. See <a href="/corporate-travel">corporate and executive travel</a>.' },
        { q: 'Do you do journeys that are not to an airport?', a: 'Yes: <a href="/private-hire">private hire</a> around the North West, <a href="/long-distance-transfers">long-distance transfers</a> anywhere in the UK, and <a href="/event-transfers">event and concert transfers</a>.' },
        { q: 'Are your drivers licensed?', a: 'Yes. EV Exec is a licensed private hire operator with full hire and reward insurance, and every driver is enhanced DBS checked.' },
      ],
    },
  ];

  return [
    // ── Fleet ─────────────────────────────────────────────────────────────
    {
      slug: 'fleet',
      navKey: 'fleet',
      priority: '0.7',
      bookHref: bookHref(),
      title: 'Our Fleet | Tesla Model Y & Škoda Enyaq | EV Exec',
      description: 'EV Exec’s fully electric fleet: Tesla Model Y, Tesla Model Y Juniper and Škoda Enyaq. Up to four passengers and five suitcases, cleaned before every journey.',
      eyebrow: 'Our fleet',
      h1: 'A fully electric fleet, <span>kept immaculate</span>',
      crumb: 'Fleet',
      lead: 'Three premium electric cars, chosen for quiet, comfort and boot space rather than for the badge. Every journey is in a car that has been cleaned and checked since its last passenger.',
      hero: { media: { img: 'ev-exec-tesla-model-y-navy-1000', alt: 'EV Exec navy Tesla Model Y at night with an airport control tower behind', w: 1000, h: 787 } },
      service: { name: 'Electric executive car fleet', type: 'Airport transfer' },
      sections: [
        { type: 'fleet', eyebrow: 'The cars', title: 'Choose your car', intro: 'You can ask for a particular car when you book. We will always confirm which car is coming in your reminder, with its registration.' },
        {
          type: 'split', alt: true, img: 'ev-exec-image-4-1100', w: 824, h: 1100, alt: 'Rear passenger view inside an EV Exec Tesla, looking out to Blackpool Tower',
          eyebrow: 'On board', title: 'What every journey includes',
          html: `<ul class="checklist">
<li><strong>Quiet electric drive.</strong> No engine noise, no fumes, smooth acceleration.</li>
<li><strong>Climate set before you get in.</strong> Warm in winter, cool in summer.</li>
<li><strong>Phone charging</strong> by wireless pad and USB-C.</li>
<li><strong>Bottled water</strong> on every transfer.</li>
<li><strong>Help with luggage</strong> to and from the car.</li>
<li><strong>Cleaned before every journey,</strong> inside and out.</li>
</ul>`,
        },
        {
          type: 'cards', cols: 3, eyebrow: 'Why electric', title: 'Better than a traditional taxi',
          items: [
            { icon: 'leaf', title: 'Zero tailpipe emissions', text: 'A cleaner way to travel, especially on long airport runs.' },
            { icon: 'car', title: 'Calmer journeys', text: 'Smooth and quiet, so you can sleep, read or take a call.' },
            { icon: 'shield', title: 'Licensed and insured', text: 'Every car is licensed for private hire and fully insured for hire and reward.' },
          ],
        },
        { type: 'co2', eyebrow: 'Zero emissions travel', title: 'Your CO\u2082 saving', intro: 'Every EV Exec journey is fully electric. See roughly how much CO\u2082 you avoid compared with a typical petrol taxi.' },
        { type: 'cta', title: 'Book your transfer', text: 'Up to four passengers, fixed prices, flight monitoring included.' },
      ],
    },

    // ── FAQ ───────────────────────────────────────────────────────────────
    {
      slug: 'faq',
      navKey: '',
      priority: '0.7',
      bookHref: bookHref(),
      title: 'FAQ | Airport Transfers & Private Hire | EV Exec Blackpool',
      description: 'Answers about booking, prices, payment, flight delays, meeting points, luggage, child seats and the areas EV Exec covers across Blackpool and the Fylde Coast.',
      eyebrow: 'FAQ',
      h1: 'Questions, <span>answered</span>',
      crumb: 'FAQ',
      lead: `Everything customers usually ask before they book. Cannot find your answer? Call ${BUSINESS.phone} or WhatsApp us.`,
      sections: [
        ...groups.map((g, i) => ({ type: 'faq', alt: i % 2 === 1, eyebrow: ' ', title: g.title, faqs: g.faqs, more: false })),
        { type: 'cta', title: 'Ready to book?', text: 'Airport transfers book online in two minutes. Everything else, ask us for a quote.', secondary: { label: 'Get a quote', href: '/quote' } },
      ],
      faqs: groups.flatMap((g) => g.faqs),
    },

    // ── Quote ─────────────────────────────────────────────────────────────
    {
      slug: 'quote',
      priority: '0.6',
      bookHref: bookHref(),
      quoteService: '',
      title: 'Get a Quote | Private Hire & Transfers | EV Exec Blackpool',
      description: 'Request a fixed-price quote for private hire, corporate travel, long-distance journeys, events or airports not on our price list. We usually reply the same day.',
      eyebrow: 'Get a quote',
      h1: 'Request a <span>fixed-price quote</span>',
      crumb: 'Get a Quote',
      lead: `For journeys that are not on our airport price list. Tell us where and when, and we will reply with a fixed price. Booking a standard airport transfer? <a class="gold" href="/#quote">Book online instead</a>.`,
      hero: { primary: { label: 'Fill in the form', href: '#quote-form' }, secondary: { label: `Call ${BUSINESS.phone}`, href: `tel:${BUSINESS.phoneIntl}` } },
      sections: [
        { type: 'quoteForm', id: 'quote-form', eyebrow: 'Your journey', title: 'Tell us about your trip' },
      ],
    },

    // ── Prices ────────────────────────────────────────────────────────────
    {
      slug: 'prices',
      navKey: 'prices',
      priority: '0.9',
      bookHref: bookHref(),
      quoteService: 'airport',
      title: 'Airport Transfer Prices from Blackpool | EV Exec',
      description: `Fixed airport transfer prices from Blackpool and the Fylde Coast: Manchester ${gbp(PRICES.manchester.oneWay)}, Liverpool ${gbp(PRICES.liverpool.oneWay)}, Leeds Bradford ${gbp(PRICES.leeds.oneWay)}. Per car, airport charges included.`,
      eyebrow: 'Prices',
      h1: 'Fixed prices, <span>agreed before you travel</span>',
      crumb: 'Prices',
      lead: 'One price list for every pickup in Blackpool, Fylde, Wyre and Preston. The price you book is the price you pay.',
      service: {
        name: 'Airport transfers from Blackpool and the Fylde Coast', type: 'Airport transfer',
        offers: Object.values(PRICES).map((p) => ({ name: `${p.name}, one way`, price: p.oneWay })),
      },
      sections: [
        { type: 'prices', eyebrow: 'Airport transfers', title: 'Airport price list', intro: 'One way and return, per car, from any address on the Fylde Coast.' },
        {
          type: 'cards', id: 'how-pricing-works', cols: 3, eyebrow: 'How pricing works', title: 'What the price includes',
          items: [
            { icon: 'pound', title: 'Fixed, not metered', text: 'No meter, no surge pricing and nothing added for traffic. The price is agreed when you book.' },
            { icon: 'user', title: 'Per car, not per person', text: 'Each price covers up to four passengers with standard luggage. Bigger groups can book two cars.' },
            { icon: 'plane', title: 'Airport charges included', text: 'Drop-off and pickup charges at the airport are part of the price, as is waiting for a delayed flight.' },
            { icon: 'route', title: 'Returns cost less', text: 'Book both legs together and the return price is lower than two single journeys.' },
            { icon: 'card', title: 'Pay how you prefer', text: 'Securely online by card once your booking is confirmed, by bank transfer, or on the day.' },
            { icon: 'calendar', title: 'Free changes', text: 'Changes and cancellations more than 24 hours before travel are free. Full details are in our <a class="gold" href="/terms">terms</a>.' },
          ],
        },
        {
          type: 'prose', eyebrow: 'Anything else', title: 'Journeys not on the list',
          html: `<p>Other airports (Heathrow, Gatwick, Stansted, Luton, East Midlands, Edinburgh), <a href="/corporate-travel">corporate travel</a>, <a href="/private-hire">private hire</a>, <a href="/long-distance-transfers">long-distance</a> and <a href="/event-transfers">event</a> journeys, and pickups just outside our area are quoted individually. <a href="${quoteHref()}">Request a quote</a> and we reply with a fixed price, usually the same day.</p>
<p>Extra charges only ever apply to things agreed with you in advance, such as excess luggage or long waiting well beyond a reasonable flight delay.</p>`,
        },
        { type: 'faq' },
        { type: 'cta', title: 'Book at a fixed price', text: 'Airport transfers book online in about two minutes.', secondary: { label: 'Get a Quote', href: '/quote' } },
      ],
      faqs: [
        { q: 'Is the price per person or per car?', a: 'Per car. Each price covers up to four passengers with standard luggage.' },
        { q: 'Are airport parking or drop-off charges extra?', a: 'No. Airport drop-off and pickup charges are included in the price.' },
        { q: 'Do you charge more if my flight is delayed?', a: 'No. We track your flight and move your pickup at no extra charge. Only very long delays are rearranged with you, and extra waiting is never charged without your agreement.' },
      ],
    },

    // ── Reviews ───────────────────────────────────────────────────────────
    {
      slug: 'reviews',
      navKey: 'reviews',
      priority: '0.7',
      bookHref: bookHref(),
      title: `Reviews | ${RATING.value} on Google | EV Exec Blackpool`,
      description: `EV Exec is rated ${RATING.value} out of 5 from ${RATING.count} Google reviews. Read what customers say about our airport transfers from Blackpool and the Fylde Coast.`,
      eyebrow: 'Reviews',
      h1: `Rated ${RATING.value} <span>on Google</span>`,
      crumb: 'Reviews',
      lead: `Every published review of EV Exec is five stars: ${RATING.count} reviews on our Google Business Profile.`,
      sections: [
        { type: 'reviews', eyebrow: 'What customers say', title: 'Recent reviews', leave: true },
        {
          type: 'cards', cols: 3, eyebrow: 'Why customers trust us', title: 'Built on trust',
          intro: 'An independent, owner-run Fylde Coast business. When you call, you speak to us, not a call centre or a ride-hailing app.',
          items: [
            { icon: 'shield', title: 'Licensed and insured', text: 'A licensed private hire operator with full hire and reward insurance.' },
            { icon: 'user', title: 'Enhanced DBS-checked drivers', text: 'Every driver is enhanced DBS checked, polite, punctual and professional.' },
            { icon: 'star', title: 'Founder with 12+ years’ experience', text: 'Run by a founder who has been driving people for more than twelve years.' },
            { icon: 'plane', title: 'Flight tracking', text: 'Every airport pickup is tracked, so a delay never leaves you waiting.' },
            { icon: 'leaf', title: '100% electric fleet', text: 'Tesla Model Y, Model Y Juniper and Škoda Enyaq, cleaned before every journey.' },
            { icon: 'bell', title: 'Kept informed', text: 'Confirmation, a reminder with your driver and car, and a message when they set off.' },
          ],
        },
        { type: 'cta', title: 'Travel with us', text: 'Fixed prices and a driver who turns up.', secondary: { label: 'Get a Quote', href: '/quote' } },
      ],
    },
  ];
};
