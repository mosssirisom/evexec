'use strict';

module.exports = ({ bookHref, quoteHref, PRICES, AREAS, gbp }) => ({
  slug: 'airport-transfers',
  navKey: 'services',
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
      intro: 'One-way prices from anywhere on the Fylde Coast. Manchester, Liverpool and Leeds Bradford each have their own page with journey times and what happens when you land. Returns and other airports are on the <a href="/prices">price list</a>.',
      items: [
        { icon: 'plane', title: `Manchester Airport &middot; ${gbp(PRICES.manchester.oneWay)}`, text: 'Our busiest route. Around an hour down the M55, M6 and M61, dropped at your terminal.', href: '/manchester-airport-transfer-blackpool', more: 'Manchester transfers' },
        { icon: 'plane', title: `Liverpool John Lennon &middot; ${gbp(PRICES.liverpool.oneWay)}`, text: 'Often the easier airport from the Fylde: one terminal, short walk from drop-off to check-in.', href: '/liverpool-airport-transfer-blackpool', more: 'Liverpool transfers' },
        { icon: 'plane', title: `Leeds Bradford &middot; ${gbp(PRICES.leeds.oneWay)}`, text: 'Across the Pennines to Yeadon, for when the flight or fare you want leaves from Leeds Bradford.', href: '/leeds-bradford-airport-transfer-blackpool', more: 'Leeds Bradford transfers' },
        { icon: 'plane', title: `Birmingham Airport &middot; ${gbp(PRICES.birmingham.oneWay)}`, text: 'About two and a half hours down the M6, for flights only available from the Midlands. For long-haul we suggest a pickup around five and a half hours before departure.', href: bookHref('Birmingham Airport'), more: 'Book Birmingham' },
      ],
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
    { type: 'fleetMini', text: 'Every car takes up to 4 passengers. Travelling with more than four suitcases, golf clubs or a pushchair? Tell us when you book and we will send the right car.' },
    {
      type: 'links', eyebrow: 'Pickup areas', title: 'Airport transfers from your town',
      intro: 'We collect from every address on the Fylde Coast. These pages cover the local details for each area.',
      items: [{ label: 'Blackpool', href: '/areas#blackpool' }, ...AREAS.filter((a) => a.slug).map((a) => ({ label: a.name, href: `/${a.slug}` }))],
    },
    { type: 'faq', alt: true },
    { type: 'cta', title: 'Book your airport transfer', text: 'Fixed price, flight monitoring and door-to-terminal service from anywhere on the Fylde Coast.', primary: { label: 'Book Your Transfer', href: bookHref() } },
  ],
  faqs: [
    { q: 'Manchester or Liverpool: which is easier from the Fylde Coast?', a: 'Both are around an hour to an hour and ten minutes from most of the Fylde. Manchester has far more routes and long-haul flights. Liverpool John Lennon is a single terminal with a short walk from drop-off to check-in, which many people find easier for early starts. If the flight and fare suit either, it is worth comparing both.' },
    { q: 'Is the price really fixed?', a: `Yes, for a standard airport transfer. The price includes airport drop-off or pickup charges: ${gbp(PRICES.manchester.oneWay)} to Manchester, ${gbp(PRICES.liverpool.oneWay)} to Liverpool and ${gbp(PRICES.leeds.oneWay)} to Leeds Bradford, one way. Extra stops are £5 each. See <a href="/prices">all prices</a>.` },
    { q: 'Do you go to airports not listed here?', a: `Yes, including Heathrow, Gatwick, Stansted, Luton, East Midlands and Edinburgh. <a href="${quoteHref('airport')}">Request a quote</a> and we will reply with a fixed price.` },
  ],
  bookHref: bookHref(),
});
