'use strict';

// Terms & Conditions template: filled from a business's details
// (lib/legal/details.js). The wording follows EV Exec's published terms
// (version 3); with EV Exec's own details it reproduces them (tests/unit/legal.test.cjs).
//
// DRAFT FOR REVIEW: this is a template, not legal advice. A solicitor should
// review it once before a business publishes it (docs/legal/template-review.md).

const { esc, p, ul, table, section } = require('./render');

const WORDS = ['no', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten'];
const word = (n) => (Number.isInteger(n) && n >= 0 && n <= 10 ? WORDS[n] : String(n));
const hours = (h) => (h >= 168 && h % 24 === 0 ? `${h / 24} days` : `${h} ${h === 1 ? 'hour' : 'hours'}`);
const money = (n) => `£${Number.isInteger(n) ? n : n.toFixed(2)}`;
const ph = (label) => `<mark class="legal-gap">[${esc(label)} to be added]</mark>`;
const val = (v, label) => (v ? esc(v) : ph(label));

function aboutSentence(d) {
  const name = esc(d.name);
  const licence = d.licence
    ? `private hire operator licence ${esc(d.licence)}${d.licensingAuthority ? `, issued by ${esc(d.licensingAuthority)}` : ''}`
    : `private hire operator licence ${ph('licence number')}`;
  const what = `providing ${esc(d.service)}${d.area ? ` from ${esc(d.area)}` : ''}`;
  if (d.status === 'limited company') {
    const legal = d.legalName && d.legalName !== d.name ? `${esc(d.legalName)}, trading as ${name}` : name;
    return `${legal} is a limited company (company number ${val(d.companyNumber, 'company number')}, registered office ${val(d.registeredAddress, 'registered office')}) and a licensed private hire operator (${licence}) ${what}. We are fully licensed, insured and enhanced DBS checked.`;
  }
  const status = d.status === 'partnership' ? 'a partnership' : d.status === 'sole trader' ? 'a sole trader' : `${ph('trading status')}`;
  return `${name} is ${status} and licensed private hire operator (${licence}) ${what}. We are fully licensed, insured and enhanced DBS checked.`;
}

function contactList(d) {
  const items = [];
  items.push(d.email ? `Email: <a class="gold" href="mailto:${esc(d.email)}">${esc(d.email)}</a>` : `Email: ${ph('contact email')}`);
  items.push(d.phone ? `Phone: <a class="gold" href="tel:${esc(d.phone.replace(/\s/g, ''))}">${esc(d.phone)}</a>` : `Phone: ${ph('contact phone')}`);
  if (d.phoneTel) items.push(`WhatsApp: <a class="gold" href="https://wa.me/${esc(d.phoneTel)}">Message us directly</a>`);
  return items;
}

const contactInline = (d) => `${d.email ? esc(d.email) : ph('contact email')} or ${d.phone ? esc(d.phone) : ph('contact phone')}`;

function governingLaw(d) {
  const n = esc(d.name);
  if (d.jurisdiction === 'scotland') return `These terms are governed by the laws of Scotland. Any disputes arising from a booking with ${n} will be subject to the courts of Scotland. If you are a consumer living in England, Wales or Northern Ireland, you may also bring proceedings in your local courts.`;
  if (d.jurisdiction === 'northern-ireland') return `These terms are governed by the laws of Northern Ireland. Any disputes arising from a booking with ${n} will be subject to the courts of Northern Ireland. If you are a consumer living in England, Wales or Scotland, you may also bring proceedings in your local courts.`;
  return `These terms are governed by the laws of England and Wales. Any disputes arising from a booking with ${n} will be subject to the courts of England and Wales. If you are a consumer living in Scotland or Northern Ireland, you may also bring proceedings in your local courts.`;
}

/** The short "Cancellations at a glance" box text (HTML). */
function glance(d) {
  const [a, b, c] = d.policy.standard;
  return `Free more than ${hours(a.hours)} before pickup. ${b.pct}% of the fare from ${hours(a.hours)}, ${c.pct}% from ${hours(b.hours)}, and the full fare from ${hours(c.hours)} before, once the driver has set off, or if no one is there to be picked up. If we cancel, you get a full refund.`;
}

/** The terms as a list of numbered sections. */
function termsSections(d) {
  const n = esc(d.name);
  const pol = d.policy;
  const [sa, sb, sc] = pol.standard;
  const [qa, qb, qc] = pol.quoted;
  const includes = d.priceIncludes || [
    `Up to ${d.maxPassengers} passengers`, 'Standard luggage (see section 13)', 'Live flight monitoring on all inbound transfers',
    'Airport drop-off and pickup charges', 'All fuel, charging and running costs', 'Any extra stops you booked',
  ];
  const contact = d.email || d.phone ? ` ${contactInline(d)}` : ` ${ph('contact details')}`;

  return [
    section(`About ${n}`,
      p(aboutSentence(d)),
      p(`Every booking is a contract with ${n}. You can contact us at:`),
      ul(contactList(d)),
      p('In these terms, &ldquo;you&rdquo; means the person or organisation that makes the booking (the <strong>Booker</strong>). If you book for someone else, such as a family member, a colleague, a client, a guest or an event attendee, you remain the Booker and are responsible for the booking, payment and any charges under these terms.'),
      p('Some clauses apply differently to <strong>consumers</strong> (individuals booking mainly for personal purposes) and <strong>business customers</strong> (companies, firms, sole traders and organisations booking for their business). A clause marked &ldquo;business customers only&rdquo; does not apply to consumers.'),
      p('All times in these terms are UK local time (GMT or BST, whichever is in force on the day).')),

    section('Booking &amp; Confirmation',
      p(`A request made on our website, by phone or by message is not yet a booking. We check availability and then confirm or decline it. We operate a small fleet, and availability is limited, particularly for early-morning airport runs.`),
      p('Your booking becomes a binding contract when we confirm it in writing by email (or by WhatsApp or text if you have no email address). The confirmation shows the price and journey details.'),
      p('Before we take a booking, we ask you to tick a box confirming you have read and accept these terms, either on the booking form or on your booking page before you pay. We keep a record of when you accepted them and which version. You can read, download or print these terms at any time on this page, and we will email you a copy on request.'),
      p('If you book by phone, email or message, we will tell you the main cancellation charges before we confirm, and your confirmation will set them out with a link to these terms. Please read them before you travel. You can also accept them on your booking page.'),
      p('Please check your confirmation carefully and tell us straight away if anything is wrong. We rely on the pickup address, date, time, flight number and passenger numbers you give us, and we are not responsible for problems caused by incorrect details.'),
      p('If you have not received a confirmation within a reasonable time of your request, please contact us before assuming your booking is confirmed.')),

    section('Pricing &amp; Payment',
      p('All prices are fixed and include:'),
      ul(includes.map(esc)),
      p(`The price in your confirmation is the total price for the journey. It changes only if you change the booking (section 6), or if extra waiting or luggage charges apply that we agreed with you. Journeys starting outside our standard area, and other journeys not on our price list, are priced by individual quote before we confirm them.`),
      p('How and when you pay, deposits and refunds are set out in section 10.')),

    section('Cancelling Your Booking',
      p('<strong>Key terms.</strong> In sections 4 to 10:'),
      ul([
        '<strong>Scheduled pickup time</strong> means the date and time in your confirmation. For a pickup from an airport, it is the scheduled landing time of the flight you gave us.',
        '<strong>Journey price</strong> means the price of the journey being cancelled. For a return booking, it is half of the return price.',
        '<strong>Set off</strong> means the driver has started travelling to your pickup, as recorded in our dispatch system.',
        'All times are UK local time.',
      ]),
      p(`<strong>How to cancel.</strong> Use the cancellation link in your booking emails, email ${d.email ? esc(d.email) : ph('contact email')}, WhatsApp or text ${d.phone ? esc(d.phone) : ph('contact phone')}, or call ${d.phone ? esc(d.phone) : ph('contact phone')}. Please give your booking reference.`),
      p('<strong>When it takes effect.</strong> A cancellation takes effect when we receive it: the time the link is used, or the time stamp of your email, message or call. We will confirm it in writing within 24 hours, showing any charge and any refund.'),
      p('<strong>Cancellations by others.</strong> If anyone you booked for cancels their plans, including a passenger, guest, employee, client, employer or event organiser, it counts as a cancellation by you, and section 5 applies. This does not affect your rights where we are at fault or cannot provide the journey (sections 8 and 9).')),

    section('Cancellation Charges',
      p('<strong>Standard bookings</strong> (journeys at our published prices):'),
      table(['When we receive your cancellation', 'Charge'], [
        [`More than ${hours(sa.hours)} before the scheduled pickup time`, 'None'],
        [`More than ${hours(sb.hours)} and up to ${hours(sa.hours)} before`, `${sb.pct}% of the journey price`],
        [`More than ${hours(sc.hours)} and up to ${hours(sb.hours)} before`, `${sc.pct}% of the journey price`],
        [`${hours(sc.hours)} or less before, or after the driver has set off, whichever is earlier`, '100% of the journey price'],
        ['After the driver has arrived, or a no-show (section 7)', '100% of the journey price'],
      ]),
      p(`<strong>Quoted bookings</strong> (any journey priced by individual quote over ${money(pol.quotedOver)}, any booking where we hold a car for ${hours(pol.quotedHoldHours)} or more, and any booking of more than one car). The quote sets out the schedule. If it does not, this one applies:`),
      table(['When we receive your cancellation', 'Charge'], [
        [`More than ${hours(qa.hours)} before`, 'None'],
        [`More than ${hours(qb.hours)} and up to ${hours(qa.hours)} before`, `${qb.pct}% of the quoted price`],
        [`More than ${hours(qc.hours)} and up to ${hours(qb.hours)} before`, `${qc.pct}% of the quoted price`],
        [`${hours(qc.hours)} or less before, or a no-show`, '100% of the quoted price'],
      ]),
      p('<strong>Costs we have already paid.</strong> If your quote names a cost we must pay for you and cannot recover, such as parking, a ferry or a driver’s overnight stay, we may charge that cost if it is more than the charge above. We charge one or the other, never both.'),
      p('<strong>Why we charge.</strong> We take few bookings per car and time slot, and turn other customers away once we confirm yours. The later you cancel, the less chance we have of filling the slot and the more of our costs are already committed. The charges are our estimate of that loss after the costs we save when a journey does not go ahead.'),
      p('<strong>If we re-book the slot.</strong> If we take another paid booking using the same car and driver at the same time, we reduce your charge by what we earn from it.'),
      p('<strong>Discretion.</strong> We may reduce or waive a charge, for example for bereavement or serious illness.')),

    section('Changes to Your Booking',
      p('Ask for changes as early as possible. A change applies only once we confirm it in writing, and we tell you any price difference or charge before you agree.'),
      p(`<strong>Date or time.</strong> Free more than ${hours(sa.hours)} before pickup, subject to availability. Within ${hours(sa.hours)}, free if we can keep the car and driver working. If we cannot, the original booking is cancelled under section 5 and a new booking made at the current price. A booking can be moved to a date up to ${pol.moveMonths} months after the original.`),
      p(`<strong>Addresses and stops.</strong> You can change an address or add a stop if we can still provide the journey. The price is recalculated from our published prices (${money(pol.extraStop)} per extra stop) or by a new quote you accept first.`),
      p('<strong>Passengers, luggage and vehicle.</strong> Tell us of any change in passenger numbers or luggage. If it no longer fits the car booked, we will offer a larger vehicle or a second car at the price we quote. If you decline and the journey cannot go ahead as booked, it is treated as a cancellation by you.'),
      p('<strong>Flight details and passenger name.</strong> Changing the flight number, date, airport or passenger name is free. If a new flight changes the pickup date or time, the date and time rule above applies.'),
      p(`<strong>Repeated changes.</strong> ${pol.freeChanges === 1 ? 'The first change is free' : `The first ${word(pol.freeChanges)} changes are free`}, apart from any price difference. After that we may charge ${money(pol.changeFee)} per change, which we will tell you before you confirm. Changes we ask for, or that follow an airline changing your flight, do not count.`),
      p('<strong>Wrong details.</strong> If the pickup, flight or contact details you gave were wrong and this causes extra cost, such as a second trip, we may charge that cost. We will show it in writing. If we cannot provide the journey because of wrong details, the no-show rule in section 7 applies.')),

    section('Waiting Time, Driver Arrival &amp; No-Shows',
      p(`<strong>At an address.</strong> The driver will arrive by the scheduled pickup time and wait free for ${pol.waitAddress} minutes.`),
      p(`<strong>At an airport.</strong> We track your flight. The driver meets you at the agreed meeting point and waits free for ${pol.waitAirport} minutes after the flight’s actual landing time. A flight delay does not use up this time and never costs extra.`),
      p(`<strong>No-show.</strong> If no passenger is ready (at an address) or has met the driver (at an airport) by the end of the free waiting time, and nobody has contacted us, the driver will call and message the passenger and the Booker. If there is still no contact within ${pol.noShowGrace} minutes, the driver may leave, and the booking is a no-show under section 5.`),
      p('<strong>Longer waits.</strong> If you ask us to wait longer, we will tell you the charge before it applies. If waiting would make the driver late for another booking, we may decline.')),

    section('Flight Disruption &amp; Severe Weather',
      p(`<strong>Inbound flight cancelled, diverted or delayed by more than ${pol.delayHours} hours.</strong> We will move your pickup to your new arrival free of charge if we have a car available. If we cannot, or you no longer need the transfer:`),
      ul(['before the driver has set off, we refund in full;', 'after the driver has set off, we charge 50% of the journey price.']),
      p(`<strong>Outbound flight cancelled or rescheduled by the airline.</strong> We will move your pickup free of charge if you tell us more than ${pol.outboundNoticeHours} hours before pickup and we have a car available. Otherwise section 5 applies.`),
      p('<strong>Severe weather and road closures.</strong> If a Met Office red warning covers the route, or the police or National Highways have closed it or advised against travel, you may cancel or move the booking free of charge.')),

    section('If We Cancel or Cannot Provide the Journey',
      p('We may need to cancel or change a booking because of events outside our reasonable control, such as a breakdown or accident, sudden driver illness, severe weather, road closures, police instructions or a public emergency. We may also cancel if a payment we asked for in advance is not made by its due date, after reminding you.'),
      p(`We will tell you as soon as we can and, where possible, offer another of our cars or a car and driver from a licensed private hire operator we work with, at no extra cost. Your contract stays with ${n}.`),
      p('If you do not want the replacement, or we cannot provide one, we refund everything you paid for that journey in full, with no deductions.'),
      p('If we cancel for a reason within our control, or fail to turn up, we refund in full, and you keep your rights under the Consumer Rights Act 2015 for any other loss our failure caused.'),
      p('If a journey is only partly performed because of us, we refund a fair proportion of the price for the part not provided.')),

    section('Payment, Deposits &amp; Refunds',
      p('You can pay by card through our secure link once we confirm your booking, by bank transfer, or in cash on the day. We add no fee for paying by card.'),
      p('For quoted bookings we may ask for a deposit or full payment in advance, as stated in the quote. A deposit is a part-payment of the price. If you cancel, we keep only the charge due under section 5 and refund the rest.'),
      p(`If a charge is due and you have not paid, we will send a payment link or invoice, payable within ${pol.invoiceDays} days.`),
      p(`Refunds go back to the original payment method within ${pol.refundDays} days of us confirming the amount. Card refunds can take 5–10 more working days to reach your account. We never deduct card processing fees from a consumer’s refund.`),
      p('If you think a charge is wrong, contact us first (section 19). We will review it, and will reduce it if the re-booking or discretion rules in section 5 apply.')),

    section('Business Customers',
      p('Sections 4 to 10 apply to business customers. The charges protect our legitimate interest in keeping cars and drivers available for confirmed work. A cancellation by your client, delegate, employee or event organiser, or the cancellation of the event itself, is your cancellation.'),
      p(`Invoices are payable within ${pol.invoiceDays} days. We may charge statutory interest under the Late Payment of Commercial Debts (Interest) Act 1998.`),
      p('If you paid with a commercial (corporate) card and cancel inside a charging period, we may deduct from your refund the processing fee our payment provider kept, as shown on your receipt.'),
      p('A separate account or framework agreement with us takes priority where it differs from these terms.')),

    section('Passengers',
      p(`Each of our vehicles can accommodate up to ${d.maxPassengers} passengers per journey. All passengers must wear a seatbelt at all times during travel, as required by UK law.`),
      p('Children must be accommodated in accordance with UK child car seat regulations. If you are travelling with young children who require a child or booster seat, please inform us at the time of booking so that appropriate arrangements can be made where possible.'),
      p(`${n} reserves the right to refuse carriage to any passenger who:`),
      ul(['Is visibly intoxicated or under the influence of drugs and poses a risk to themselves, the driver or the vehicle', 'Is behaving in an aggressive, abusive or threatening manner', 'Would cause the vehicle to exceed its legal passenger or weight capacity']),
      p('If we refuse carriage for one of these reasons, the journey is treated as a no-show under section 5. If the refusal was not justified, we refund in full.')),

    section('Luggage',
      p(`Our standard fare includes a reasonable amount of luggage suitable for air travel, ${esc(d.luggage)}.`),
      p('If you are travelling with excessive, oversized or unusual items (such as sports equipment, pushchairs or very large cases), please advise us at the time of booking so we can confirm availability and whether any additional charge applies.'),
      p('Our driver will assist with loading and unloading luggage as a standard part of our service. We take reasonable care of luggage while it is in our vehicle. We are responsible for loss or damage caused by our failure to take reasonable care, but not for damage to fragile items or valuables that were not packed suitably for travel. Please insure valuable items.')),

    section('Flight Monitoring &amp; Delays',
      p('Live flight monitoring is included as standard on all inbound (From Airport) transfers. We track your incoming flight in real time and adjust your pickup accordingly, so you are never left waiting if your flight is early or delayed.'),
      p(`For outbound (To Airport) journeys, we work to ensure you are collected with sufficient time to reach your departure terminal. However, ${n} cannot be held responsible for missed flights caused by:`),
      ul(['Traffic, road closures or accidents beyond our control', 'The passenger not being ready at the agreed pickup time', 'Incorrect departure information provided at the time of booking', 'Exceptional or unforeseeable circumstances']),
      p(`We always recommend allowing adequate time before your flight. ${n} will advise on suitable departure times, but the passenger is ultimately responsible for allowing appropriate time for check-in, security and boarding.`),
      p(`If your flight is significantly delayed on an inbound transfer, ${n} will make all reasonable efforts to accommodate the revised schedule. Waiting time is covered in section 7, and cancelled or diverted flights in section 8.`)),

    section('Driver &amp; Timing',
      p('Our driver will arrive at the agreed pickup location at the agreed time, or earlier. On inbound airport transfers, the driver will be present at the agreed meeting point as soon as reasonably possible after your flight has landed and you have cleared customs and baggage reclaim.'),
      p('Please be ready at your pickup location at the agreed time, and call or message us if you are running late. Waiting time and no-shows are explained in section 7.'),
      p(`${n} drivers will not use handheld mobile phones while driving in accordance with UK law. Communications from the driver will be made when safely parked or via a hands-free device only.`)),

    section('Liability',
      p(`${n} holds full public liability and hire &amp; reward insurance covering all passengers during transit. In the event of an incident during your journey, please inform the driver immediately.`),
      p(`${n} is not liable for:`),
      ul(['Losses caused by delays or cancellations beyond our reasonable control, including traffic, road incidents, extreme weather or third-party failures', 'Missed flights or connections where we arrived on time and the delay was not our fault', 'Loss, theft or damage to personal belongings or luggage, unless caused by our failure to take reasonable care (section 13)', 'Any indirect, consequential or economic loss arising from use of our service']),
      p('If we fail to provide a journey, or provide it late, because of our own fault, we are responsible for losses that were reasonably foreseeable when you booked, such as the reasonable cost of other transport. We are not responsible for losses that were not foreseeable, or that were caused by something outside our reasonable control (section 9). <strong>Business customers only:</strong> our total liability for any booking is limited to the price of that booking.'),
      p('Nothing in these terms limits our liability for death, personal injury caused by our negligence, or any other liability that cannot be excluded by law.')),

    section('Vehicle &amp; Service Standards',
      p(`${n} operates ${esc(d.fleet)}, each fully licensed, insured and maintained to a high standard. Every vehicle is presented clean and immaculate for every booking.`),
      p('Passengers must not:'),
      ul(['Smoke or vape inside the vehicle', 'Consume food or open drinks without prior agreement with the driver', 'Damage, mark or soil the vehicle interior in any way']),
      p(`Any damage caused to the vehicle by a passenger during transit will be charged at the cost of repair or professional valeting, as appropriate. ${n} reserves the right to recover such costs in full.`)),

    section('Your Statutory Rights',
      p('Nothing in these terms removes or limits any right you have by law, including your rights under the Consumer Rights Act 2015 if a journey is not carried out with reasonable care and skill. If any term is found to be unenforceable, the rest of these terms still apply.')),

    section('Governing Law &amp; Disputes',
      p(governingLaw(d)),
      p(`If you have a complaint or concern, please contact us in the first instance at ${contactInline(d)}. We will make every reasonable effort to resolve any issues promptly and fairly.`)),

    section('Changes to These Terms',
      p('We may update these terms. The version that applies to your booking is the one in force when you accepted it. A later version applies to your booking only if you agree to it, for example when you change your booking.')),
  ];
}

module.exports = { termsSections, glance };
