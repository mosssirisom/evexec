'use strict';

function emailLayout({ title, body, accent = '#d5a538', accentText = '#06101c' }) {
  const site = process.env.SITE_URL || 'https://evexec.co.uk';
  const logo = `${site}/public/images/ev-exec-logo.jpg`;
  return `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${title}</title></head><body style="margin:0;padding:0;background:#ffffff"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" bgcolor="#ffffff" style="background:#ffffff;padding:32px 12px"><tr><td align="center"><table role="presentation" cellpadding="0" cellspacing="0" style="max-width:560px;width:100%"><tr><td bgcolor="#0d1f3c" style="background:#0d1f3c;padding:20px 28px;border-radius:12px 12px 0 0;text-align:center"><a href="${site}" style="display:block;text-decoration:none"><img src="${logo}" alt="EV Exec" width="150" style="width:150px;height:auto;display:block;margin:0 auto;border:0" /></a></td></tr><tr><td style="background:${accent};padding:16px 28px"><h1 style="margin:0;font-family:Inter,Arial,sans-serif;font-size:17px;font-weight:700;color:${accentText};line-height:1.3">${title}</h1></td></tr><tr><td style="background:#020813;padding:28px;border-radius:0 0 12px 12px">${body}</td></tr><tr><td style="padding:20px 0 0;text-align:center"><p style="margin:0;font-family:Inter,Arial,sans-serif;font-size:12px;color:#6b7280">EV Exec &nbsp;&middot;&nbsp; Premium Airport Transfers<br><a href="tel:07721070370" style="color:#d5a538;text-decoration:none">07721 070370</a> &nbsp;&middot;&nbsp; <a href="${site}" style="color:#d5a538;text-decoration:none">evexec.co.uk</a></p></td></tr></table></td></tr></table></body></html>`;
}

module.exports = { emailLayout };
