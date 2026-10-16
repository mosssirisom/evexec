'use strict';

// Wording for every EV Exec email, built on lib/emailTemplate.js. Each builder
// returns { subject, html, spec }. Subjects always say what happened and, for
// anything tied to a journey, the day, date and time, so the inbox line alone
// is enough. Dates DD/MM/YYYY, times HH:MM (UK).

const { renderEmail, renderText, when, longDate, hhmm, relativeDay, esc, mapsSearch, mapsDirections, calendarUrl } = require('./emailTemplate');
const P = require('./cancellation');
const { getStops, getPrice, lookupPrice, paymentLine, needsPayment } = require('./format');

const SITE = () => (process.env.SITE_URL || 'https://www.evexec.co.uk').replace(/\/$/, '');
const first = (n) => String(n || '').trim().split(/\s+/)[0] || 'there';
const oneLine = (s) => String(s == null ? '' : s).replace(/[\r\n]+/g, ', ').replace(/\s+/g, ' ').trim();
const money = (n) => (n == null || n === '' || isNaN(Number(n)) ? null : `£${Number(n).toFixed(2)}`);
const tel = (p) => (p ? { html: `<a href="tel:${esc(String(p).replace(/\s+/g, ''))}" style="color:#0f1b33;text-decoration:underline">${esc(p)}</a>`, text: String(p) } : null);
// Address that opens in Google Maps when tapped.
const place = (a) => (a ? { html: `<a href="${esc(mapsSearch(a))}" style="color:#0f1b33;text-decoration:underline">${esc(a)}</a>`, text: String(a) } : null);
const isReturnLeg = (b) => /^Return leg created automatically/i.test(String(b.notes || ''));

function from(b) { return b.pickup_location || b.airport || 'Pickup to be confirmed'; }
function to(b) { return b.dropoff_address || b.airport || b.destination || 'Drop-off to be confirmed'; }
function route(b) { return [from(b), ...getStops(b), to(b)].join(' → '); }
// Town or airport only: "12 Clifton Drive, Lytham St Annes, FY8 5RE" -> "Lytham St Annes",
// "Manchester Airport, Terminal 2" -> "Manchester Airport".
const POSTCODE = /^[A-Z]{1,2}\d[A-Z\d]?\s*\d[A-Z]{2}$/i;
function shortPlace(s) {
  const parts = String(s || '').split(',').map(x => x.trim()).filter(x => x && !POSTCODE.test(x) && !/^(UK|United Kingdom|England|GB)$/i.test(x));
  const airport = parts.find(x => /airport/i.test(x));
  return airport || parts[parts.length - 1] || String(s || '');
}
function shortRoute(b) { return `${shortPlace(from(b))} → ${shortPlace(to(b))}`; }

// Journey rows in travel order. Outbound only unless opts.both and it is a return booking.
function journeyRows(b, opts = {}) {
  const rows = [['Pickup', place(from(b))]];
  getStops(b).forEach((s, i) => rows.push([`Stop ${i + 1}`, place(s)]));
  rows.push(['Drop-off', place(to(b))]);
  if (opts.withWhen) rows.unshift(['When', when(b.travel_date, b.travel_time)]);
  if (b.flight_number) rows.push(['Flight', String(b.flight_number).toUpperCase()]);
  rows.push(['Passengers and luggage', [`${b.passengers || 1} passenger${(b.passengers || 1) == 1 ? '' : 's'}`, b.luggage].filter(Boolean).join(' · ')]);
  return rows;
}
function returnRows(b) {
  if (!b.return_journey) return null;
  return [
    ['When', when(b.return_date, b.return_time)],
    ['Pickup', place(b.return_pickup || b.return_airport || b.airport || 'To be confirmed')],
    ['Drop-off', place(b.return_destination || b.pickup_location || b.dropoff_address || 'To be confirmed')],
    ['Flight', b.return_flight ? String(b.return_flight).toUpperCase() : null],
  ];
}
function journeySections(b, opts = {}) {
  const out = [{ heading: b.return_journey ? 'Outbound journey' : (opts.staff ? 'Journey' : 'Your journey'), rows: journeyRows(b, { withWhen: b.return_journey }) }];
  const r = returnRows(b);
  if (r) out.push({ heading: 'Return journey', rows: r });
  const pay = [['Reference', b.ref]];
  if (opts.price !== false && !isReturnLeg(b)) pay.push(['Price', money(getPrice(b))]);
  if (opts.payment !== false) pay.push(['Payment', needsPayment(b) ? 'Not paid yet. Pay online, or cash on the day.' : paymentLine(b)]);
  out.push({ heading: 'Booking', rows: pay });
  return out;
}
// The booking's own cancellation deadlines, from the terms version it is held
// to (terms section 5). Quoted bookings point to their quote instead. Only
// deadlines still ahead are listed; if a charge already applies, it says so.
function cancellationSection(b, now) {
  const at = now || new Date();
  const version = P.policyVersion(b);
  const terms = `${SITE()}${P.policyPath(version)}#cancellation`;
  const onPriceList = Boolean(b.airport) && lookupPrice(b.airport, Boolean(b.return_journey)) != null;
  if (!onPriceList && Number(getPrice(b)) > 300) {
    return { heading: 'Cancellation', rows: [['Charges', 'As set out in your quote, or our quoted-booking schedule if the quote does not say.'], ['Terms', terms]] };
  }
  const pickup = P.pickupInstant(b.travel_date, b.travel_time);
  if (!pickup) return null;
  const starts = P.chargeStarts(version, pickup);
  const rows = [];
  const due = starts.filter((s) => s.from <= at);
  if (due.length) rows.push(['If you cancel now', `${due[due.length - 1].pct}% of the fare`]);
  else rows.push(['Free cancellation until', P.ukStamp(starts[0].from)]);
  starts.filter((s) => s.from > at).forEach((s) => {
    const full = s.pct === 100;
    rows.push([full ? 'Full fare from' : `${s.pct}% of the fare from`, `${P.ukStamp(s.from)}${full && version === '3' ? ', or once your driver sets off' : ''}`]);
  });
  if (b.return_journey && b.return_date) rows.push(['Return journey', 'The same charges, counted from its own pickup time']);
  rows.push(['Terms', `Version ${version}: ${terms}`]);
  return { heading: 'Cancellation', rows };
}
function whenFor(b, now, sub) {
  return { date: longDate(b.travel_date), time: hhmm(b.travel_time), text: when(b.travel_date, b.travel_time), relative: relativeDay(b.travel_date, now), sub: sub === undefined ? `Pickup from ${shortPlace(from(b))}` : sub };
}
// Add-to-calendar link for the customer's journey (UK time).
function calendarLink(b) {
  const url = calendarUrl({ title: `EV Exec transfer: ${shortRoute(b)}`, date: b.travel_date, time: b.travel_time, location: from(b), details: `Booking ${b.ref}. Pickup ${from(b)}, drop-off ${to(b)}. Questions: 07721 070370.` });
  return url ? { label: 'Add to calendar', url } : null;
}
function driverRows(d) {
  if (!d) return [];
  const vehicle = [d.vehicle_model, d.vehicle_registration ? String(d.vehicle_registration).toUpperCase() : null].filter(Boolean).join(', ');
  return [['Driver', first(d.full_name)], ['Car', vehicle || null]];
}
const bookingPage = (b) => `${SITE()}/booking?id=${encodeURIComponent(b.id)}`;
const flightLine = (b) => (b.flight_number && /from/i.test(String(b.journey_type || '')) ? `We track flight ${String(b.flight_number).toUpperCase()} and adjust the pickup if it lands early or late.` : null);

function build(subject, spec) { return { subject: oneLine(subject), spec, html: renderEmail(spec), text: renderText(spec) }; }

// ═════════════════════════════ CUSTOMER ═════════════════════════════

function requestReceived(b, { cancelUrl } = {}) {
  const w = when(b.travel_date, b.travel_time);
  return build(`Booking request received: ${w} (Ref ${b.ref})`, {
    audience: 'customer', preheader: `We'll confirm your ${w} transfer by email shortly. Nothing to pay yet.`,
    status: { label: 'Request received', tone: 'gold' }, title: `Thanks ${first(b.customer_name)}, we've got your request`,
    when: whenFor(b),
    intro: ['We are checking availability now and will email you to confirm, usually within a few hours. There is nothing to pay yet.'],
    steps: ['We email you to confirm the booking.', 'You pay by card online, or choose cash on the day.', 'We remind you a week before and the day before.'],
    button: { label: 'View your booking', url: bookingPage(b) },
    sections: journeySections(b, { payment: false }),
    note: cancelUrl ? { html: `Plans changed? <a href="${esc(cancelUrl)}" style="color:#8a6416;font-weight:700">Cancel this request</a>.` } : null,
  });
}

function bookingConfirmed(b, { payUrl, now } = {}) {
  const w = when(b.travel_date, b.travel_time);
  const pay = needsPayment(b);
  return build(`Booking confirmed: ${w} (Ref ${b.ref})`, {
    audience: 'customer', preheader: pay ? `Your ${w} transfer is confirmed. Pay by card or choose cash.` : `Your ${w} transfer is confirmed.`,
    status: { label: 'Booking confirmed', tone: 'green' }, title: 'Your transfer is booked',
    when: whenFor(b, now),
    intro: [`Hi ${first(b.customer_name)}, your booking is confirmed. Keep this email for reference.`],
    steps: pay
      ? ['Pay now by card, or choose cash on the day. It takes under a minute.', 'We remind you a week before and the day before.', 'On the day, your driver texts you when they are on the way.']
      : ['We remind you a week before and the day before.', 'On the day, your driver texts you when they are on the way.'],
    button: pay ? { label: 'Pay now or choose cash', url: payUrl || bookingPage(b) } : { label: 'View your booking', url: bookingPage(b) },
    links: [calendarLink(b)],
    sections: [...journeySections(b), cancellationSection(b, now)].filter(Boolean),
  });
}

function bookingUnavailable(b) {
  const d = longDate(b.travel_date);
  return build(`Sorry, we can't take your booking for ${d} (Ref ${b.ref})`, {
    audience: 'customer', preheader: 'We are fully booked for this journey. No payment has been taken.',
    status: { label: 'Not available', tone: 'red' }, title: "Sorry, we can't do this journey",
    when: whenFor(b),
    intro: [`Hi ${first(b.customer_name)}, unfortunately we cannot take this booking. We are sorry for the inconvenience.`, 'No payment has been taken. If a different time would work, call or WhatsApp us and we will do our best to help.'],
    button: { label: 'WhatsApp us', url: 'https://wa.me/447721070370' },
    sections: [{ heading: 'The journey you asked for', rows: [...journeyRows(b), ['Reference', b.ref]] }],
  });
}

function paymentReceived(b, { receiptUrl, now } = {}) {
  const w = when(b.travel_date, b.travel_time);
  const amount = money(getPrice(b));
  return build(`Payment received${amount ? ` (${amount})` : ''}: ${w} (Ref ${b.ref})`, {
    audience: 'customer', preheader: `Thank you. Your ${w} transfer is paid and confirmed.`,
    status: { label: 'Paid', tone: 'green' }, title: 'Thank you, your transfer is paid',
    when: whenFor(b, now),
    intro: [`Hi ${first(b.customer_name)}, we've received your payment${amount ? ` of ${amount}` : ''}. There is nothing else to do until the day.`],
    steps: ['We remind you a week before and the day before.', 'On the day, your driver texts you when they are on the way.'],
    button: receiptUrl ? { label: 'View your receipt', url: receiptUrl } : { label: 'View your booking', url: bookingPage(b) },
    links: [calendarLink(b)],
    sections: journeySections(b),
  });
}

function cashChosen(b, { now } = {}) {
  const w = when(b.travel_date, b.travel_time);
  const amount = money(getPrice(b));
  return build(`Confirmed, paying cash on the day: ${w} (Ref ${b.ref})`, {
    audience: 'customer', preheader: `You're paying ${amount || 'cash'} to your driver on the day.`,
    status: { label: 'Booking confirmed', tone: 'green' }, title: "You're paying cash on the day",
    when: whenFor(b, now),
    intro: [`Hi ${first(b.customer_name)}, thanks for confirming. Prefer to pay by card? You can still pay online any time before the day.`],
    steps: [`Have ${amount || 'the fare'} in cash ready for your driver.`, 'We remind you a week before and the day before.', 'On the day, your driver texts you when they are on the way.'],
    button: { label: 'View your booking', url: bookingPage(b) },
    links: [{ label: 'Pay by card instead', url: bookingPage(b) }, calendarLink(b)],
    sections: journeySections(b),
  });
}

// q = the cancellation quote from lib/cancellation.js (charge and refund), when
// the customer cancelled with the self-cancel link. Without it (re-rendered
// from the queue) the email says nothing about money.
function cancelledByCustomer(b, q) {
  const d = longDate(b.travel_date);
  const money = q ? `${P.chargeSentence(q).replace('cancelling now costs', 'the cancellation charge is')} ${P.refundSentence(q)}` : '';
  return build(`Cancelled: your transfer on ${d} (Ref ${b.ref})`, {
    audience: 'customer', preheader: money ? `Your booking is cancelled. ${money}` : 'Your booking is cancelled.',
    status: { label: 'Cancelled', tone: 'grey' }, title: 'Your booking is cancelled',
    when: { ...whenFor(b), relative: null },
    intro: [`Hi ${first(b.customer_name)}, as you asked, we've cancelled this booking.${money ? ` ${money}` : ''}`],
    button: { label: 'Book another transfer', url: `${SITE()}/#quote` },
    sections: [{ heading: 'Cancelled journey', rows: [...journeyRows(b), ['Reference', b.ref]] }],
  });
}

function cancelledByUs(b) {
  const d = longDate(b.travel_date);
  return build(`Cancelled: your transfer on ${d} (Ref ${b.ref})`, {
    audience: 'customer', preheader: 'Your booking has been cancelled. If this is unexpected, please call us.',
    status: { label: 'Cancelled', tone: 'red' }, title: 'Your booking has been cancelled',
    when: { ...whenFor(b), relative: null },
    intro: [`Hi ${first(b.customer_name)}, this booking has been cancelled. If you did not expect this, please call or WhatsApp us straight away on 07721 070370.`, 'If you have paid for this journey, we will confirm your refund, or any cancellation charge under our terms, in writing within 24 hours.'],
    button: { label: 'Call 07721 070370', url: 'tel:+447721070370' },
    sections: [{ heading: 'Cancelled journey', rows: [...journeyRows(b), ['Reference', b.ref]] }],
  });
}

function reminder(b, { type, driver, now } = {}) {
  const w = when(b.travel_date, b.travel_time);
  const rel = relativeDay(b.travel_date, now) || longDate(b.travel_date);
  const week = type === '7day';
  const t = hhmm(b.travel_time) || 'your pickup time';
  const driverName = driver && driver.full_name ? first(driver.full_name) : null;
  const steps = week
    ? ['Check the details below are right.', 'Need to change anything? Reply to this email or call us.', 'We send another reminder the day before.']
    : [`Be ready at your pickup point for ${t}.`, `${driverName ? `${driverName}, your driver,` : 'Your driver'} will text you when they are on the way.`, ...(flightLine(b) ? [flightLine(b)] : [])];
  return build(`Reminder: your transfer is ${rel.toLowerCase()}, ${w}`, {
    audience: 'customer', preheader: `${rel}: ${shortRoute(b)} at ${t}.`,
    status: { label: week ? 'Week-ahead reminder' : 'Reminder', tone: 'gold' },
    title: week ? `Your transfer is ${rel.toLowerCase()}` : `Your transfer is ${rel.toLowerCase()}`,
    when: whenFor(b, now),
    intro: [week ? `Hi ${first(b.customer_name)}, your transfer is coming up. Please check the details below.` : `Hi ${first(b.customer_name)}, everything is set for ${rel.toLowerCase()}.`],
    steps,
    button: { label: 'View your booking', url: bookingPage(b) },
    links: [calendarLink(b)],
    sections: [{ heading: 'Your journey', rows: [...journeyRows(b), ...driverRows(driver)] }, { heading: 'Booking', rows: [['Reference', b.ref], ['Payment', paymentLine(b)]] }],
  });
}

function driverOnTheWay(b, { driver } = {}) {
  return build(`Your driver is on the way (Ref ${b.ref})`, {
    audience: 'customer', preheader: `Your driver is heading to ${shortPlace(from(b))} for ${hhmm(b.travel_time) || 'your pickup'}.`,
    status: { label: 'On the way', tone: 'blue' }, title: 'Your driver is on the way',
    when: { relative: 'Pickup time', time: hhmm(b.travel_time), date: longDate(b.travel_date), text: when(b.travel_date, b.travel_time), sub: place(from(b)) },
    intro: [`Hi ${first(b.customer_name)}, ${driver && driver.full_name ? first(driver.full_name) : 'your driver'} is now on the way to your pickup point. Please be ready at your booked time.`],
    sections: [{ rows: [...driverRows(driver), ['Drop-off', place(to(b))], ['Reference', b.ref]] }],
  });
}

function driverArrived(b, { driver } = {}) {
  return build(`Your driver has arrived (Ref ${b.ref})`, {
    audience: 'customer', preheader: `Your driver is waiting at ${shortPlace(from(b))}.`,
    status: { label: 'Arrived', tone: 'green' }, title: 'Your driver has arrived',
    when: { relative: 'Waiting at', text: from(b), sub: driver ? [first(driver.full_name), driver.vehicle_model, driver.vehicle_registration && String(driver.vehicle_registration).toUpperCase()].filter(Boolean).join(' · ') : null },
    intro: [`Hi ${first(b.customer_name)}, your driver is at the pickup point and ready when you are. Take your time.`],
    sections: [{ rows: [...driverRows(driver), ['Reference', b.ref]] }],
  });
}

function quoteReceived(q) {
  const rows = [['From', q.pickup_location], ['To', q.destination], ['When', q.pickup_date ? when(q.pickup_date, q.pickup_time) : null], ['Passengers', q.passengers ? String(q.passengers) : null], ['Return', q.return_required ? (q.return_date ? when(q.return_date, q.return_time) : 'Yes') : null]];
  return build('Your EV Exec quote request', {
    audience: 'customer', preheader: 'We will reply with a fixed price, usually the same day.',
    status: { label: 'Quote request received', tone: 'gold' }, title: `Thanks ${first(q.customer_name)}, we'll send your price soon`,
    intro: ['We will reply with a fixed price, usually the same day. Nothing is booked or charged until you say yes.'],
    sections: [{ heading: 'Your request', rows }],
    // Quoted-booking schedule, terms section 5 (shown before the customer accepts a quote).
    note: 'Cancellation charges for quoted journeys over \u00a3300, bookings of more than one car, or bookings that hold a car for 4 hours or more: free more than 7 days before, 25% from 7 days, 50% from 72 hours and the full price within 24 hours, unless your quote says otherwise. Other journeys follow our standard charges. Full policy: www.evexec.co.uk/terms#cancellation-charges',
  });
}

function paymentLink(b, { url, amount } = {}) {
  const w = when(b.travel_date, b.travel_time);
  const a = money(amount != null ? amount : getPrice(b));
  return build(`Pay for your transfer${a ? ` (${a})` : ''}: ${w} (Ref ${b.ref})`, {
    audience: 'customer', preheader: `Secure card payment for your ${w} transfer.`,
    status: { label: 'Payment requested', tone: 'gold' }, title: `Pay for your transfer${a ? `: ${a}` : ''}`,
    when: whenFor(b),
    intro: [`Hi ${first(b.customer_name)}, please use the button below to pay securely by card (Stripe).`],
    button: { label: `Pay ${a || 'now'}`, url },
    sections: journeySections(b, { payment: false }),
  });
}

function invoice(inv) {
  return build(`Your EV Exec invoice ${inv.number}${inv.total != null ? ` (${money(inv.total)})` : ''}`, {
    audience: 'customer', preheader: `Invoice ${inv.number}${inv.due ? `, due ${longDate(inv.due)}` : ''}.`,
    status: { label: 'Invoice', tone: 'gold' }, title: `Invoice ${inv.number}`,
    when: inv.due ? { text: `Due ${longDate(inv.due)}`, sub: money(inv.total) } : null,
    intro: [`Hi ${first(inv.customer_name)}, your invoice is attached as a PDF. Thank you for travelling with EV Exec.`, inv.terms],
    sections: [{ rows: [['Invoice', inv.number], ['Journey', inv.journey], ['Amount', money(inv.total)], ['Status', inv.status]] }],
  });
}

function journeyReceipt(b, { amount, driver } = {}) {
  return build(`Your journey receipt: ${longDate(b.travel_date)} (Ref ${b.ref})`, {
    audience: 'customer', preheader: `Thank you for travelling with EV Exec${amount ? `. Total ${money(amount)}` : ''}.`,
    status: { label: 'Journey complete', tone: 'green' }, title: 'Thank you for travelling with us',
    when: null,
    intro: [`Hi ${first(b.customer_name)}, here is your receipt. If you enjoyed the journey, a Google review would really help us.`],
    button: { label: 'Leave a Google review', url: 'https://g.page/r/CVPMqDntIQ3xEAE/review' },
    sections: [{ rows: [['Reference', b.ref], ['Pickup', from(b)], ['Drop-off', to(b)], ['When', when(b.travel_date, b.travel_time)], ...driverRows(driver), ['Total', money(amount)], ['Payment', paymentLine(b)]] }],
  });
}

// ═════════════════════════════ OFFICE (staff) ═════════════════════════════

function staffNewBooking(b, { acceptUrl, rejectUrl } = {}) {
  const w = when(b.travel_date, b.travel_time);
  const price = money(getPrice(b));
  return build(`New booking: ${w}, ${shortRoute(b)}${price ? `, ${price}` : ''}`, {
    audience: 'staff', preheader: `${b.customer_name || 'Customer'} · ${w}. Accept or reject.`,
    status: { label: 'New booking request', tone: 'gold' }, title: `${b.customer_name || 'A customer'} wants a transfer`,
    when: whenFor(b, undefined, shortRoute(b)),
    intro: ['Accept to send the customer their confirmation and payment link. Reject to tell them it is unavailable.'],
    button: acceptUrl ? { label: 'Accept', url: acceptUrl } : null, button2: rejectUrl ? { label: 'Reject', url: rejectUrl } : null,
    sections: [{ heading: 'Customer', rows: [['Name', b.customer_name], ['Phone', tel(b.customer_phone)], ['Email', b.customer_email]] }, ...journeySections(b, { staff: true })],
  });
}

function staffPayment(b, { paid, receiptUrl } = {}) {
  const w = when(b.travel_date, b.travel_time);
  const amount = money(getPrice(b));
  return build(paid ? `Paid${amount ? ` ${amount}` : ''}: ${b.ref}, ${w}` : `Paying cash${amount ? ` ${amount}` : ''}: ${b.ref}, ${w}`, {
    audience: 'staff', preheader: `${b.customer_name || 'Customer'} · ${paymentLine(b)}`,
    status: { label: paid ? 'Payment received' : 'Customer paying cash', tone: paid ? 'green' : 'gold' },
    title: paid ? `${b.customer_name || 'Customer'} has paid${amount ? ` ${amount}` : ''}` : `${b.customer_name || 'Customer'} will pay cash on the day`,
    when: whenFor(b, undefined, shortRoute(b)),
    button: receiptUrl ? { label: 'View Stripe receipt', url: receiptUrl } : null,
    sections: [{ rows: [['Booking', b.ref], ['Customer', b.customer_name], ['Phone', tel(b.customer_phone)], ['Amount', amount], ['Payment', paymentLine(b)]] }],
  });
}

function staffCustomerCancelled(b, q) {
  const charge = !q ? '' : q.request ? 'No charge: the request had not been accepted.'
    : q.pct === 0 ? `No charge: cancelled outside the charge period (policy v${q.version}).`
    : `Cancellation charge under policy v${q.version}: ${q.pct}%${q.charge != null ? ` = ${P.money(q.charge)}` : ''}. ${q.paid ? `Customer paid ${P.money(q.paid)}; refund ${q.refund != null ? P.money(q.refund) : 'to confirm'} in Stripe.` : 'Not paid yet: send a payment link or invoice for the charge, or waive it.'}`;
  return build(`Customer cancelled: ${b.ref}, ${when(b.travel_date, b.travel_time)}`, {
    audience: 'staff', preheader: `${b.customer_name || 'Customer'} cancelled. ${charge}`.trim(),
    status: { label: 'Cancelled by customer', tone: 'red' }, title: `${b.customer_name || 'The customer'} cancelled their booking`,
    when: whenFor(b, undefined, shortRoute(b)),
    intro: ['The booking is now marked Cancelled. If a driver was assigned, let them know.', charge, b.return_journey ? 'Only the outward journey was cancelled. Check whether the customer also wants the return leg cancelled.' : ''].filter(Boolean),
    sections: [{ rows: [['Booking', b.ref], ['Customer', b.customer_name], ['Phone', tel(b.customer_phone)], ...journeyRows(b)] }],
  });
}

function staffNewQuote(q) {
  return build(`Quote request: ${shortPlace(q.pickup_location)} → ${shortPlace(q.destination)}${q.pickup_date ? `, ${when(q.pickup_date, q.pickup_time)}` : ''}`, {
    audience: 'staff', preheader: `${q.customer_name} · ${q.phone}`,
    status: { label: 'New quote request', tone: 'gold' }, title: `${q.customer_name} wants a price`,
    when: q.pickup_date ? { text: when(q.pickup_date, q.pickup_time), sub: `${q.pickup_location} → ${q.destination}` } : null,
    intro: ['Reply with a fixed price. The customer has had an acknowledgement email.'],
    button: q.phone ? { label: `Call ${q.phone}`, url: `tel:${String(q.phone).replace(/\s+/g, '')}` } : null,
    sections: [{ rows: [['Name', q.customer_name], ['Phone', tel(q.phone)], ['Email', q.email], ['From', q.pickup_location], ['To', q.destination], ['Passengers', q.passengers ? String(q.passengers) : null], ['Luggage', q.luggage], ['Return', q.return_required ? (q.return_date ? when(q.return_date, q.return_time) : 'Yes') : null], ['Notes', q.notes]] }],
  });
}

function staffDuplicatePayment(b, { amount, stripeId } = {}) {
  return build(`Check Stripe: possible double payment ${b.ref} (${money(amount) || 'amount unknown'})`, {
    audience: 'staff', preheader: 'A card payment arrived for a booking already marked Paid.',
    status: { label: 'Action needed', tone: 'red' }, title: 'Possible double payment',
    intro: ['Stripe took a card payment for a booking that was already marked Paid. The booking has not been changed. Check Stripe and refund the extra payment if the customer paid twice.'],
    button: { label: 'Open Stripe payments', url: 'https://dashboard.stripe.com/payments' },
    sections: [{ rows: [['Booking', b.ref], ['Customer', b.customer_name], ['Phone', tel(b.customer_phone)], ['Journey', when(b.travel_date, b.travel_time)], ['Amount paid', money(amount)], ['Stripe payment', stripeId]] }],
  });
}

// ═════════════════════════════ DRIVER ═════════════════════════════

const DRIVER_APP = () => (process.env.DRIVER_APP_URL || 'https://evexecdriverapp.vercel.app').replace(/\/$/, '');
const jobUrl = (b, q = '') => `${DRIVER_APP()}/jobs/${encodeURIComponent(b.id)}${q}`;

function fareText(b) {
  if (isReturnLeg(b)) return 'Included with the outbound booking. Nothing to collect.';
  const s = String(b.payment_status || '').toLowerCase(), m = String(b.payment_method || '').toLowerCase();
  const price = money(getPrice(b));
  if (s === 'paid') return 'Paid in advance. Nothing to collect.';
  if (m === 'cash') return price ? `Collect ${price} in cash.` : 'Collect cash. Amount to be confirmed by the office.';
  if (s === 'invoiced' || m === 'bank transfer' || m === 'bank_transfer' || m === 'payment link' || m === 'card') return 'Paid to the office. Do not collect.';
  return `Not paid yet. Check with the office before the job${price ? ` (${price})` : ''}.`;
}
function driverJobRows(b) {
  return [
    ['Customer', b.customer_name], ['Phone', tel(b.customer_phone)],
    ['Pickup', place(from(b))], ...getStops(b).map((s, i) => [`Stop ${i + 1}`, place(s)]), ['Drop-off', place(to(b))],
    ['Flight', b.flight_number ? String(b.flight_number).toUpperCase() : null],
    ['Passengers and luggage', [`${b.passengers || 1} passenger${(b.passengers || 1) == 1 ? '' : 's'}`, b.luggage].filter(Boolean).join(' · ')],
    ['Fare', fareText(b)], ['Reference', b.ref],
  ];
}

function driverNewJob(b, { now } = {}) {
  const w = when(b.travel_date, b.travel_time);
  return build(`New job: ${w}, ${shortRoute(b)} (Ref ${b.ref})`, {
    audience: 'driver', preheader: `${b.customer_name || 'Customer'} · ${shortRoute(b)} · ${fareText(b)}`,
    status: { label: 'New job', tone: 'gold' }, title: `New job: ${shortRoute(b)}`,
    when: whenFor(b, now, `Pickup from ${shortPlace(from(b))} · ${fareText(b)}`),
    intro: ['You have been given this job. It is now in your Jobs list in the driver app.'],
    button: { label: 'Open job', url: jobUrl(b) },
    button2: { label: 'Directions', url: mapsDirections(from(b)) },
    sections: [{ rows: driverJobRows(b) }],
  });
}

function driverReminder(b, { type, now } = {}) {
  const w = when(b.travel_date, b.travel_time);
  const hour = type === '1h';
  const t = hhmm(b.travel_time) || 'the booked time';
  return build(hour ? `Pickup in 1 hour: ${t} at ${shortPlace(from(b))} (Ref ${b.ref})` : `Job tomorrow: ${w}, ${b.customer_name || 'customer'} (Ref ${b.ref})`, {
    audience: 'driver', preheader: `${b.customer_name || 'Customer'} · ${shortRoute(b)} · ${fareText(b)}`,
    status: { label: hour ? 'Pickup in 1 hour' : 'Job tomorrow', tone: hour ? 'red' : 'gold' },
    title: hour ? `Leave for ${shortPlace(from(b))} now` : `Tomorrow: ${shortRoute(b)}`,
    when: whenFor(b, now),
    steps: hour
      ? ['Head to the pickup point now.', 'Swipe "On my way" in the app. Messages opens with a text to the customer ready to send.', fareText(b)]
      : ['Open the job and send the customer their reminder text (two taps).', 'Check the flight and the pickup address.', 'Make sure the car is clean and charged.'],
    button: { label: hour ? 'Open job' : 'Open job and send reminder', url: jobUrl(b, hour ? '' : '?reminder=24hr') },
    button2: { label: 'Directions', url: mapsDirections(from(b)) },
    links: b.customer_phone ? [{ label: `Call ${first(b.customer_name)}`, url: `tel:${String(b.customer_phone).replace(/\s+/g, '')}` }] : [],
    sections: [{ rows: driverJobRows(b) }],
  });
}

function driverJobCancelled(b) {
  return build(`Job cancelled, do not travel: ${when(b.travel_date, b.travel_time)} (Ref ${b.ref})`, {
    audience: 'driver', preheader: `${b.customer_name || 'Customer'} · ${shortRoute(b)} has been cancelled.`,
    status: { label: 'Job cancelled', tone: 'red' }, title: 'This job is cancelled. Do not travel.',
    when: { ...whenFor(b), relative: null },
    intro: ['The office has cancelled this job. It has been removed from your Jobs list. You do not need to contact the customer.'],
    sections: [{ rows: [['Customer', b.customer_name], ['Pickup', from(b)], ['Drop-off', to(b)], ['Reference', b.ref]] }],
  });
}

function driverJobUpdated(b, { changes = [], now } = {}) {
  return build(`Job changed: now ${when(b.travel_date, b.travel_time)} (Ref ${b.ref})`, {
    audience: 'driver', preheader: changes.length ? `Changed: ${changes.map(c => c[0]).join(', ')}` : 'The job details have changed.',
    status: { label: 'Job changed', tone: 'blue' }, title: 'This job has changed',
    when: whenFor(b, now),
    intro: ['Please check the new details. The job in the app is already updated.'],
    sections: [...(changes.length ? [{ heading: 'What changed', rows: changes.map(([k, before, after]) => [k, { html: `<span style="color:#64748b;text-decoration:line-through;font-weight:400">${esc(before || 'None')}</span><br>${esc(after || 'None')}` }]) }] : []), { heading: 'Job now', rows: driverJobRows(b) }],
    button: { label: 'Open job', url: jobUrl(b) },
  });
}

// Sent when the driver's phone could not get the push notification. Only for
// the day-before reminder (week-ahead is push only, user decision 2026-10-14).
function driverCustomerReminderDue(b, { message, now } = {}) {
  const w = when(b.travel_date, b.travel_time);
  const name = b.customer_name || 'the customer';
  return build(`Text ${name} their reminder: job ${relativeDay(b.travel_date, now) ? relativeDay(b.travel_date, now).toLowerCase() + ', ' : ''}${w} (Ref ${b.ref})`, {
    audience: 'driver', preheader: `Two taps: open the reminder, then press Send.`,
    status: { label: 'Customer reminder to send', tone: 'gold' }, title: `Send ${name} their reminder text`,
    when: { date: longDate(b.travel_date), time: hhmm(b.travel_time), text: w, relative: relativeDay(b.travel_date, now) ? `Job ${relativeDay(b.travel_date, now).toLowerCase()}` : 'Job', sub: shortRoute(b) },
    steps: ['Tap <strong>Open reminder</strong>. Messages opens with the text ready.', 'Check it and press <strong>Send</strong>.', 'Back in the app it is marked as sent.'].map(html => ({ html })),
    button: { label: 'Open reminder', url: jobUrl(b, '?reminder=24hr') },
    links: b.customer_phone ? [{ label: `Call ${first(name)} instead`, url: `tel:${String(b.customer_phone).replace(/\s+/g, '')}` }] : [],
    sections: [
      { rows: [['Customer', name], ['Phone', tel(b.customer_phone)], ['Pickup', place(from(b))], ['Reference', b.ref]] },
      ...(message ? [{ heading: 'The text they will get', quote: message }] : []),
    ],
  });
}

// Pickup check-in (attestation engine): the driver confirms they are on track.
function driverConfirmPickup(b, { urgent, now } = {}) {
  const t = hhmm(b.travel_time) || 'the booked time';
  return build(urgent ? `URGENT: confirm your ${t} pickup now (Ref ${b.ref})` : `Confirm your ${t} pickup: ${shortPlace(from(b))} (Ref ${b.ref})`, {
    audience: 'driver', preheader: urgent ? 'The office has not had your confirmation yet.' : 'Tap to confirm you are on track.',
    status: { label: urgent ? 'Confirmation overdue' : 'Please confirm', tone: urgent ? 'red' : 'gold' },
    title: urgent ? 'Confirm your pickup now' : "Confirm you're on track for this pickup",
    when: whenFor(b, now),
    steps: ['Open the driver app.', 'Tap <strong>Confirm</strong> on this job.'].map(html => ({ html })),
    intro: [urgent ? 'The office has not had your confirmation yet and will call you shortly if it does not arrive.' : null],
    button: { label: 'Open the app and confirm', url: `${DRIVER_APP()}/dashboard` },
    sections: [{ rows: [['Customer', b.customer_name], ['Pickup', place(from(b))], ['Reference', b.ref]] }],
  });
}

function staffDriverNotConfirmed(b, { driver } = {}) {
  return build(`Driver hasn't confirmed: ${b.ref}, ${when(b.travel_date, b.travel_time)}`, {
    audience: 'staff', preheader: `${driver && driver.full_name ? first(driver.full_name) : 'The driver'} has not confirmed the ${hhmm(b.travel_time) || ''} pickup.`,
    status: { label: 'Action needed', tone: 'red' }, title: `${driver && driver.full_name ? first(driver.full_name) : 'The driver'} hasn't confirmed this pickup`,
    when: whenFor(b, undefined, shortRoute(b)),
    intro: ['The driver did not confirm after two reminders. Call them, or reassign the job.'],
    button: driver && driver.phone ? { label: `Call ${first(driver.full_name)}`, url: `tel:${String(driver.phone).replace(/\s+/g, '')}` } : null,
    sections: [{ rows: [['Driver', driver && driver.full_name], ['Driver phone', tel(driver && driver.phone)], ['Customer', b.customer_name], ['Customer phone', tel(b.customer_phone)], ['Pickup', place(from(b))], ['Reference', b.ref]] }],
  });
}

module.exports = {
  requestReceived, bookingConfirmed, bookingUnavailable, paymentReceived, cashChosen, cancelledByCustomer, cancelledByUs,
  reminder, driverOnTheWay, driverArrived, quoteReceived, paymentLink, invoice, journeyReceipt,
  staffNewBooking, staffPayment, staffCustomerCancelled, staffNewQuote, staffDuplicatePayment,
  driverNewJob, driverReminder, driverJobCancelled, driverJobUpdated, driverCustomerReminderDue, driverConfirmPickup, staffDriverNotConfirmed,
  fareText, route, shortRoute,
};
