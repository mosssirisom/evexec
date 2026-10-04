'use strict';

// One page per airport. Each covers what is genuinely different about the
// route: roads and timings, the airport itself, and how pickups work there.

// Fleet photos are shot at night in front of an airport control tower.
const HERO = {
  manchester: { img: 'ev-exec-tesla-model-y-navy-1000', alt: 'EV Exec navy Tesla Model Y at an airport at night', w: 1000, h: 787 },
  liverpool: { img: 'ev-exec-tesla-model-y-juniper-1000', alt: 'EV Exec grey Tesla Model Y Juniper at an airport at night', w: 1000, h: 789 },
  leeds: { img: 'ev-exec-skoda-enyaq-1000', alt: 'EV Exec blue Skoda Enyaq at an airport at night', w: 1000, h: 789 },
  birmingham: { img: 'ev-exec-tesla-model-y-navy-1000', alt: 'EV Exec navy Tesla Model Y at an airport at night', w: 1000, h: 787 },
};

module.exports = ({ bookHref, quoteHref, PRICES, AREAS, gbp }) => {
  const crumbs = [{ name: 'Airport Transfers', slug: 'airport-transfers' }];
  const common = (key) => {
    const p = PRICES[key];
    return {
      crumbs,
      navKey: 'services',
      priority: '0.9',
      quoteService: 'airport',
      bookHref: bookHref(p.short || p.name),
      hero: {
        prices: [
          { value: gbp(p.oneWay), label: 'One way' },
          { value: gbp(p.ret), label: 'Return' },
          { value: '4', label: 'Passengers' },
        ],
        primary: { label: `Book Your ${(p.short || p.name).replace(' Airport', '')} Transfer`, href: bookHref(p.short || p.name) },
        media: HERO[key],
      },
      service: {
        name: `${p.name} transfers from Blackpool and the Fylde Coast`,
        type: 'Airport transfer',
        offers: [{ name: 'One way', price: p.oneWay }, { name: 'Return', price: p.ret }],
      },
    };
  };
  const otherAirports = (skip) => ({
    type: 'links', eyebrow: 'Other airports', title: 'Flying from somewhere else?',
    items: Object.entries(PRICES).filter(([k, p]) => k !== skip && p.slug)
      .map(([, p]) => ({ label: `${p.short || p.name}`, href: `/${p.slug}`, tag: `from ${gbp(p.oneWay)}` }))
      .concat([{ label: 'All airports and prices', href: '/airport-transfers' }]),
  });

  return [
    // ── Manchester ────────────────────────────────────────────────────────
    {
      ...common('manchester'),
      slug: 'manchester-airport-transfer-blackpool',
      title: `Blackpool to Manchester Airport Transfer | £${PRICES.manchester.oneWay} Fixed | EV Exec`,
      description: `Blackpool and Fylde Coast to Manchester Airport for £${PRICES.manchester.oneWay} one way, £${PRICES.manchester.ret} return. Door to terminal, flight monitored on your return.`,
      eyebrow: 'Manchester Airport',
      h1: 'Blackpool to <span>Manchester Airport</span>',
      crumb: 'Manchester Airport',
      lead: 'Our most-booked route. We collect you from home anywhere on the Fylde Coast and drop you at your terminal’s departures forecourt, for one fixed price agreed before you travel.',
      sections: [
        {
          type: 'cards', cols: 3, eyebrow: 'The route', title: 'What to expect on the way',
          items: [
            { icon: 'clock', title: 'Around an hour', text: 'About 60 miles via the M55, M6, M61 and M60. Allow 60 to 75 minutes off-peak and longer on weekday mornings around the M60.' },
            { icon: 'map', title: 'Straight to your terminal', text: 'Tell us your terminal when you book. We drop you outside departures, so there is no transfer bus from a car park.' },
            { icon: 'pound', title: 'Drop-off charge included', text: 'Manchester charges vehicles to drop off and pick up. That cost is already in your price.' },
          ],
        },
        {
          type: 'prose', alt: true, eyebrow: 'Timing your pickup', title: 'When should we collect you?',
          html: `<p>For a European flight we usually collect you around <strong>three and a half hours before departure</strong>: an hour on the road, a buffer for the M60, and the two hours most airlines ask for at check-in. For long-haul, add another half hour. We will suggest a time when we confirm your booking, and you can always ask for earlier.</p>
<p>Early-morning departures are the most popular slot from the Fylde Coast. A 06:00 flight means a 02:30 pickup, and those dates fill up first, so book as soon as your flights are confirmed.</p>`,
        },
        {
          type: 'split', img: 'ev-exec-image-4-1100', w: 824, h: 1100, alt: 'Rear passenger view inside an EV Exec Tesla Model Y with entertainment screens',
          eyebrow: 'Coming home', title: 'Landing at Manchester',
          html: `<p>We follow your flight from the moment it takes off. If it lands early, we are there early; if it is delayed, we move your pickup to match at no extra charge.</p>
<p>When we confirm your booking we agree where to meet, and your driver messages you when they are there. Take your time through passport control and baggage reclaim. You will be back on the M56 heading home without hunting for a taxi rank or a car park ticket machine.</p>
<ul class="checklist"><li>Add your inbound flight number when you book.</li><li>Your phone number is how the driver reaches you, so keep it on after landing.</li></ul>`,
        },
        {
          type: 'cards', cols: 3, alt: true, eyebrow: 'Parking or a transfer?', title: 'Compared with driving and parking',
          intro: 'For a week away, a transfer often costs about the same as parking, without the drive home after a long flight. We have written up <a href="/manchester-airport-parking-vs-private-transfer">a fuller comparison</a>.',
          items: [
            { icon: 'car', title: 'Nobody drives tired', text: 'After a red-eye home, the last thing anyone wants is 60 miles of motorway.' },
            { icon: 'map', title: 'No shuttle buses', text: 'Off-site car parks add a bus each way. We drop you at the terminal door.' },
            { icon: 'user', title: 'Up to four of you', text: 'One price covers the whole group, so splitting it is cheaper than it looks.' },
          ],
        },
        otherAirports('manchester'),
        { type: 'faq' },
        { type: 'cta', title: 'Book your Manchester Airport transfer', text: `${gbp(PRICES.manchester.oneWay)} one way, ${gbp(PRICES.manchester.ret)} return, door to terminal.`, primary: { label: 'Book Your Manchester Transfer', href: bookHref('Manchester Airport') } },
      ],
      faqs: [
        { q: 'How much is a taxi from Blackpool to Manchester Airport?', a: `With EV Exec it is a fixed ${gbp(PRICES.manchester.oneWay)} one way or ${gbp(PRICES.manchester.ret)} return, from anywhere in Blackpool and the Fylde Coast, for up to four passengers. The airport drop-off charge is included.` },
        { q: 'How long does it take to get from Blackpool to Manchester Airport?', a: 'Usually about an hour, or 60 to 75 minutes allowing for traffic. Weekday mornings on the M60 can add time, which we build into your pickup time.' },
        { q: 'Which terminal will you drop me at?', a: 'Whichever terminal your flight leaves from. Tell us when you book, or check your airline booking if you are not sure, and we will take you to that terminal’s departures drop-off.' },
        { q: 'Do you pick up from Manchester Airport as well?', a: 'Yes. Book a single from the airport or a return. We track your flight and meet you at the meeting point agreed when we confirm the booking.' },
      ],
    },

    // ── Liverpool ─────────────────────────────────────────────────────────
    {
      ...common('liverpool'),
      slug: 'liverpool-airport-transfer-blackpool',
      title: `Blackpool to Liverpool John Lennon Airport | £${PRICES.liverpool.oneWay} Fixed | EV Exec`,
      description: `Fixed-price transfers from Blackpool and the Fylde Coast to Liverpool John Lennon Airport: £${PRICES.liverpool.oneWay} one way, £${PRICES.liverpool.ret} return. Flight monitored pickups.`,
      eyebrow: 'Liverpool John Lennon Airport',
      h1: 'Blackpool to <span>Liverpool Airport</span>',
      crumb: 'Liverpool Airport',
      lead: 'A straightforward run down the M6 and M58 to Speke. Liverpool’s single terminal makes it one of the least stressful airports to fly from, and we take you right to the door.',
      sections: [
        {
          type: 'cards', cols: 3, eyebrow: 'The route', title: 'Liverpool John Lennon from the Fylde',
          items: [
            { icon: 'clock', title: 'About an hour and a quarter', text: 'Around 55 miles: M55, M6 and M58, then through to Speke. It avoids the M60, so mornings are usually more predictable than Manchester.' },
            { icon: 'map', title: 'One terminal', text: 'Check-in, security and arrivals are all in one building. Drop-off is a short walk from the desks.' },
            { icon: 'pound', title: 'Charges included', text: 'Liverpool’s drop-off and pickup charges are part of the fixed price.' },
          ],
        },
        {
          type: 'prose', alt: true, eyebrow: 'Why people choose Liverpool', title: 'Often the easier airport',
          html: `<p>If your destination is on offer from both, Liverpool is worth a look. The terminal is compact, it is usually quicker to get from the car to the departure gate, and the drive avoids the busiest stretch of the M60.</p>
<p>For a European flight we usually suggest leaving <strong>about three and a quarter hours before departure</strong>. We confirm a recommended pickup time with your booking and you can ask for earlier.</p>`,
        },
        {
          type: 'split', flip: true, img: 'ev-exec-image-6-1100', w: 828, h: 1100, alt: 'EV Exec Tesla Model Y outside Blackpool Tower at night',
          eyebrow: 'Coming home', title: 'Picked up when you actually land',
          html: `<p>We track your inbound flight and adjust the pickup if it is early or late, at no extra cost. Your meeting point is agreed when we confirm, and your driver messages you when they arrive.</p>
<p>A Liverpool return is ${gbp(PRICES.liverpool.ret)} for both journeys, booked together in one go.</p>`,
        },
        otherAirports('liverpool'),
        { type: 'faq' },
        { type: 'cta', title: 'Book your Liverpool Airport transfer', text: `${gbp(PRICES.liverpool.oneWay)} one way, ${gbp(PRICES.liverpool.ret)} return, fixed before you travel.`, primary: { label: 'Book Your Liverpool Transfer', href: bookHref('Liverpool Airport') } },
      ],
      faqs: [
        { q: 'How much is a transfer from Blackpool to Liverpool Airport?', a: `${gbp(PRICES.liverpool.oneWay)} one way or ${gbp(PRICES.liverpool.ret)} return from anywhere on the Fylde Coast, for up to four passengers with standard luggage.` },
        { q: 'How long is the drive to Liverpool John Lennon Airport?', a: 'Allow around an hour and a quarter. The route uses the M6 and M58 rather than the M60, so it is usually steadier at rush hour.' },
        { q: 'Where do you drop off at Liverpool Airport?', a: 'At the terminal drop-off, a short walk from check-in. Liverpool has a single terminal, so there is no risk of being taken to the wrong one.' },
      ],
    },

    // ── Leeds Bradford ────────────────────────────────────────────────────
    {
      ...common('leeds'),
      slug: 'leeds-bradford-airport-transfer-blackpool',
      title: `Blackpool to Leeds Bradford Airport Transfer | £${PRICES.leeds.oneWay} | EV Exec`,
      description: `Fixed-price Leeds Bradford Airport transfers from Blackpool and the Fylde Coast: £${PRICES.leeds.oneWay} one way, £${PRICES.leeds.ret} return, with flight monitoring on the way home.`,
      eyebrow: 'Leeds Bradford Airport',
      h1: 'Blackpool to <span>Leeds Bradford Airport</span>',
      crumb: 'Leeds Bradford Airport',
      lead: 'The longest of our regular routes, across the Pennines to Yeadon. A comfortable car and a fixed price make it an easy option when the flight you want leaves from Leeds Bradford.',
      sections: [
        {
          type: 'cards', cols: 3, eyebrow: 'The route', title: 'Over the Pennines',
          items: [
            { icon: 'clock', title: 'Around two hours', text: 'Roughly 75 miles. We pick the route on the day, over the tops or via the M62, depending on traffic and weather.' },
            { icon: 'map', title: 'One terminal', text: 'Leeds Bradford has a single terminal. We drop you at the front, close to check-in.' },
            { icon: 'route', title: 'Weather-aware', text: 'The airport sits on high ground. In winter we leave extra time and watch conditions before we set off.' },
          ],
        },
        {
          type: 'prose', alt: true, eyebrow: 'Timing', title: 'Planning an early flight',
          html: `<p>Because the drive is longer, we normally collect you <strong>around four hours before a European departure</strong>. For a 07:00 flight that means a 03:00 pickup. It is an early start, but you can sleep in the back of a quiet electric car rather than drive yourself across the Pennines in the dark.</p>
<p>Leeds Bradford is the highest airport in England, and low cloud or fog occasionally diverts arriving flights. If your flight home is diverted, call us: we will talk through the options for collecting you from where you land.</p>`,
        },
        {
          type: 'split', img: 'ev-exec-image-4-1100', w: 824, h: 1100, alt: 'Passenger view inside an EV Exec Tesla Model Y with rear screen',
          eyebrow: 'Comfort', title: 'Two hours you will not mind',
          html: '<p>Quiet electric drive, climate control set before you get in, phone charging front and back, and space to stretch out. On a longer route like this the car makes the difference.</p><ul class="checklist"><li>Up to four passengers per car</li><li>Four suitcases in the Tesla, five in the Škoda Enyaq</li><li>Flight tracked on your return</li></ul>',
        },
        otherAirports('leeds'),
        { type: 'faq' },
        { type: 'cta', title: 'Book your Leeds Bradford transfer', text: `${gbp(PRICES.leeds.oneWay)} one way, ${gbp(PRICES.leeds.ret)} return, flight tracked on the way home.`, primary: { label: 'Book Your Leeds Bradford Transfer', href: bookHref('Leeds Bradford Airport') } },
      ],
      faqs: [
        { q: 'How much is a taxi from Blackpool to Leeds Bradford Airport?', a: `EV Exec charges a fixed ${gbp(PRICES.leeds.oneWay)} one way or ${gbp(PRICES.leeds.ret)} return from anywhere on the Fylde Coast, for up to four passengers.` },
        { q: 'How long does it take to drive from Blackpool to Leeds Bradford Airport?', a: 'Around two hours, depending on route, traffic and weather. We build that into your pickup time.' },
        { q: 'What if my flight into Leeds Bradford is diverted?', a: 'Call us as soon as you know. Diversions are not common, but when they happen we will work out with you whether we can collect you from the airport you land at.' },
      ],
    },

  ];
};
