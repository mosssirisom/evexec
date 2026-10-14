'use strict';

// The one EV Exec email template (2026-10-14). Every email answers three
// things in its first screen, in this order:
//   1. What is happening   (status label + headline)
//   2. When                 (a large date-and-time block: "Saturday 10/10/2026 at 17:30")
//   3. What to do next      (short steps, then one button)
// Details follow in a plain two-column table. No images (a missing logo shows
// as a broken icon in many mail apps), so the brand is a text wordmark.
//
// Dates are DD/MM/YYYY and times 24-hour HH:MM, UK time (house rule). The same
// structure is reproduced in the driver app (_shared/emailTemplate.ts), the
// Operator app (src/lib/emailTemplate.ts) and the database
// (public.evexec_email()), so a customer or driver sees one consistent layout
// whichever system sent the message.

const BRAND = { navy: '#0B132B', gold: '#C9A550', goldText: '#8a6416', ink: '#0f1b33', body: '#334155', muted: '#64748b', line: '#e5e8ef', page: '#EEF0F5' };

// Status colours: text colour on a light tint.
const TONES = {
  gold:  { fg: '#8a6416', bg: '#FBF3DF', bar: '#C9A550' },
  green: { fg: '#166534', bg: '#DCFCE7', bar: '#16a34a' },
  blue:  { fg: '#1e40af', bg: '#E0EAFF', bar: '#2563eb' },
  red:   { fg: '#991b1b', bg: '#FEE2E2', bar: '#dc2626' },
  grey:  { fg: '#334155', bg: '#F1F5F9', bar: '#64748b' },
};

const FONT = 'font-family:Arial,Helvetica,sans-serif;';

function esc(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

// Values are plain text unless passed as { html: '...' } (already safe).
function val(v) {
  if (v && typeof v === 'object' && 'html' in v) return v.html;
  return esc(v).replace(/\n/g, '<br>');
}

// ── Dates ────────────────────────────────────────────────────────────────────
const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

function ymd(d) {
  const m = String(d || '').match(/^(\d{4})-(\d{2})-(\d{2})/);
  return m ? { y: +m[1], m: +m[2], d: +m[3], s: `${m[3]}/${m[2]}/${m[1]}` } : null;
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

// ── Pieces ───────────────────────────────────────────────────────────────────
function button(b, primary = true) {
  if (!b || !b.url) return '';
  const style = primary
    ? `display:inline-block;background:${BRAND.gold};color:${BRAND.navy};${FONT}font-size:16px;font-weight:700;padding:14px 26px;border-radius:8px;text-decoration:none`
    : `display:inline-block;background:#ffffff;color:${BRAND.navy};${FONT}font-size:15px;font-weight:700;padding:12px 22px;border-radius:8px;text-decoration:none;border:2px solid ${BRAND.navy}`;
  return `<a href="${esc(b.url)}" style="${style}">${esc(b.label)}</a>`;
}

function whenBlock(w, tone) {
  if (!w) return '';
  const rel = w.relative ? `<div style="${FONT}font-size:13px;font-weight:700;color:${tone.fg};text-transform:uppercase;letter-spacing:.08em;margin:0 0 4px">${esc(w.relative)}</div>` : '';
  const sub = w.sub ? `<div style="${FONT}font-size:15px;color:${BRAND.body};margin:6px 0 0;line-height:1.45">${val(w.sub)}</div>` : '';
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 22px"><tr>`
    + `<td width="5" bgcolor="${tone.bar}" style="background:${tone.bar};width:5px;border-radius:4px 0 0 4px">&nbsp;</td>`
    + `<td bgcolor="${tone.bg}" style="background:${tone.bg};padding:16px 18px;border-radius:0 8px 8px 0">`
    + rel
    + `<div style="${FONT}font-size:22px;font-weight:800;color:${BRAND.ink};line-height:1.25">${esc(w.text)}</div>`
    + sub + `</td></tr></table>`;
}

function stepsBlock(steps) {
  if (!steps || !steps.length) return '';
  const items = steps.map((s, i) => `<tr><td valign="top" style="${FONT}width:26px;padding:0 0 10px;font-size:15px;font-weight:800;color:${BRAND.goldText}">${i + 1}.</td><td style="${FONT}padding:0 0 10px;font-size:15px;line-height:1.5;color:${BRAND.ink}">${val(s)}</td></tr>`).join('');
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 18px">${items}</table>`;
}

function quoteBlock(section) {
  const head = section.heading ? `<div style="${FONT}font-size:12px;font-weight:700;color:${BRAND.goldText};text-transform:uppercase;letter-spacing:.08em;margin:0 0 8px">${esc(section.heading)}</div>` : '';
  return `<div style="margin:0 0 20px">${head}<div style="${FONT}background:#F4F6FA;border:1px solid ${BRAND.line};border-radius:12px;padding:14px 16px;font-size:15px;line-height:1.5;color:${BRAND.ink}">${val(section.quote)}</div></div>`;
}

function detailsTable(section) {
  if (section.quote) return quoteBlock(section);
  const rows = (section.rows || []).filter(r => r && r[1] != null && String(r[1].html != null ? r[1].html : r[1]).trim() !== '');
  if (!rows.length) return '';
  const head = section.heading ? `<div style="${FONT}font-size:12px;font-weight:700;color:${BRAND.goldText};text-transform:uppercase;letter-spacing:.08em;margin:0 0 6px">${esc(section.heading)}</div>` : '';
  const body = rows.map(([k, v]) => `<tr><td valign="top" style="${FONT}padding:10px 12px 10px 0;width:120px;font-size:13px;color:${BRAND.muted};border-top:1px solid ${BRAND.line}">${esc(k)}</td><td valign="top" style="${FONT}padding:10px 0;font-size:15px;font-weight:700;color:${BRAND.ink};border-top:1px solid ${BRAND.line};line-height:1.45">${val(v)}</td></tr>`).join('');
  return `<div style="margin:0 0 20px">${head}<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-bottom:1px solid ${BRAND.line}">${body}</table></div>`;
}

const HELP = {
  customer: 'Questions or changes? Call or WhatsApp <a href="tel:+447721070370" style="color:#8a6416;font-weight:700;text-decoration:none">07721 070370</a>, or reply to this email.',
  driver: 'Anything wrong with this job? Call the office on <a href="tel:+447721070370" style="color:#8a6416;font-weight:700;text-decoration:none">07721 070370</a>.',
  staff: 'Sent by the EV Exec booking system.',
};

/**
 * spec = {
 *   audience: 'customer' | 'driver' | 'staff',
 *   preheader: inbox preview text,
 *   status: { label, tone: 'gold'|'green'|'blue'|'red'|'grey' },
 *   title: headline,
 *   when: { text, relative?, sub? },
 *   intro: [paragraphs],           // plain text, or { html }
 *   steps: [what to do next],
 *   button: { label, url }, button2: { label, url },
 *   sections: [{ heading?, rows: [[label, value], ...] } | { heading?, quote: text }],
 *   note: closing paragraph,
 * }
 */
function renderEmail(spec) {
  const tone = TONES[(spec.status && spec.status.tone) || 'gold'] || TONES.gold;
  const audience = spec.audience || 'customer';
  const site = process.env.SITE_URL || 'https://www.evexec.co.uk';
  const p = (t) => `<p style="${FONT}margin:0 0 14px;font-size:15px;line-height:1.55;color:${BRAND.body}">${val(t)}</p>`;
  const kicker = audience === 'driver' ? 'DRIVER' : audience === 'staff' ? 'OFFICE' : '';
  const buttons = (spec.button || spec.button2)
    ? `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:4px 0 22px"><tr>`
      + (spec.button ? `<td style="padding:0 10px 10px 0">${button(spec.button, true)}</td>` : '')
      + (spec.button2 ? `<td style="padding:0 0 10px 0">${button(spec.button2, false)}</td>` : '')
      + `</tr></table>`
    : '';

  return `<!doctype html><html lang="en-GB"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="color-scheme" content="light"><meta name="supported-color-schemes" content="light"><title>${esc(spec.title)}</title></head>`
    + `<body style="margin:0;padding:0;background:${BRAND.page}">`
    + `<div style="display:none;max-height:0;overflow:hidden;opacity:0;color:${BRAND.page}">${esc(spec.preheader || '')}&#8203;&nbsp;&#8203;&nbsp;&#8203;&nbsp;</div>`
    + `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" bgcolor="${BRAND.page}" style="background:${BRAND.page}"><tr><td align="center" style="padding:20px 10px">`
    + `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:580px">`
    // Header: text wordmark only.
    + `<tr><td bgcolor="${BRAND.navy}" style="background:${BRAND.navy};padding:18px 26px;border-radius:12px 12px 0 0">`
    + `<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr>`
    + `<td><a href="${esc(site)}" style="text-decoration:none;${FONT}color:#D7A23F;font-size:19px;font-weight:800;letter-spacing:.2em">EV EXEC</a></td>`
    + (kicker ? `<td align="right" style="${FONT}color:#AAB3C2;font-size:11px;font-weight:700;letter-spacing:.16em">${kicker}</td>` : '')
    + `</tr></table></td></tr>`
    // Body
    + `<tr><td bgcolor="#ffffff" style="background:#ffffff;padding:26px 26px 8px">`
    + (spec.status ? `<div style="${FONT}font-size:13px;font-weight:700;color:${tone.fg};text-transform:uppercase;letter-spacing:.08em;margin:0 0 8px">${esc(spec.status.label)}</div>` : '')
    + `<h1 style="${FONT}margin:0 0 18px;font-size:24px;line-height:1.25;font-weight:800;color:${BRAND.ink}">${esc(spec.title)}</h1>`
    + whenBlock(spec.when, tone)
    + (spec.intro || []).map(p).join('')
    + stepsBlock(spec.steps)
    + buttons
    + (spec.sections || []).map(detailsTable).join('')
    + (spec.note ? p(spec.note) : '')
    + `</td></tr>`
    // Help + footer
    + `<tr><td bgcolor="#ffffff" style="background:#ffffff;padding:4px 26px 24px;border-radius:0 0 12px 12px"><p style="${FONT}margin:0;padding:14px 0 0;border-top:1px solid ${BRAND.line};font-size:14px;line-height:1.5;color:${BRAND.body}">${HELP[audience] || HELP.customer}</p></td></tr>`
    + `<tr><td style="${FONT}padding:14px 26px 0;font-size:12px;line-height:1.5;color:${BRAND.muted};text-align:center">EV Exec · Premium airport transfers from Blackpool &amp; the Fylde Coast · <a href="${esc(site)}" style="color:${BRAND.muted}">evexec.co.uk</a></td></tr>`
    + `</table></td></tr></table></body></html>`;
}

module.exports = { renderEmail, esc, when, longDate, weekday, hhmm, ymd, relativeDay, daysFromToday, ukToday, TONES };
