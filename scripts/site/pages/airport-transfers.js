'use strict';

module.exports = ({ bookHref, quoteHref, PRICES, AREAS, gbp }) => ({
  slug: 'airport-transfers',
  navKey: 'airport-transfers',
  priority: '0.9',
  title: 'Airport Transfers from Blackpool & the Fylde Coast | EV Exec',
  description: `Fixed-price airport transfers from Blackpool, Lytham St Annes, Poulton, Fleetwood and Preston. Manchester from ${gbp(PRICES.manchester.oneWay)}, flight monitoring included.`,
  eyebrow: 'Airport transfers',
  h1: 'Airport transfers from Blackpool &amp; <span>the Fylde Coast</span>',
  crumb: 'Airport Transfers',
  lead: 'Door-to-terminal transfers to every major airport in the North of England and beyond, at a fixed price agreed before you travel. We collect from your front door anywhere on the Fylde Coast and track your flight home.',
  hero: {
    prices: [
      { value: gbp(PRICES.manchester.oneWay), label: 'Manchester' },
      { value: gbp(PRICES.liverpool.oneWay), label: 'Liverpool' },
      { value: gbp(PRICES.leeds.oneWay), label: 'Leeds Bradford' },
    ],
    media: { img: 'ev-exec-image-1-1100', alt: 'EV Exec Tesla Model Y on Blackpool promenade at sunset with Blackpool Tower behind', w: 1100, h: 825 },
  },
  quoteService: 'airport',
  service: {
    name: 'Airport transfers from Blackpool and the Fylde Coast',
    type: 'Airport transfer',
    offers: Object.values(PRICES).map((p) => ({ name: `${p.name} one way`, price: p.oneWay })),
  },
  sections: [
    {
      type: 'cards', cols: 2, eyebrow: 'Choose your airport', title: 'The airports we drive to most',
      intro: 'Each route has its own page with journey times, timings for early flights and what happens when you land.',
      items: [
        { icon: 'plane', title: `Manchester Airport &middot; ${gbp(PRICES.manchester.oneWay)}`, text: 'Our busiest route. Around an hour down the M55, M6 and M61, dropped at your terminal.', href: '/manchester-airport-transfer-blackpool', more: 'Manchester transfers' },
        { icon: 'plane', title: `Liverpool John Lennon &middot; ${gbp(PRICES.liverpool.oneWay)}`, text: 'Often the easier airport from the Fylde: one terminal, short walk from drop-off to check-in.', href: '/liverpool-airport-transfer-blackpool', more: 'Liverpool transfers' },
        { icon: 'plane', title: `Leeds Bradford &middot; ${gbp(PRICES.leeds.oneWay)}`, text: 'Across the Pennines to Yeadon, for when the flight or fare you want leaves from Leeds Bradford.', href: '/leeds-bradford-airport-transfer-blackpool', more: 'Leeds Bradford transfers' },
        { icon: 'plane', title: `Birmingham Airport &middot; ${gbp(PRICES.birmingham.oneWay)}`, text: 'A longer run south on the M6 for long-haul and holiday flights that only leave from the Midlands.', href: '/airport-transfer-birmingham-blackpool', more: 'Birmingham transfers' },
      ],
    },
    {
      type: 'prices', alt: true, id: 'prices', eyebrow: 'Fixed prices', title: 'Airport transfer prices',
      intro: 'The price you see is the price you pay. It is the same from Blackpool, Lytham St Annes, Poulton, Thornton-Cleveleys, Fleetwood, Kirkham and Preston.',
      note: `Prices cover up to 4 passengers with standard luggage, from any pickup in Blackpool and the Fylde Coast. Airport drop-off and pickup charges are included. Heathrow, Gatwick, Stansted, Luton, Edinburgh and other airports are quoted on request: <a class="gold" href="${quoteHref('airport')}">ask for a price</a>.`,
    },
    {
      type: 'steps', eyebrow: 'How it works', title: 'From booking to the terminal',
      items: [
        { title: 'Book online in two minutes', text: 'Choose your airport, enter your address, date and flight number. You get a reference number straight away.' },
        { title: 'We confirm and you pay', text: 'We confirm your booking by email and you choose how to pay: securely online by card, by bank transfer or on the day.' },
        { title: 'Reminder with your driver', text: 'Before you travel we send a reminder with your driver’s name, the car and its registration.' },
        { title: 'Picked up from your door', text: 'Your driver messages when they set off and when they arrive. Bags go in the boot and you go straight to departures.' },
      ],
    },
    {
      type: 'split', flip: true, img: 'ev-exec-image-2-1100', w: 880, h: 783, alt: 'Inside an EV Exec Tesla, with Blackpool Tower visible through the windscreen',
      eyebrow: 'Coming home', title: 'When you land, we are already watching your flight',
      html: `<p>For every pickup at an airport we track your inbound flight. If it lands early we are there early. If it is delayed, we adjust your pickup to the new landing time at no extra charge, so you are not paying for a driver to sit in a car park.</p>
<p>We agree the exact meeting point with you when we confirm the booking, and your driver messages you when they arrive. Take your time through passport control and baggage reclaim: the clock on your pickup starts from when your flight actually lands.</p>
<ul class="checklist"><li><strong>Flight number on the booking</strong> is all we need to follow it.</li><li><strong>Return trips</strong> can be booked together, with a lower return price.</li><li><strong>Long delays</strong> are rearranged with you directly, never charged without agreement.</li></ul>`,
    },
    {
      type: 'cards', cols: 3, eyebrow: 'Why EV Exec', title: 'A better start to the trip than a taxi rank',
      items: [
        { icon: 'pound', title: 'Agreed before you travel', text: 'No meter, no surge pricing, no extra for luggage or airport drop-off charges.' },
        { icon: 'car', title: 'Quiet electric cars', text: 'Tesla Model Y and Škoda Enyaq, cleaned before every journey, with phone charging on board.' },
        { icon: 'shield', title: 'Licensed and insured', text: 'Licensed private hire with full hire and reward insurance. Every driver is enhanced DBS checked.' },
        { icon: 'bell', title: 'You always know what is happening', text: 'Booking confirmation, a reminder with your driver’s details, and a message when they are on the way.' },
        { icon: 'card', title: 'Pay the way you prefer', text: 'Secure online card payment, bank transfer, or cash on the day.' },
        { icon: 'star', title: '5.0 on Google', text: 'Every published review of EV Exec is five stars. Read them before you book.' },
      ],
    },
    { type: 'fleet', alt: true, eyebrow: 'The fleet', title: 'Room for you and your luggage', intro: 'Every car takes up to 4 passengers. Travelling with more than four suitcases, golf clubs or a pushchair? Tell us when you book and we will send the right car.' },
    {
      type: 'links', eyebrow: 'Pickup areas', title: 'Airport transfers from your town',
      intro: 'We collect from every address on the Fylde Coast. These pages cover the local details for each area.',
      items: [{ label: 'Blackpool', href: '/' }, ...AREAS.filter((a) => a.slug).map((a) => ({ label: a.name, href: `/${a.slug}` }))],
    },
    { type: 'faq', alt: true },
    { type: 'cta', title: 'Book your airport transfer', text: 'Fixed price, flight monitoring and door-to-terminal service from anywhere on the Fylde Coast.', primary: { label: 'Book your transfer', href: bookHref() } },
  ],
  faqs: [
    { q: 'How far in advance should I book an airport transfer?', a: 'As early as you can. Early-morning departures and school-holiday weekends fill first. The online form takes bookings from today onwards, but for a pickup in the next few hours please call or WhatsApp us on 07721 070370 so we can check a car is free.' },
    { q: 'Is the price really fixed?', a: `Yes. The price you are quoted is the price you pay, including airport drop-off or pickup charges. From the Fylde Coast it is ${gbp(PRICES.manchester.oneWay)} to Manchester Airport, ${gbp(PRICES.liverpool.oneWay)} to Liverpool and ${gbp(PRICES.leeds.oneWay)} to Leeds Bradford, one way.` },
    { q: 'What happens if my flight home is delayed?', a: 'We track your flight and move your pickup to match the new landing time, at no extra charge. If a delay runs into many hours we will contact you to rearrange.' },
    { q: 'Can I book a return transfer?', a: 'Yes. Choose Return in the booking form and add your return date, time and flight number. Return prices are lower than two single journeys.' },
    { q: 'Do you go to airports not listed here?', a: `Yes, including Heathrow, Gatwick, Stansted, Luton, East Midlands and Edinburgh. <a href="${quoteHref('airport')}">Request a quote</a> and we will reply with a fixed price.` },
  ],
  bookHref: bookHref(),
});
