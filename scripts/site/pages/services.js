'use strict';

// Non-airport services. The online booking form is airport-only, so these
// pages lead with "Get a quote" (the quote form at /quote) and a phone call.

module.exports = ({ bookHref, quoteHref, BUSINESS, PRICES, gbp }) => {
  const callBtn = { label: `Call ${BUSINESS.phone}`, href: `tel:${BUSINESS.phoneIntl}` };
  const servicePage = (p) => ({
    priority: '0.8',
    bookHref: quoteHref(p.quoteService),
    ...p,
    hero: { primary: { label: 'Get a Quote', href: quoteHref(p.quoteService) }, secondary: callBtn, ...(p.hero || {}) },
  });
  // Short cross-links only: the full descriptions live on each service page.
  const otherServices = (skip) => ({
    type: 'links', eyebrow: 'Other services', title: 'Also from EV Exec',
    items: [
      { label: 'Airport transfers', href: '/airport-transfers', tag: `from ${gbp(PRICES.manchester.oneWay)}` },
      { label: 'Corporate travel', href: '/corporate-travel' },
      { label: 'Private hire', href: '/private-hire' },
      { label: 'Long-distance transfers', href: '/long-distance-transfers' },
      { label: 'Event & concert transfers', href: '/event-transfers' },
    ].filter((c) => c.href !== `/${skip}`),
  });

  return [
    // ── Corporate ─────────────────────────────────────────────────────────
    servicePage({
      slug: 'corporate-travel',
      navKey: 'services',
      quoteService: 'corporate',
      title: 'Corporate & Executive Travel, Blackpool & Fylde | EV Exec',
      description: 'Executive car travel for Fylde Coast businesses: airport runs, client pickups, station transfers and meetings across the North West, invoiced to your company.',
      eyebrow: 'Corporate & executive travel',
      h1: 'Business travel that <span>reflects well on you</span>',
      crumb: 'Corporate Travel',
      lead: 'For Fylde Coast companies sending staff to the airport, collecting clients from the station, or getting a team to a meeting in Manchester. Presentable electric cars, licensed drivers and one invoice for your accounts team.',
      hero: { media: { img: 'ev-exec-image-2-1100', alt: 'Interior of an EV Exec Tesla with Blackpool Tower visible ahead', w: 880, h: 783 } },
      service: { name: 'Corporate and executive car travel', type: 'Corporate travel', areas: ['Blackpool', 'Fylde', 'Wyre', 'Preston', 'North West England'] },
      sections: [
        {
          type: 'cards', cols: 3, eyebrow: 'Who it is for', title: 'Typical business journeys',
          items: [
            { icon: 'plane', title: 'Staff airport transfers', text: `Early flights and late returns, with the flight tracked so nobody waits. Fixed airport prices, from ${gbp(PRICES.manchester.oneWay)} to Manchester.` },
            { icon: 'user', title: 'Visiting clients and executives', text: 'Met at Preston station or the airport and brought to your office, in a car that makes the right first impression.' },
            { icon: 'route', title: 'Meetings and site visits', text: 'Manchester, Liverpool, Leeds and further. Work, call or rest on the way instead of driving.' },
          ],
        },
        {
          type: 'split', flip: true, img: 'ev-exec-image-4-1100', w: 824, h: 1100, alt: 'Rear seats and screens inside an EV Exec Tesla Model Y',
          eyebrow: 'The experience', title: 'A car you can work in',
          html: `<p>Our Tesla Model Y and Škoda Enyaq cars are quiet enough to take a call, with phone charging for every seat and climate set before your passenger gets in. Cars are cleaned before every journey and drivers are smartly presented.</p>
<p>Every car is fully electric, with zero tailpipe emissions on every business journey.</p>
<ul class="checklist"><li><strong>Licensed private hire</strong> with full hire and reward insurance</li><li><strong>Enhanced DBS-checked</strong> drivers</li><li><strong>Booking confirmations and reminders</strong> by email, with the driver and car registration</li></ul>`,
        },
        {
          type: 'cards', cols: 2, alt: true, eyebrow: 'Billing', title: 'Simple for your accounts team',
          items: [
            { icon: 'card', title: 'Invoiced bookings', text: 'We can invoice your company instead of the traveller paying on the day. Invoices are emailed with clear journey details and payment terms.' },
            { icon: 'briefcase', title: 'Receipts after every trip', text: 'A receipt can be sent to a company email address after each completed journey, including any agreed extras such as parking.' },
            { icon: 'pound', title: 'Prices agreed in advance', text: 'Airport routes use our fixed price list. Everything else is quoted before you book, so there are no surprises on the invoice.' },
            { icon: 'phone', title: 'One number to call', text: `Booking, changes and questions all go to the same team on ${BUSINESS.phone}, not a call centre.` },
          ],
        },
        {
          type: 'steps', eyebrow: 'Getting started', title: 'Setting up business travel',
          items: [
            { title: 'Tell us what you need', text: 'Request a quote or call us with the journeys you make and how you would like to be billed.' },
            { title: 'We confirm prices and invoicing', text: 'Fixed airport prices, and quotes for any regular routes, agreed before the first trip.' },
            { title: 'Book as you need', text: 'Book online for airport runs, or by phone, WhatsApp or email for everything else.' },
          ],
        },
        otherServices('corporate-travel'),
        { type: 'faq', alt: true },
        { type: 'cta', title: 'Talk to us about business travel', text: 'Tell us the journeys you make and we will come back with prices and invoicing options.', primary: { label: 'Get a Quote', href: quoteHref('corporate') } },
      ],
      faqs: [
        { q: 'Can you invoice our company rather than the passenger paying?', a: 'Yes. Tell us when you request a quote and we will agree invoicing with you before the first journey.' },
        { q: 'Do you provide executive airport transfers?', a: `Yes. Our airport transfers use the same fixed prices for business travellers, from ${gbp(PRICES.manchester.oneWay)} to Manchester Airport, with flight tracking on the way home.` },
        { q: 'Can we book for a visitor who is not on our staff?', a: 'Yes. Book in your company’s name and give us the passenger’s name and mobile number so the driver can reach them.' },
        { q: 'Do you cover journeys outside the Fylde Coast?', a: 'Yes. We quote for meetings and site visits in Manchester, Liverpool, Leeds and beyond. Pickups outside our usual area are priced individually.' },
      ],
    }),

    // ── Private hire ──────────────────────────────────────────────────────
    servicePage({
      slug: 'private-hire',
      navKey: 'services',
      quoteService: 'private-hire',
      title: 'Private Hire in Blackpool & the Fylde Coast | EV Exec',
      description: 'Pre-booked private hire from Blackpool and the Fylde Coast to stations, hospitals, city centres and appointments across the North West, in quiet electric cars.',
      eyebrow: 'Private hire',
      h1: 'Pre-booked private hire <span>across the North West</span>',
      crumb: 'Private Hire',
      lead: 'When the journey matters and you do not want to wait on a taxi app. Book ahead, get a fixed price, and your car arrives at the time you agreed.',
      hero: { media: { img: 'ev-exec-image-6-1100', alt: 'EV Exec Tesla Model Y on Blackpool promenade beneath the Tower at night', w: 828, h: 1100 } },
      service: { name: 'Private hire', type: 'Private hire', areas: ['Blackpool', 'Fylde', 'Wyre', 'Preston', 'Lancashire'] },
      sections: [
        {
          type: 'cards', cols: 3, eyebrow: 'Where people go', title: 'Journeys we are booked for',
          items: [
            { icon: 'route', title: 'Train stations', text: 'Preston for the West Coast Main Line, Manchester Piccadilly and Liverpool Lime Street, timed to your train.' },
            { icon: 'shield', title: 'Hospital appointments', text: 'Blackpool Victoria, Royal Preston and the Manchester and Liverpool specialist hospitals. We can wait or come back for you.' },
            { icon: 'map', title: 'Cities and days out', text: 'Shopping, theatre or a meal in Manchester or Liverpool, with the journey home booked.' },
            { icon: 'case', title: 'Hotels and cruise terminals', text: 'Liverpool’s cruise terminal, hotels across the region and visits to family.' },
            { icon: 'user', title: 'Collecting someone', text: 'Book for a parent, friend or visitor. We contact them directly on the day.' },
            { icon: 'calendar', title: 'Regular journeys', text: 'Weekly appointments or commutes, booked in advance at an agreed price.' },
          ],
        },
        {
          type: 'prose', alt: true, eyebrow: 'How it differs from a taxi', title: 'Booked, not hailed',
          html: `<p>EV Exec is a licensed private hire service, so every journey is booked in advance. We do not sit on a rank or take street hails, which means the car you booked is not halfway through someone else’s fare when you need it.</p>
<p>You get a fixed price before you travel, not a meter. Your driver messages you when they set off and when they arrive, and you travel in a clean, quiet electric car rather than whatever turns up.</p>`,
        },
        {
          type: 'steps', eyebrow: 'Booking', title: 'How to book private hire',
          items: [
            { title: 'Ask for a price', text: 'Use the quote form, call or WhatsApp us with where, when and how many of you.' },
            { title: 'Confirm', text: 'We reply with a fixed price, usually the same day. Say yes and it is booked.' },
            { title: 'Travel', text: 'We collect you from your door at the agreed time. Pay online by card, by bank transfer or on the day.' },
          ],
        },
        { type: 'fleetMini', text: 'Every car takes up to 4 passengers. If you need help getting in and out, let us know and your driver will allow extra time.' },
        otherServices('private-hire'),
        { type: 'faq' },
        { type: 'cta', title: 'Get a price for your journey', text: 'Tell us where and when, and we will reply with a fixed price.', primary: { label: 'Get a Quote', href: quoteHref('private-hire') } },
      ],
      faqs: [
        { q: 'How much does private hire cost?', a: 'It depends on distance and timing, so every journey is quoted individually before you book. The price you accept is the price you pay.' },
        { q: 'Can I book a car for someone else?', a: 'Yes. Give us their name and mobile number, and we will contact them directly on the day.' },
        { q: 'Can you wait while I am at an appointment?', a: 'Yes. Tell us roughly how long you expect to be and we will include waiting or a return pickup in your quote.' },
        { q: 'Do you take same-day bookings?', a: 'If a car is free, yes. Call or WhatsApp us for anything in the next few hours.' },
      ],
    }),

    // ── Long distance ─────────────────────────────────────────────────────
    servicePage({
      slug: 'long-distance-transfers',
      navKey: 'services',
      quoteService: 'long-distance',
      title: 'Long-Distance Transfers from Blackpool & Fylde | EV Exec',
      description: 'Door-to-door long-distance transfers from Blackpool and the Fylde Coast to London, Scotland, cruise ports and anywhere in the UK. Fixed quote before you book.',
      eyebrow: 'Long-distance transfers',
      h1: 'Long-distance journeys, <span>door to door</span>',
      crumb: 'Long-Distance Transfers',
      lead: 'London, Edinburgh, the Lake District, cruise ports or a family visit at the other end of the country. One fixed price, collected from your door and dropped at theirs.',
      service: { name: 'Long-distance private transfers', type: 'Long-distance transfer', areas: ['United Kingdom'] },
      sections: [
        {
          type: 'cards', cols: 3, eyebrow: 'Where to', title: 'Journeys worth doing by car',
          items: [
            { icon: 'route', title: 'London and the South', text: 'Avoid the train change and the Underground with a full suitcase. Straight to your hotel or address.' },
            { icon: 'route', title: 'Scotland and the Lakes', text: 'Edinburgh, Glasgow, Windermere or Keswick, watching the scenery instead of driving the M6 yourself.' },
            { icon: 'case', title: 'Cruise ports', text: 'Southampton, Liverpool and other ports, with all the luggage a cruise needs in the boot.' },
          ],
        },
        {
          type: 'split', img: 'ev-exec-image-4-1100', w: 824, h: 1100, alt: 'Back seats of an EV Exec Tesla Model Y with passenger screens',
          eyebrow: 'Comfort on long trips', title: 'Built for motorway miles',
          html: `<p>Electric cars are at their best on a long run: quiet at speed, smooth, and with no engine noise to tire you out. Climate control, phone charging for every seat and plenty of legroom make a four-hour trip feel shorter.</p>
<p><strong>Charging, planned in advance.</strong> On longer journeys we plan a short charging stop at a motorway services, which doubles as a break for coffee and the toilet. We build it into your timings and tell you when we confirm, so it is never a surprise.</p>`,
        },
        {
          type: 'cards', cols: 3, alt: true, eyebrow: 'Pricing', title: 'How long-distance prices work',
          items: [
            { icon: 'pound', title: 'Quoted per journey', text: 'Based on distance and timing, agreed in writing before you book.' },
            { icon: 'user', title: 'Per car, not per person', text: 'Up to four passengers for the same price, which often beats four train tickets.' },
            { icon: 'card', title: 'Paying', text: 'Card online, bank transfer or cash. For long journeys we may ask for some or all of the fare in advance.' },
          ],
        },
        otherServices('long-distance-transfers'),
        { type: 'faq' },
        { type: 'cta', title: 'Get a long-distance quote', text: 'Tell us where you are going and when. We reply with a fixed price.', primary: { label: 'Get a Quote', href: quoteHref('long-distance') } },
      ],
      faqs: [
        { q: 'How far will you travel?', a: 'Anywhere on the UK mainland. Send us the pickup and destination and we will quote.' },
        { q: 'Will we need to stop to charge the car?', a: 'On the longest journeys, yes: usually one short stop at a motorway services, planned in advance and included in the timings we give you.' },
        { q: 'Do I need to pay in advance?', a: 'For long-distance or high-value journeys we may ask for full or part payment before travel. We will tell you when we quote.' },
      ],
    }),

    // ── Events ────────────────────────────────────────────────────────────
    servicePage({
      slug: 'event-transfers',
      navKey: 'services',
      quoteService: 'event',
      title: 'Event, Concert & Wedding Transfers | Blackpool | EV Exec',
      description: 'Pre-booked transfers to concerts, football, weddings and nights out from Blackpool and the Fylde Coast, with your journey home arranged before you go.',
      eyebrow: 'Events & concerts',
      h1: 'Get there and home again, <span>without the taxi queue</span>',
      crumb: 'Event Transfers',
      lead: 'Concerts in Manchester, the match at Anfield or Bloomfield Road, a wedding at a country venue or a night out in Liverpool. We take you there and bring you home at the time you agreed.',
      service: { name: 'Event and concert transfers', type: 'Event transfer', areas: ['Blackpool', 'Fylde', 'Wyre', 'Preston', 'Manchester', 'Liverpool'] },
      sections: [
        {
          type: 'cards', cols: 3, eyebrow: 'Where we go', title: 'Events people book us for',
          items: [
            { icon: 'music', title: 'Concerts and shows', text: 'Manchester’s arenas, Liverpool’s waterfront venues, and the Winter Gardens and Opera House here in Blackpool.' },
            { icon: 'star', title: 'Football and sport', text: 'Bloomfield Road, Deepdale and the big Manchester and Liverpool grounds, with a pickup point away from the crowds.' },
            { icon: 'calendar', title: 'Weddings and celebrations', text: 'Guests to and from the venue, or the couple to the airport the morning after.' },
          ],
        },
        {
          type: 'prose', alt: true, eyebrow: 'The journey home', title: 'Why it is worth booking ahead',
          html: `<p>Getting to an event is easy. Getting home is the hard part: queues for taxis, surge pricing on the apps and last trains that leave before the encore. When you book with us, your return pickup is arranged before you leave home.</p>
<p>We agree a pickup point near the venue that avoids the worst of the traffic, and your driver messages you when they are there. If the event runs late, let your driver know: reasonable overruns are fine, and any longer waiting is agreed with you first.</p>`,
        },
        {
          type: 'steps', eyebrow: 'Booking', title: 'How event transfers work',
          items: [
            { title: 'Tell us the event', text: 'Venue, date, how many of you, and roughly when it finishes.' },
            { title: 'Get a fixed price', text: 'Including the return pickup, quoted before you book.' },
            { title: 'Enjoy the night', text: 'Dropped near the entrance, collected afterwards, home to your door.' },
          ],
        },
        { type: 'fleetMini', text: 'Every car takes up to four passengers. For a bigger group, ask about booking more than one car.' },
        otherServices('event-transfers'),
        { type: 'faq' },
        { type: 'cta', title: 'Book your event transfer', text: 'Tell us the venue and date, and we will quote for there and back.', primary: { label: 'Get a Quote', href: quoteHref('event') } },
      ],
      faqs: [
        { q: 'What happens if the concert finishes late?', a: 'Message your driver. Reasonable overruns are part of the service. If you expect to be much later than planned, any extra waiting is agreed with you before it is charged.' },
        { q: 'Where will you pick us up after the event?', a: 'We agree a pickup point near the venue when we confirm your booking, chosen to avoid the worst of the traffic, and your driver messages you when they arrive.' },
        { q: 'Can you take a group bigger than four?', a: 'Each car takes four passengers. For larger groups, ask about booking more than one car.' },
      ],
    }),
  ];
};
