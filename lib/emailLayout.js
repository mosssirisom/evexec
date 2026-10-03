'use strict';

// The one EV Exec email design (user decision, 2026-10-03): white card, navy
// "EV EXEC / PREMIUM AIRPORT TRANSFERS" header, gold stripe, coloured status
// pill, navy footer. It matches the database helper
// public.evexec_notification_email() and the driver app's _shared/emailLayout.ts,
// so every email the business sends looks the same.
//
// Bodies in this repo were written for the old dark card (white text, gold
// labels). lightBody() maps those colours onto the light card, so the
// templates keep their wording and structure.

const PILLS = {
  '#d5a538': { bg: '#FBF3DF', fg: '#8a6416' }, // default: confirmations, reminders
  '#374151': { bg: '#F1F5F9', fg: '#334155' }, // unavailable / neutral
  '#10b981': { bg: '#DCFCE7', fg: '#166534' }, // success
  '#ef4444': { bg: '#FEE2E2', fg: '#991B1B' }, // cancelled / problem
};

function lightBody(html) {
  return String(html)
    .replace(/color:\s*#fff(fff)?\b/gi, 'color:#0f1b33')
    .replace(/color:\s*rgba\(255,\s*255,\s*255,\s*\.(6|65|7|75|8)\d*\)/gi, 'color:#334155')
    .replace(/color:\s*rgba\(255,\s*255,\s*255,\s*\.\d+\)/gi, 'color:#64748b')
    .replace(/color:\s*#d5a538/gi, 'color:#8a6416')
    .replace(/border(-top|-bottom)?:\s*1px solid rgba\(255,\s*255,\s*255,\s*\.\d+\)/gi, 'border$1:1px solid #eef0f3')
    .replace(/background:\s*rgba\(213,\s*165,\s*56,\s*\.\d+\)/gi, 'background:#FBF3DF')
    .replace(/border:\s*1px solid rgba\(213,\s*165,\s*56,\s*\.\d+\)/gi, 'border:1px solid #ecd9a8');
}

function emailLayout({ title, body, accent = '#d5a538' }) {
  const site = process.env.SITE_URL || 'https://evexec.co.uk';
  const pill = PILLS[String(accent).toLowerCase()] || PILLS['#d5a538'];
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="color-scheme" content="light"><meta name="supported-color-schemes" content="light"><title>${title}</title><style>:root{color-scheme:light;supported-color-schemes:light}</style></head>`
    + `<body style="margin:0;background:#E9EBF2;padding:24px 12px;font-family:Arial,Helvetica,sans-serif;color:#0f1b33">`
    + `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" bgcolor="#E9EBF2" style="background:#E9EBF2"><tr><td align="center">`
    + `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" bgcolor="#ffffff" style="max-width:560px;margin:0 auto;background:#ffffff;border-radius:16px;overflow:hidden;border:1px solid #e2e5ee">`
    + `<tr><td bgcolor="#0B132B" style="background:#0B132B;padding:22px 28px"><a href="${site}" style="text-decoration:none"><div style="color:#d7a23f;font-size:20px;font-weight:800;letter-spacing:.22em">EV EXEC</div><div style="color:#9aa3b2;font-size:10px;letter-spacing:.28em;margin-top:4px">PREMIUM AIRPORT TRANSFERS</div></a></td></tr>`
    + `<tr><td bgcolor="#C9A550" style="background:#C9A550;height:4px;line-height:4px;font-size:0">&nbsp;</td></tr>`
    + `<tr><td bgcolor="#ffffff" style="background:#ffffff;padding:26px 28px">`
    + `<span style="display:inline-block;background:${pill.bg};color:${pill.fg};border-radius:999px;padding:6px 14px;font-size:12px;font-weight:700">${title}</span>`
    + `<div style="margin-top:18px;font-family:Arial,Helvetica,sans-serif;color:#0f1b33">${lightBody(body)}</div>`
    + `</td></tr>`
    + `<tr><td bgcolor="#0B132B" style="background:#0B132B;padding:14px 28px;color:#9aa3b2;font-size:11px">EV Exec · Premium Airport Transfers · 07721 070370 · book@evexec.co.uk · evexec.co.uk</td></tr>`
    + `</table></td></tr></table></body></html>`;
}

module.exports = { emailLayout, lightBody };
