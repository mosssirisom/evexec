'use strict';

// Every booking email (customer, operator, driver) is built here from the
// booking row, using the EV Exec layout and the correspondence standard in
// ./correspondence.js. Website routes call these directly; database
// triggers, edge functions and the operator app queue a request
// (notification_queue.meta.render) and lib/notificationQueue.js renders it
// from the current booking when it is sent.
//
// Each builder returns { subject, html, text }. `text` is the same message as
// plain text, used for the two-tap SMS handoff when there is no email.

const { emailLayout } = require('./emailLayout');
const {
  ukDate, ukWhen, ukWhenFromTimestamp, journeyText, journeyHtml, routeLine,
  paymentLine, driverPaymentLine, isReturnLeg, esc
} = require('./correspondence');

const PHONE = '07721 070370';
const F = 'font-family:Inter,Arial,sans-serif;';
const P = {
  hi: `margin:0 0 6px;${F}font-size:15px;color:#fff`,
  lead: `margin:0 0 20px;${F}font-size:15px;color:rgba(255,255,255,.65);line-height:1.6`,
  note: `margin:0 0 20px;${F}font-size:14px;color:rgba(255,255,255,.65);line-height:1.6`,
  foot: `margin:0;${F}font-size:13px;color:rgba(255,255,255,.5)`,
  lbl: `margin:0 0 4px;${F}font-size:13px;color:rgba(255,255,255,.5);text-transform:uppercase;letter-spacing:.05em`,
  who: `margin:0 0 20px;${F}font-size:16px;font-weight:700;color:#fff`
};
const GREY = { accent: '#374151', accentText: '#fff' };

function site() { return process.env.SITE_URL || 'https://evexec.co.uk'; }
function firstName(b) { return String(b.customer_name || 'there').trim().split(/\s+/)[0] || 'there'; }

function price(b) {
  if (isReturnLeg(b)) return null;
  const p = Number(b.quoted_price ?? b.price);
  return Number.isFinite(p) && p > 0 ? p : null;
}
function money(p) { return p == null ? null : `£${Number(p).toFixed(2).replace(/\.00$/, '')}`; }

function refBadgeHtml(ref) {
  if (!ref) return '';
  return `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:0 0 22px;width:100%"><tr><td style="background:rgba(213,165,56,.08);border:1px solid rgba(213,165,56,.35);border-radius:10px;padding:14px 16px">
    <p style="margin:0 0 4px;${F}font-size:11px;font-weight:700;color:#d5a538;text-transform:uppercase;letter-spacing:.08em">Your Booking Reference</p>
    <p style="margin:0 0 6px;${F}font-size:20px;font-weight:800;color:#fff;letter-spacing:.04em">${esc(ref)}</p>
    <p style="margin:0;${F}font-size:12px;color:rgba(255,255,255,.55);line-height:1.5">Save this. You'll need it, along with your phone number, to check your booking anytime at evexec.co.uk/booking.</p>
  </td></tr></table>`;
}

function button(url, label) {
  return `<p style="margin:0 0 22px"><a href="${esc(url)}" style="display:inline-block;background:#d5a538;color:#06101c;${F}font-size:15px;font-weight:700;text-decoration:none;padding:13px 24px;border-radius:8px">${esc(label)}</a></p>`;
}
function link(url, label) {
  return `<p style="margin:0 0 20px"><a href="${esc(url)}" style="color:#d5a538;${F}font-size:14px;text-decoration:none">${esc(label)} →</a></p>`;
}
const contactFoot = `<p style="${P.foot}">Questions? Call or WhatsApp: <a href="tel:07721070370" style="color:#d5a538;text-decoration:none">${PHONE}</a></p>`;

function customerRows(b, { showPayment = true } = {}) {
  return [
    ['Passengers', `${b.passengers || 1}`],
    ['Luggage', b.luggage],
    ['Flight', b.flight_number || b.flight],
    ['Price', money(price(b))],
    ['Payment', showPayment ? paymentLine(b) : null]
  ];
}

function textBlock(lines) { return lines.filter(l => l !== null && l !== undefined).join('\n'); }

// ─── Customer ──────────────────────────────────────────────────────────────

function customerRequestReceived(b, { cancelUrl } = {}) {
  const subject = `Booking request received (Ref ${b.ref})`;
  const html = emailLayout({ title: 'Booking Request Received', body:
    `<p style="${P.hi}">Hi ${esc(firstName(b))},</p><p style="${P.lead}">We've received your airport transfer request and will confirm availability shortly. No payment has been taken yet.</p>${refBadgeHtml(b.ref)}${journeyHtml(b, { rows: customerRows(b) })}${contactFoot}` });
  const text = textBlock([`Hi ${firstName(b)}, your EV Exec booking request has been received (Ref ${b.ref}).`, '', journeyText(b), `Payment: ${paymentLine(b)}`, '', "We'll confirm availability shortly.", '', 'Modify: https://wa.me/447721070370', cancelUrl ? `Cancel: ${cancelUrl}` : null]);
  return { subject, html, text };
}

// Booking accepted/confirmed, and payment received. The title follows the
// booking's actual payment state.
function customerConfirmed(b, { paymentUrl, receiptUrl, cancelUrl } = {}) {
  const paid = /^Paid/.test(paymentLine(b));
  const title = paid ? 'Payment Received' : 'Booking Confirmed';
  const subject = paid ? `Payment received: your EV Exec transfer (Ref ${b.ref})` : `Your EV Exec transfer is confirmed (Ref ${b.ref})`;
  const lead = paid
    ? 'Thank you, your payment has been received and your airport transfer is confirmed.'
    : 'Your airport transfer is confirmed. We look forward to seeing you.';
  const payBtn = !paid && paymentUrl ? button(paymentUrl, money(price(b)) ? `Pay ${money(price(b))}` : 'Complete payment') : '';
  const html = emailLayout({ title, body:
    `<p style="${P.hi}">Hi ${esc(firstName(b))},</p><p style="${P.lead}">${lead}</p>${refBadgeHtml(b.ref)}${journeyHtml(b, { rows: customerRows(b) })}${payBtn}${receiptUrl ? link(receiptUrl, 'View payment receipt') : ''}${cancelUrl ? link(cancelUrl, 'Need to cancel?') : ''}${contactFoot}` });
  const text = textBlock([paid ? `Hi ${firstName(b)}, thank you, your payment has been received and your EV Exec transfer is confirmed (Ref ${b.ref}).` : `Hi ${firstName(b)}, your EV Exec transfer is confirmed (Ref ${b.ref}).`, '', journeyText(b), `Payment: ${paymentLine(b)}`, !paid && paymentUrl ? `Pay securely: ${paymentUrl}` : null, receiptUrl ? `Receipt: ${receiptUrl}` : null, '', `Questions: ${PHONE}`]);
  return { subject, html, text };
}

function customerRejected(b) {
  const subject = `About your EV Exec transfer request (Ref ${b.ref})`;
  const html = emailLayout({ title: 'Journey Unavailable', ...GREY, body:
    `<p style="${P.hi}">Hi ${esc(firstName(b))},</p><p style="${P.lead}">Unfortunately, EV Exec is unable to cover your requested journey. We're sorry for any inconvenience caused.</p>${refBadgeHtml(b.ref)}${journeyHtml(b)}<p style="${P.note}">No payment has been taken. Please get in touch if you'd like to discuss alternatives.</p>${contactFoot}` });
  const text = textBlock([`Hi ${firstName(b)}, unfortunately EV Exec is unable to cover your journey (Ref ${b.ref}).`, '', journeyText(b), '', 'No payment has been taken. Sorry for any inconvenience.', `Questions: ${PHONE}`]);
  return { subject, html, text };
}

function customerCancelled(b) {
  const paid = /^Paid/.test(paymentLine(b)) && !isReturnLeg(b);
  const money_ = paid ? "As you've already paid, we'll be in touch about your refund." : 'No payment has been taken.';
  const subject = `Your EV Exec transfer has been cancelled (Ref ${b.ref})`;
  const html = emailLayout({ title: 'Booking Cancelled', ...GREY, body:
    `<p style="${P.hi}">Hi ${esc(firstName(b))},</p><p style="${P.lead}">Your EV Exec airport transfer has been cancelled. ${money_} If this is unexpected, please contact us.</p>${refBadgeHtml(b.ref)}${journeyHtml(b)}<p style="${P.foot}">Need to rebook? <a href="${site()}" style="color:#d5a538;text-decoration:none">evexec.co.uk</a> or WhatsApp <a href="https://wa.me/447721070370" style="color:#d5a538;text-decoration:none">${PHONE}</a></p>` });
  const text = `Hi ${firstName(b)}, your EV Exec transfer (Ref ${b.ref}, ${ukWhen(b.travel_date, b.travel_time)}) has been cancelled. ${money_} If this is unexpected, please call ${PHONE}.`;
  return { subject, html, text };
}

function driverSentence(driver) {
  const first = driver && driver.full_name ? String(driver.full_name).trim().split(/\s+/)[0] : null;
  if (!first) return '';
  const vehicle = driver.vehicle_model || 'vehicle';
  const reg = driver.vehicle_registration ? ` (registration ${driver.vehicle_registration})` : '';
  return ` Your driver, ${first}, will be in a ${vehicle}${reg}.`;
}

// Customer reminder. `when` is 'today' | 'tomorrow' | 'in N days'.
function customerReminder(b, { when, driver } = {}) {
  const leg = { ...b, return_journey: false };
  const subject = `Reminder: your transfer is ${when} (Ref ${b.ref})`;
  const drv = driverSentence(driver);
  const html = emailLayout({ title: 'Upcoming Transfer', body:
    `<p style="${P.hi}">Hi ${esc(firstName(b))},</p><p style="${P.lead}">This is a friendly reminder that your airport transfer is <strong style="color:#fff">${esc(when)}</strong>.${esc(drv)}</p>${refBadgeHtml(b.ref)}${journeyHtml(leg, { rows: customerRows(leg) })}${contactFoot}` });
  const text = textBlock([`Hi ${firstName(b)}, reminder: your EV Exec transfer is ${when === 'today' || when === 'tomorrow' ? when.toUpperCase() : when} (Ref ${b.ref}).${drv}`, '', journeyText(leg), `Payment: ${paymentLine(leg)}`, '', `Questions: ${PHONE}`]);
  return { subject, html, text, pushTitle: `Transfer ${when === 'today' ? 'Today' : when === 'tomorrow' ? 'Tomorrow' : when}`, pushBody: `${routeLine(leg)}, ${ukWhen(leg.travel_date, leg.travel_time)}.` };
}

function customerPaymentLink(b, { paymentUrl }) {
  const amount = money(price(b));
  const subject = `Complete payment for your EV Exec transfer (Ref ${b.ref})`;
  const html = emailLayout({ title: 'Complete Your Payment', body:
    `<p style="${P.hi}">Hi ${esc(firstName(b))},</p><p style="${P.lead}">Please use the secure link below to pay for your EV Exec airport transfer.</p>${refBadgeHtml(b.ref)}${journeyHtml(b, { rows: customerRows(b) })}${button(paymentUrl, amount ? `Pay ${amount}` : 'Complete payment')}${contactFoot}` });
  const text = textBlock([`Hi ${firstName(b)}, please complete payment for your EV Exec transfer (Ref ${b.ref})${amount ? `, ${amount}` : ''}:`, paymentUrl, '', journeyText(b)]);
  return { subject, html, text };
}

const STATUS_COPY = {
  en_route: { title: 'Your Driver Is On The Way', lead: 'Your EV Exec driver is on the way to your pickup point.', subject: 'Your driver is on the way' },
  arrived: { title: 'Your Driver Has Arrived', lead: 'Your EV Exec driver has arrived at the pickup point.', subject: 'Your driver has arrived' }
};

function customerStatus(b, { status, driver } = {}) {
  if (status === 'cancelled') return customerCancelled(b);
  const c = STATUS_COPY[status];
  if (!c) throw new Error(`Unknown status template: ${status}`);
  const leg = { ...b, return_journey: false };
  const drv = driverSentence(driver).replace(' will be in', ' is in');
  const subject = `${c.subject} (Ref ${b.ref})`;
  const html = emailLayout({ title: c.title, body:
    `<p style="${P.hi}">Hi ${esc(firstName(b))},</p><p style="${P.lead}">${c.lead}${esc(drv)}</p>${refBadgeHtml(b.ref)}${journeyHtml(leg)}${contactFoot}` });
  const text = `EV Exec: ${c.lead}${drv} Ref ${b.ref}.`;
  return { subject, html, text };
}

function receiptRows(b, expenses) {
  const p = price(b);
  const exp = (expenses || []).filter(e => Number(e.amount) > 0);
  const rows = [['Completed', ukWhenFromTimestamp(b.completed_at)], ['Passengers', `${b.passengers || 1}`], ['Fare', money(p)]];
  exp.forEach(e => rows.push([String(e.type || 'Expense').replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase()), money(Number(e.amount))]));
  if (exp.length) rows.push(['Total', money((p || 0) + exp.reduce((s, e) => s + Number(e.amount), 0))]);
  rows.push(['Payment', paymentLine(b)]);
  return rows;
}

function customerReceipt(b, { expenses } = {}) {
  const leg = { ...b, return_journey: false };
  const subject = `Your EV Exec journey receipt (Ref ${b.ref})`;
  const html = emailLayout({ title: 'Journey Receipt', body:
    `<p style="${P.hi}">Hi ${esc(firstName(b))},</p><p style="${P.lead}">Thank you for travelling with EV Exec. Here's a summary of your journey.</p>${refBadgeHtml(b.ref)}${journeyHtml(leg, { rows: receiptRows(b, expenses) })}${contactFoot}` });
  const text = textBlock([`Hi ${firstName(b)}, thank you for travelling with EV Exec. Your journey (Ref ${b.ref}) is complete.`, money(price(b)) ? `Fare: ${money(price(b))}` : null, `Payment: ${paymentLine(b)}`]);
  return { subject, html, text };
}

function corporateReceipt(b, { expenses, driver } = {}) {
  const leg = { ...b, return_journey: false };
  const subject = `EV Exec journey invoice (Ref ${b.ref})`;
  const rows = [['Passenger', b.customer_name], ['Driver', driver && driver.full_name], ...receiptRows(b, expenses)];
  const html = emailLayout({ title: 'Journey Invoice', body:
    `<p style="${P.lead}">Journey summary for your records.</p>${refBadgeHtml(b.ref)}${journeyHtml(leg, { rows })}${contactFoot}` });
  return { subject, html, text: '' };
}

// ─── Operator ──────────────────────────────────────────────────────────────

function operatorCustomerHtml(b) {
  return `<p style="${P.lbl}">Customer</p><p style="${P.who}">${esc(b.customer_name)} &nbsp;&middot;&nbsp; <a href="tel:${esc(b.customer_phone)}" style="color:#d5a538;text-decoration:none">${esc(b.customer_phone)}</a></p>`;
}

function operatorNewBooking(b, { dispatchUrl } = {}) {
  const subject = `New booking: ${routeLine(b)}, ${ukWhen(b.travel_date, b.travel_time)}`;
  const html = emailLayout({ title: 'New Booking Request', body:
    `${operatorCustomerHtml(b)}${refBadgeHtml(b.ref)}${journeyHtml(b, { rows: customerRows(b) })}${dispatchUrl ? button(dispatchUrl, 'Open in dispatch') : ''}` });
  const text = textBlock([`NEW BOOKING ${b.ref}: ${money(price(b)) || 'price TBC'}, ${paymentLine(b)}`, `Customer: ${b.customer_name} (${b.customer_phone})`, '', journeyText(b), dispatchUrl ? `\nOpen in dispatch: ${dispatchUrl}` : null]);
  return { subject, html, text };
}

function operatorPaymentConfirmed(b, { receiptUrl } = {}) {
  const paid = /^Paid/.test(paymentLine(b));
  const label = paid ? 'Payment confirmed' : 'Booking confirmed';
  const subject = `${label}: ${routeLine(b)}, ${ukWhen(b.travel_date, b.travel_time)}`;
  const html = emailLayout({ title: paid ? 'Payment Confirmed' : 'Booking Confirmed', body:
    `${operatorCustomerHtml(b)}${refBadgeHtml(b.ref)}${journeyHtml(b, { rows: customerRows(b) })}${receiptUrl ? link(receiptUrl, 'View Stripe receipt') : ''}` });
  return { subject, html, text: `${label}: ${b.customer_name}, ${routeLine(b)}, ${ukWhen(b.travel_date, b.travel_time)}. ${paymentLine(b)}.` };
}

function operatorCancelled(b) {
  const subject = `Cancelled: ${routeLine(b)}, ${ukWhen(b.travel_date, b.travel_time)}`;
  const html = emailLayout({ title: 'Booking Cancelled by Customer', ...GREY, body:
    `${operatorCustomerHtml(b)}${refBadgeHtml(b.ref)}${journeyHtml(b, { rows: customerRows(b) })}` });
  return { subject, html, text: subject };
}

// ─── Driver ────────────────────────────────────────────────────────────────

function driverRows(b) {
  const p = price(b);
  return [
    ['Reference', b.ref],
    ['Customer', [b.customer_name, b.customer_phone].filter(Boolean).join(' · ')],
    ['Flight', b.flight_number || b.flight],
    ['Passengers', `${b.passengers || 1}`],
    ['Luggage', b.luggage],
    ['Payment', driverPaymentLine(b, p != null ? String(p) : null)],
    ['Notes', b.driver_notes]
  ];
}

function driverJobUrl(b) { return `${process.env.DRIVER_APP_URL || 'https://evexecdriverapp.vercel.app'}/jobs/${b.id}`; }

function driverEmail(b, driver, { title, subject, lead, grey }) {
  const leg = { ...b, return_journey: false };
  const name = driver && driver.full_name ? String(driver.full_name).trim().split(/\s+/)[0] : 'there';
  const html = emailLayout({ title, ...(grey ? GREY : {}), body:
    `<p style="${P.hi}">Hi ${esc(name)},</p><p style="${P.lead}">${lead}</p>${journeyHtml(leg, { rows: driverRows(b) })}${button(driverJobUrl(b), 'View job')}` });
  const text = textBlock([lead.replace(/<[^>]+>/g, ''), '', journeyText(leg), `Payment: ${driverPaymentLine(b, price(b))}`]);
  return { subject, html, text };
}

function driverNewJob(b, { driver } = {}) {
  return driverEmail(b, driver, { title: 'New Job', subject: `New job ${b.ref}: ${ukWhen(b.travel_date, b.travel_time)}`, lead: 'A new job has been assigned to you.' });
}
function driverJobUpdated(b, { driver } = {}) {
  return driverEmail(b, driver, { title: 'Job Updated', subject: `Job updated ${b.ref}: ${ukWhen(b.travel_date, b.travel_time)}`, lead: 'The details of this job have changed. Please check the updated information below.' });
}
function driverJobCancelled(b, { driver } = {}) {
  return driverEmail(b, driver, { title: 'Job Cancelled', grey: true, subject: `Job cancelled ${b.ref}: ${ukWhen(b.travel_date, b.travel_time)}`, lead: 'This job has been cancelled. Please do not travel to the pickup point.' });
}
function driverReminder(b, { driver, reminder } = {}) {
  const oneHour = reminder === '1h';
  const time = ukWhen(b.travel_date, b.travel_time);
  return driverEmail(b, driver, {
    title: oneHour ? 'Pickup in 1 Hour' : 'Job Reminder',
    subject: oneHour ? `1-hour reminder ${b.ref}: ${time}` : `Reminder: job ${b.ref}, ${time}`,
    lead: oneHour ? `Your pickup is in 1 hour (${esc(time)}). Please make your way to the pickup point now.` : `Reminder: you have a job at ${esc(time)}. Please make sure your vehicle is clean, charged and ready.`
  });
}

// Attestation: the driver hasn't confirmed and push couldn't reach them.
function driverConfirmJob(b, { driver } = {}) {
  return driverEmail(b, driver, { title: 'Please Confirm Your Job', subject: `Please confirm job ${b.ref}: ${ukWhen(b.travel_date, b.travel_time)}`, lead: "Please open the job and confirm you're on track for this pickup." });
}

// Two-tap handoff: the driver texts the customer from their own phone.
function driverSmsTask(b, { driver, message, task_url: taskUrl } = {}) {
  const name = driver && driver.full_name ? String(driver.full_name).trim().split(/\s+/)[0] : 'there';
  const url = `${process.env.DRIVER_APP_URL || 'https://evexecdriverapp.vercel.app'}${taskUrl || `/jobs/${b.id}`}`;
  const subject = `Text ${b.customer_name || 'the customer'} (Ref ${b.ref})`;
  const html = emailLayout({ title: 'Customer Message to Send', body:
    `<p style="${P.hi}">Hi ${esc(name)},</p><p style="${P.lead}">${esc(b.customer_name || 'The customer')} has no email address, so please text them from your phone (${esc(b.customer_phone)}):</p><p style="${P.note};white-space:pre-line;border-left:3px solid #d5a538;padding-left:12px">${esc(message || '')}</p>${button(url, 'Open and send')}` });
  return { subject, html, text: message || '' };
}

function operatorPanic(b) {
  const subject = `URGENT: no driver confirmed ${b.ref}, ${ukWhen(b.travel_date, b.travel_time)}`;
  const dispatchUrl = `${process.env.OPERATOR_APP_URL || 'https://evexecoperator.vercel.app'}/operator/dispatch`;
  const html = emailLayout({ title: 'Urgent: Manual Dispatch Needed', accent: '#b91c1c', accentText: '#fff', body:
    `<p style="${P.lead}">No driver has confirmed this job and there is no one left to reassign it to. Please dispatch it manually now.</p>${operatorCustomerHtml(b)}${refBadgeHtml(b.ref)}${journeyHtml({ ...b, return_journey: false }, { rows: customerRows(b) })}${button(dispatchUrl, 'Open dispatch')}` });
  return { subject, html, text: subject };
}

// ─── Queue rendering ───────────────────────────────────────────────────────

const RENDERERS = {
  booking_confirmed: (b, x) => customerConfirmed(b, { paymentUrl: x.payment_url, receiptUrl: x.receipt_url }),
  payment_confirmed: (b, x) => customerConfirmed(b, { receiptUrl: x.receipt_url }),
  booking_rejected: b => customerRejected(b),
  payment_link: (b, x) => customerPaymentLink(b, { paymentUrl: x.payment_url }),
  status_en_route: (b, x) => customerStatus(b, { status: 'en_route', driver: x.driver }),
  status_arrived: (b, x) => customerStatus(b, { status: 'arrived', driver: x.driver }),
  status_cancelled: b => customerCancelled(b),
  journey_receipt: (b, x) => customerReceipt(b, { expenses: x.expenses }),
  corporate_receipt: (b, x) => corporateReceipt(b, { expenses: x.expenses, driver: x.driver }),
  operator_payment_confirmed: (b, x) => operatorPaymentConfirmed(b, { receiptUrl: x.receipt_url }),
  driver_new_job: (b, x) => driverNewJob(b, { driver: x.driver }),
  driver_job_updated: (b, x) => driverJobUpdated(b, { driver: x.driver }),
  driver_job_cancelled: (b, x) => driverJobCancelled(b, { driver: x.driver }),
  driver_reminder: (b, x) => driverReminder(b, { driver: x.driver, reminder: x.reminder }),
  driver_confirm_job: (b, x) => driverConfirmJob(b, { driver: x.driver }),
  driver_sms_task: (b, x) => driverSmsTask(b, { driver: x.driver, message: x.message, task_url: x.task_url }),
  operator_panic: b => operatorPanic(b)
};

// Templates that need the assigned driver / logged expenses loaded first.
const NEEDS_DRIVER = new Set(['status_en_route', 'status_arrived', 'corporate_receipt', 'driver_new_job', 'driver_job_updated', 'driver_job_cancelled', 'driver_reminder', 'driver_confirm_job', 'driver_sms_task']);
const NEEDS_EXPENSES = new Set(['corporate_receipt']);

function renderQueued(template, booking, extras = {}) {
  const fn = RENDERERS[template];
  if (!fn) throw new Error(`Unknown correspondence template: ${template}`);
  return fn(booking, extras);
}

module.exports = {
  refBadgeHtml, customerRequestReceived, customerConfirmed, customerRejected, customerCancelled,
  customerReminder, customerPaymentLink, customerStatus, customerReceipt, corporateReceipt,
  operatorNewBooking, operatorPaymentConfirmed, operatorCancelled,
  driverNewJob, driverJobUpdated, driverJobCancelled, driverReminder, driverConfirmJob, driverSmsTask, operatorPanic,
  renderQueued, RENDERERS, NEEDS_DRIVER, NEEDS_EXPENSES, ukDate
};
