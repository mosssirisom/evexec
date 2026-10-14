'use strict';

// The one EV Exec email template. Every email answers three things in its
// first screen, in this order:
//   1. What is happening   (status label + headline)
//   2. When                 (relative day, then the time large, then the full date)
//   3. What to do next      (short numbered steps, then one main button)
// Details follow as stacked label/value pairs, which read well on a phone
// (no squeezed second column). No images: a missing logo shows as a broken
// icon in many mail apps, so the brand is a text wordmark.
//
// Built for real inboxes: table layout, inline styles, Outlook-safe
// ("bulletproof") buttons, a hidden preheader, and a plain-text version of
// every email (renderText) for spam filters, watches and screen readers.
//
// Dates are DD/MM/YYYY and times 24-hour HH:MM, UK time (house rule). The same
// structure is reproduced in the driver app, the Operator app and the
// database, so every system sends the same layout.

const BRAND = { navy: '#0B132B', gold: '#C9A550', goldText: '#7A5A14', ink: '#0f1b33', body: '#334155', muted: '#5b6475', line: '#e3e6ee', page: '#EEF0F5', soft: '#F5F6FA' };

// Status colours: text on a light tint, plus a stronger edge colour.
const TONES = {
  gold:  { fg: '#7A5A14', bg: '#FBF3DF', bar: '#C9A550' },
  green: { fg: '#14532d', bg: '#DCFCE7', bar: '#16a34a' },
  blue:  { fg: '#1e3a8a', bg: '#E0EAFF', bar: '#2563eb' },
  red:   { fg: '#8f1d1d', bg: '#FEE2E2', bar: '#dc2626' },
  grey:  { fg: '#334155', bg: '#EEF1F5', bar: '#64748b' },
};

const FONT = "font-family:Arial,Helvetica,sans-serif;";

function esc(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

// Values are plain text, or { html, text } when they carry a link. `text` is
// what the plain-text email shows.
function val(v) {
  if (v && typeof v === 'object' && 'html' in v) return v.html;
  return esc(v).replace(/\n/g, '<br>');
}
function plain(v) {
  if (v && typeof v === 'object' && 'html' in v) return v.text != null ? String(v.text) : String(v.html).replace(/<br\s*\/?>/g, '\n').replace(/<[^>]+>/g, '').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&');
  return v == null ? '' : String(v);
}
const blank = (v) => v == null || plain(v).trim() === '';

// ── Dates ────────────────────────────────────────────────────────────────────
const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

function ymd(d) {
  const m = String(d || '').match(/^(\d{4})-(\d{2})-(\d{2})/);
  return m ? { y: +m[1], m: +m[2], d: +m[3], s: `${m[3]}/${m[2]}/${m[1]}`, raw: `${m[1]}${m[2]}${m[3]}` } : null;
}
function hhmm(t) {
  const m = String(t || '').match(/^(\d{1,2}):(\d{2})/);
  return m ? `${m[1].padStart(2, '0')}:${m[2]}` : null;
}
// Weekday from the calendar date itself (UTC maths), so no timezone can move it.
function weekday(dateStr) {
  const p = ymd(dateStr);
  return p ? WEEKDAYS[new Date(Date.UTC(p.y, p.m - 1, p.d)).getUTCDay()] : '';
}
function ukToday(now = new Date()) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/London', year: 'numeric', month: '2-digit', day: '2-digit' }).format(now);
}
function daysFromToday(dateStr, now) {
  const a = ymd(ukToday(now)), b = ymd(dateStr);
  if (!a || !b) return null;
  return Math.round((Date.UTC(b.y, b.m - 1, b.d) - Date.UTC(a.y, a.m - 1, a.d)) / 86400000);
}
// "Saturday 10/10/2026"
function longDate(dateStr) {
  const p = ymd(dateStr);
  return p ? `${weekday(dateStr)} ${p.s}` : 'Date to be confirmed';
}
// "Saturday 10/10/2026 at 17:30"
function when(dateStr, timeStr) {
  const t = hhmm(timeStr);
  return t ? `${longDate(dateStr)} at ${t}` : longDate(dateStr);
}
// "Today", "Tomorrow", "In 6 days", or null for past / far dates.
function relativeDay(dateStr, now) {
  const n = daysFromToday(dateStr, now);
  if (n === 0) return 'Today';
  if (n === 1) return 'Tomorrow';
  if (n > 1 && n <= 14) return `In ${n} days`;
  return null;
}

// ── Links ────────────────────────────────────────────────────────────────────
const mapsSearch = (address) => `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address)}`;
const mapsDirections = (address) => `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(address)}`;
// Google Calendar event in UK time (ctz handles BST/GMT).
function calendarUrl({ title, date, time, minutes = 90, location, details }) {
  const p = ymd(date), t = hhmm(time);
  if (!p || !t) return null;
  const [h, m] = t.split(':').map(Number);
  const start = new Date(Date.UTC(p.y, p.m - 1, p.d, h, m));
  const end = new Date(start.getTime() + minutes * 60000);
  const f = (d) => d.toISOString().slice(0, 16).replace(/[-:]/g, '') + '00';
  const q = new URLSearchParams({ action: 'TEMPLATE', text: title, dates: `${f(start)}/${f(end)}`, ctz: 'Europe/London', location: location || '', details: details || '' });
  return `https://calendar.google.com/calendar/render?${q.toString()}`;
}

// ── Pieces ───────────────────────────────────────────────────────────────────
// Outlook-safe button: the colour sits on the table cell, not just the link.
function button(b, kind = 'primary') {
  if (!b || !b.url) return '';
  const primary = kind === 'primary';
  const bg = primary ? BRAND.gold : '#ffffff';
  const border = primary ? BRAND.gold : BRAND.navy;
  return `<table role="presentation" cellpadding="0" cellspacing="0" style="border-collapse:separate"><tr><td align="center" bgcolor="${bg}" style="background:${bg};border:2px solid ${border};border-radius:8px">`
    + `<a href="${esc(b.url)}" style="display:inline-block;${FONT}font-size:16px;font-weight:700;line-height:20px;color:${BRAND.navy};text-decoration:none;padding:13px 24px;border-radius:8px">${esc(b.label)}</a>`
    + `</td></tr></table>`;
}

function whenBlock(w, tone) {
  if (!w) return '';
  const rel = w.relative ? `<div style="${FONT}font-size:13px;font-weight:700;color:${tone.fg};text-transform:uppercase;letter-spacing:.1em;line-height:18px;margin:0 0 6px">${esc(w.relative)}</div>` : '';
  // Time large on its own line, date underneath: nothing wraps awkwardly on a phone.
  const big = w.time
    ? `<div style="${FONT}font-size:40px;line-height:44px;font-weight:800;color:${BRAND.ink};letter-spacing:-.5px">${esc(w.time)}</div>`
      + `<div style="${FONT}font-size:19px;line-height:26px;font-weight:700;color:${BRAND.ink};margin:2px 0 0">${esc(w.date)}</div>`
    : `<div style="${FONT}font-size:22px;line-height:28px;font-weight:800;color:${BRAND.ink}">${esc(w.text || w.date)}</div>`;
  const sub = w.sub ? `<div style="${FONT}font-size:15px;line-height:21px;color:${BRAND.body};margin:8px 0 0">${val(w.sub)}</div>` : '';
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 22px"><tr>`
    + `<td width="6" bgcolor="${tone.bar}" style="background:${tone.bar};width:6px;font-size:0;line-height:0">&nbsp;</td>`
    + `<td bgcolor="${tone.bg}" style="background:${tone.bg};padding:16px 18px">${rel}${big}${sub}</td></tr></table>`;
}

function stepsBlock(steps) {
  if (!steps || !steps.length) return '';
  const items = steps.map((s, i) => `<tr><td valign="top" width="30" style="${FONT}width:30px;padding:0 0 12px;font-size:15px;line-height:22px;font-weight:800;color:${BRAND.goldText}">${i + 1}.</td><td valign="top" style="${FONT}padding:0 0 12px;font-size:16px;line-height:22px;color:${BRAND.ink}">${val(s)}</td></tr>`).join('');
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 10px">${items}</table>`;
}

const heading = (h) => (h ? `<div style="${FONT}font-size:12px;line-height:16px;font-weight:700;color:${BRAND.goldText};text-transform:uppercase;letter-spacing:.1em;margin:0 0 4px">${esc(h)}</div>` : '');

function quoteBlock(section) {
  return `<div style="margin:0 0 22px">${heading(section.heading)}<div style="${FONT}background:${BRAND.soft};border:1px solid ${BRAND.line};border-radius:14px;padding:14px 16px;font-size:15px;line-height:22px;color:${BRAND.ink};margin-top:6px">${val(section.quote)}</div></div>`;
}

// Stacked label above value: full width for long addresses on a phone.
function detailsBlock(section) {
  if (section.quote) return quoteBlock(section);
  const rows = (section.rows || []).filter(r => r && !blank(r[1]));
  if (!rows.length) return '';
  const body = rows.map(([k, v]) => `<tr><td style="padding:11px 0;border-top:1px solid ${BRAND.line}">`
    + `<div style="${FONT}font-size:12px;line-height:16px;color:${BRAND.muted};text-transform:uppercase;letter-spacing:.06em">${esc(k)}</div>`
    + `<div style="${FONT}font-size:16px;line-height:22px;font-weight:700;color:${BRAND.ink};margin-top:2px">${val(v)}</div></td></tr>`).join('');
  return `<div style="margin:0 0 22px">${heading(section.heading)}<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-bottom:1px solid ${BRAND.line}">${body}</table></div>`;
}

const PHONE = '07721 070370';
const telLink = `<a href="tel:+447721070370" style="color:${BRAND.goldText};font-weight:700;text-decoration:none">${PHONE}</a>`;
const HELP = {
  customer: { html: `Questions or changes? Call or WhatsApp ${telLink}, or just reply to this email.`, text: `Questions or changes? Call or WhatsApp ${PHONE}, or reply to this email.` },
  driver: { html: `Anything wrong with this job? Call the office on ${telLink}.`, text: `Anything wrong with this job? Call the office on ${PHONE}.` },
  staff: { html: 'Sent automatically by the EV Exec booking system.', text: 'Sent automatically by the EV Exec booking system.' },
};

/**
 * spec = {
 *   audience: 'customer' | 'driver' | 'staff',
 *   preheader: inbox preview text,
 *   status: { label, tone: 'gold'|'green'|'blue'|'red'|'grey' },
 *   title: headline,
 *   when: { date, time, relative?, sub? }  or  { text, relative?, sub? },
 *   intro: [paragraphs],            // plain text, or { html, text }
 *   steps: [what to do next],
 *   button, button2: { label, url },
 *   links: [{ label, url }],        // small secondary links under the buttons
 *   sections: [{ heading?, rows: [[label, value], ...] } | { heading?, quote }],
 *   note: closing paragraph,
 * }
 */
function renderEmail(spec) {
  const tone = TONES[(spec.status && spec.status.tone) || 'gold'] || TONES.gold;
  const audience = spec.audience || 'customer';
  const site = process.env.SITE_URL || 'https://www.evexec.co.uk';
  const p = (t) => `<p style="${FONT}margin:0 0 14px;font-size:16px;line-height:24px;color:${BRAND.body}">${val(t)}</p>`;
  const kicker = audience === 'driver' ? 'DRIVER' : audience === 'staff' ? 'OFFICE' : '';
  const buttons = (spec.button || spec.button2)
    ? `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:4px 0 8px"><tr>`
      + (spec.button ? `<td style="padding:0 10px 10px 0" valign="top">${button(spec.button, 'primary')}</td>` : '')
      + (spec.button2 ? `<td style="padding:0 0 10px 0" valign="top">${button(spec.button2, 'secondary')}</td>` : '')
      + `</tr></table>`
    : '';
  const links = (spec.links || []).filter(l => l && l.url);
  const linkRow = links.length
    ? `<p style="${FONT}margin:0 0 22px;font-size:15px;line-height:22px">${links.map(l => `<a href="${esc(l.url)}" style="color:${BRAND.goldText};font-weight:700;text-decoration:underline">${esc(l.label)}</a>`).join('<span style="color:#b9bfcc">&nbsp;&nbsp;·&nbsp;&nbsp;</span>')}</p>`
    : (buttons ? '<div style="height:14px;line-height:14px;font-size:0">&nbsp;</div>' : '');
  const help = HELP[audience] || HELP.customer;

  return `<!doctype html><html lang="en-GB" xmlns="http://www.w3.org/1999/xhtml"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta http-equiv="X-UA-Compatible" content="IE=edge"><meta name="color-scheme" content="light"><meta name="supported-color-schemes" content="light"><meta name="format-detection" content="telephone=no,date=no,address=no"><title>${esc(spec.title)}</title></head>`
    + `<body style="margin:0;padding:0;background:${BRAND.page};-webkit-text-size-adjust:100%">`
    + `<div style="display:none;max-height:0;overflow:hidden;opacity:0;mso-hide:all" aria-hidden="true">${esc(spec.preheader || '')}${'&#8203;&nbsp;'.repeat(40)}</div>`
    + `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" bgcolor="${BRAND.page}" style="background:${BRAND.page}"><tr><td align="center" style="padding:20px 10px 28px">`
    + `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px">`
    // Header: text wordmark, gold rule.
    + `<tr><td bgcolor="${BRAND.navy}" style="background:${BRAND.navy};padding:18px 24px;border-radius:14px 14px 0 0">`
    + `<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr>`
    + `<td><a href="${esc(site)}" style="text-decoration:none;${FONT}color:#D7A23F;font-size:19px;font-weight:800;letter-spacing:.22em">EV EXEC</a></td>`
    + (kicker ? `<td align="right" style="${FONT}color:#AAB3C2;font-size:11px;font-weight:700;letter-spacing:.18em">${kicker}</td>` : '')
    + `</tr></table></td></tr>`
    + `<tr><td bgcolor="${BRAND.gold}" style="background:${BRAND.gold};height:3px;line-height:3px;font-size:0">&nbsp;</td></tr>`
    // Body
    + `<tr><td bgcolor="#ffffff" style="background:#ffffff;padding:24px 24px 6px">`
    + (spec.status ? `<div style="${FONT}font-size:13px;line-height:18px;font-weight:700;color:${tone.fg};text-transform:uppercase;letter-spacing:.1em;margin:0 0 6px">${esc(spec.status.label)}</div>` : '')
    + `<h1 style="${FONT}margin:0 0 18px;font-size:26px;line-height:32px;font-weight:800;color:${BRAND.ink}">${esc(spec.title)}</h1>`
    + whenBlock(spec.when, tone)
    + (spec.intro || []).filter(x => !blank(x)).map(p).join('')
    + stepsBlock(spec.steps)
    + buttons + linkRow
    + (spec.sections || []).map(detailsBlock).join('')
    + (blank(spec.note) ? '' : p(spec.note))
    + `</td></tr>`
    // Help + footer
    + `<tr><td bgcolor="#ffffff" style="background:#ffffff;padding:0 24px 22px;border-radius:0 0 14px 14px"><p style="${FONT}margin:0;padding:16px 0 0;border-top:1px solid ${BRAND.line};font-size:15px;line-height:22px;color:${BRAND.body}">${help.html}</p></td></tr>`
    + `<tr><td style="${FONT}padding:14px 24px 0;font-size:12px;line-height:18px;color:${BRAND.muted};text-align:center">EV Exec · Premium airport transfers from Blackpool &amp; the Fylde Coast<br><a href="${esc(site)}" style="color:${BRAND.muted}">evexec.co.uk</a> · ${PHONE}</td></tr>`
    + `</table></td></tr></table></body></html>`;
}

// Plain-text version of the same email (sent alongside the HTML).
function renderText(spec) {
  const out = [];
  const audience = spec.audience || 'customer';
  if (spec.status) out.push(spec.status.label.toUpperCase());
  out.push(spec.title, '');
  const w = spec.when;
  if (w) {
    out.push([w.relative, w.time ? `${w.date} at ${w.time}` : (w.text || w.date)].filter(Boolean).join(': '));
    if (w.sub) out.push(plain(w.sub));
    out.push('');
  }
  (spec.intro || []).filter(x => !blank(x)).forEach(x => out.push(plain(x), ''));
  if (spec.steps && spec.steps.length) { spec.steps.forEach((s, i) => out.push(`${i + 1}. ${plain(s)}`)); out.push(''); }
  [spec.button, spec.button2, ...(spec.links || [])].filter(b => b && b.url).forEach(b => out.push(`${b.label}: ${b.url}`));
  if (spec.button || spec.button2 || (spec.links || []).length) out.push('');
  (spec.sections || []).forEach(sec => {
    if (sec.heading) out.push(sec.heading.toUpperCase());
    if (sec.quote) out.push(plain(sec.quote));
    else (sec.rows || []).filter(r => r && !blank(r[1])).forEach(([k, v]) => out.push(`${k}: ${plain(v)}`));
    out.push('');
  });
  if (!blank(spec.note)) out.push(plain(spec.note), '');
  out.push((HELP[audience] || HELP.customer).text, '', 'EV Exec · evexec.co.uk · 07721 070370');
  return out.join('\n').replace(/\n{3,}/g, '\n\n').trim() + '\n';
}

module.exports = { renderEmail, renderText, esc, when, longDate, weekday, hhmm, ymd, relativeDay, daysFromToday, ukToday, mapsSearch, mapsDirections, calendarUrl, TONES };
