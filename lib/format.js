'use strict';

const PRICES = {
  'Manchester Airport':     { oneWay: 90,  return: 160 },
  'Liverpool Airport':      { oneWay: 95,  return: 170 },
  'Leeds Bradford Airport': { oneWay: 135, return: 250 },
  'Birmingham Airport':     { oneWay: 215, return: 410 },
  'Newcastle Airport':      { oneWay: 250, return: 480 }
};

// Email subject lines can never contain a newline -- Resend's API rejects
// the whole send with a 422 if one sneaks in. journeyLine() deliberately
// returns a multi-line string for return/multi-stop journeys (it's meant
// for message bodies), so anything built from it and used as a subject
// must be flattened first. Applied once to the whole finished subject
// string, not just the interpolated part, so any other future source of
// a stray newline is caught too.
function singleLineSubject(s) {
  return String(s == null ? '' : s).replace(/[\r\n]+/g, ', ').replace(/\s+/g, ' ').trim();
}

// Dates, journeys, stops and payment wording all come from the
// correspondence standard (lib/correspondence.js). These names are kept so
// existing callers don't change; they are thin wrappers now.
const C = require('./correspondence');

function fmtDate(dateStr) {
  return dateStr ? C.ukDate(dateStr) : 'TBC';
}

function fmtTime(timeStr) {
  return C.ukTime(timeStr) || 'TBC';
}

const getStops = C.getStops;

// Journey block for emails: Pickup, stops in order, Drop-off, date/time per
// leg, then passengers and any extra rows the caller passes.
function emailJourneyHtml(booking, extraRows = []) {
  return C.journeyHtml(booking, { rows: [['Passengers', `${booking.passengers || 1}`], ...extraRows] });
}

// Multi-line plain-text journey (Pickup / Stop n / Drop-off / When per leg).
const journeyLine = C.journeyText;

function journeySummaryText(b) {
  return `${C.journeyText(b)}\n${b.passengers || 1} passenger(s)${b.luggage ? `, ${b.luggage}` : ''}`;
}

// Operator job-offer SMS (only used when no OPERATOR_EMAIL is configured).
// Same content as the operator new-booking email, as text.
function buildOperatorJobOfferSms(booking, dispatchUrl) {
  return require('./messages').operatorNewBooking(booking, { dispatchUrl }).text;
}

function refBadgeHtml(ref) {
  return require('./messages').refBadgeHtml(ref);
}

function lookupPrice(airport, isReturn) {
  const p = PRICES[airport];
  if (!p) return null;
  return isReturn ? p.return : p.oneWay;
}

function getPrice(booking) {
  if (booking.quoted_price) return Number(booking.quoted_price);
  const p = PRICES[booking.airport];
  if (!p) return null;
  return booking.return_journey ? p.return : p.oneWay;
}

module.exports = { fmtDate, fmtTime, journeyLine, journeySummaryText, lookupPrice, getPrice, PRICES, buildOperatorJobOfferSms, emailJourneyHtml, refBadgeHtml, getStops, singleLineSubject, routeLine: C.routeLine, paymentLine: C.paymentLine, ukWhen: C.ukWhen };
