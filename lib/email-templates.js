'use strict';

const TRUST_BADGES = ['Fully Licensed', 'Insured', 'Enhanced DBS Checked', 'Owner-Operated']
  .map(b => `<span style="display:inline-block;border:1px solid rgba(255,255,255,.14);border-radius:999px;padding:5px 13px;font-family:Inter,'Helvetica Neue',Arial,sans-serif;font-size:11px;font-weight:500;color:rgba(255,255,255,.42);margin:3px 2px;white-space:nowrap">${b}</span>`)
  .join('');

function getPickupDest(booking) {
  if (booking.journey_type === 'From Airport') {
    return {
      pickup: booking.airport || 'Airport',
      destination: booking.dropoff_address || 'Your destination'
    };
  }
  return {
    pickup: booking.pickup_location || 'Your pickup',
    destination: booking.airport || 'Airport'
  };
}

const EMAIL_CSS = `
  @import url('https://fonts.googleapis.com/css2?family=Playfair+Display:wght@600;700&family=Inter:wght@400;500;600;700&display=swap');
  body,table,td{margin:0;padding:0}
  body{background-color:#040D1A}
  img{border:0;line-height:100%;outline:none;text-decoration:none;display:block}
  @media only screen and (max-width:600px){
    .email-card{border-radius:0!important}
    .card-pad{padding:28px 22px!important}
    .meta-col{display:block!important;width:100%!important;box-sizing:border-box!important}
    .meta-border{border-right:none!important;border-bottom:1px solid rgba(255,255,255,.08)!important}
    .route-cell{display:block!important;width:100%!important;padding:0 0 12px!important}
    .route-arrow{display:none!important}
    .price-num{font-size:44px!important}
  }
`;

// Outer wrapper + brand header, takes the card HTML as inner content
function emailShell(cardHtml, { year = new Date().getFullYear() } = {}) {
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8"/>
<meta name="viewport" content="width=device-width,initial-scale=1.0"/>
<meta name="x-apple-disable-message-reformatting"/>
<!--[if !mso]><!-->
<meta http-equiv="X-UA-Compatible" content="IE=edge"/>
<!--<![endif]-->
<title>EV Exec</title>
<style>${EMAIL_CSS}</style>
</head>
<body style="margin:0;padding:0;background-color:#040D1A;-webkit-text-size-adjust:100%;-ms-text-size-adjust:100%">

<table cellpadding="0" cellspacing="0" border="0" role="presentation" width="100%" style="background-color:#040D1A">
  <tr>
    <td align="center" style="padding:32px 16px 24px">
      <table cellpadding="0" cellspacing="0" border="0" role="presentation" style="width:100%;max-width:560px">

        <!-- Brand header -->
        <tr>
          <td align="center" style="padding-bottom:28px">
            <div style="font-family:Inter,'Helvetica Neue',Arial,sans-serif;font-weight:900;font-size:21px;color:#ffffff;letter-spacing:0.12em;margin-bottom:3px">EV EXEC</div>
            <div style="font-family:Inter,'Helvetica Neue',Arial,sans-serif;font-size:9px;color:rgba(255,255,255,.38);letter-spacing:0.22em;text-transform:uppercase">Premium Airport Transfers</div>
          </td>
        </tr>

        <!-- Main card -->
        <tr>
          <td class="email-card" style="background-color:#0B1525;border:1px solid rgba(255,255,255,.10);border-radius:16px;overflow:hidden">

            <!-- Gold top bar -->
            <table cellpadding="0" cellspacing="0" border="0" role="presentation" width="100%">
              <tr><td style="height:3px;background:linear-gradient(90deg,#f1c56a,#d5a538 55%,#a97918);font-size:0;line-height:0">&nbsp;</td></tr>
            </table>

            <!-- Card body -->
            <table cellpadding="0" cellspacing="0" border="0" role="presentation" width="100%">
              <tr>
                <td class="card-pad" style="padding:36px 40px">
                  ${cardHtml}
                </td>
              </tr>
            </table>

          </td>
        </tr>

        <!-- Trust badges -->
        <tr>
          <td align="center" style="padding:22px 0 0">
            <div style="font-family:Inter,'Helvetica Neue',Arial,sans-serif;font-size:9px;color:rgba(255,255,255,.22);text-transform:uppercase;letter-spacing:0.14em;margin-bottom:10px">Your guarantee</div>
            <div style="line-height:2">${TRUST_BADGES}</div>
          </td>
        </tr>

        <!-- Footer -->
        <tr>
          <td align="center" style="padding:18px 0 28px">
            <p style="font-family:Inter,'Helvetica Neue',Arial,sans-serif;font-size:11px;color:rgba(255,255,255,.18);margin:0">
              &copy; ${year} EV Exec &nbsp;&middot;&nbsp; Blackpool, Lancashire &nbsp;&middot;&nbsp;
              <a href="https://evexec.co.uk/privacy" style="color:rgba(255,255,255,.25);text-decoration:none">Privacy Policy</a>
            </p>
          </td>
        </tr>

      </table>
    </td>
  </tr>
</table>

</body>
</html>`;
}

function supportRow() {
  return `
<table cellpadding="0" cellspacing="0" border="0" role="presentation" width="100%" style="margin-top:28px">
  <tr>
    <td style="border-top:1px solid rgba(255,255,255,.08);padding-top:24px;text-align:center">
      <div style="font-family:Inter,'Helvetica Neue',Arial,sans-serif;font-size:13px;color:rgba(255,255,255,.35);margin-bottom:10px">Questions? We&rsquo;re here to help.</div>
      <table cellpadding="0" cellspacing="0" border="0" role="presentation" align="center">
        <tr>
          <td style="padding:0 10px">
            <a href="tel:+447721070370" style="font-family:Inter,'Helvetica Neue',Arial,sans-serif;font-size:14px;font-weight:600;color:#d5a538;text-decoration:none">&#128222;&nbsp; 07721 070370</a>
          </td>
          <td style="font-family:Inter,'Helvetica Neue',Arial,sans-serif;font-size:16px;color:rgba(255,255,255,.15)">&nbsp;|&nbsp;</td>
          <td style="padding:0 10px">
            <a href="https://wa.me/447721070370" style="font-family:Inter,'Helvetica Neue',Arial,sans-serif;font-size:14px;font-weight:600;color:#25d366;text-decoration:none">&#128172;&nbsp; WhatsApp</a>
          </td>
        </tr>
      </table>
    </td>
  </tr>
</table>`;
}

function journeyBlock(booking) {
  const { pickup, destination } = getPickupDest(booking);
  return `
<table cellpadding="0" cellspacing="0" border="0" role="presentation" width="100%" style="background-color:rgba(255,255,255,.04);border:1px solid rgba(255,255,255,.09);border-radius:10px;margin-bottom:14px">
  <tr>
    <td style="padding:20px 24px">
      <table cellpadding="0" cellspacing="0" border="0" role="presentation" width="100%">
        <tr>
          <td class="route-cell" style="width:44%;vertical-align:top;padding-right:8px">
            <div style="font-family:Inter,'Helvetica Neue',Arial,sans-serif;font-size:9px;font-weight:700;color:rgba(255,255,255,.32);text-transform:uppercase;letter-spacing:0.14em;margin-bottom:5px">From</div>
            <div style="font-family:Inter,'Helvetica Neue',Arial,sans-serif;font-size:14px;font-weight:600;color:#ffffff;line-height:1.4">${pickup}</div>
          </td>
          <td class="route-arrow" style="width:12%;text-align:center;vertical-align:middle;color:#d5a538;font-size:22px;padding-bottom:2px">&#8594;</td>
          <td class="route-cell" style="width:44%;vertical-align:top;padding-left:8px">
            <div style="font-family:Inter,'Helvetica Neue',Arial,sans-serif;font-size:9px;font-weight:700;color:rgba(255,255,255,.32);text-transform:uppercase;letter-spacing:0.14em;margin-bottom:5px">To</div>
            <div style="font-family:Inter,'Helvetica Neue',Arial,sans-serif;font-size:14px;font-weight:600;color:#ffffff;line-height:1.4">${destination}</div>
          </td>
        </tr>
      </table>
    </td>
  </tr>
</table>`;
}

function metadataBlock(dateStr, time, passengers) {
  return `
<table cellpadding="0" cellspacing="0" border="0" role="presentation" width="100%" style="border:1px solid rgba(255,255,255,.08);border-radius:10px;margin-bottom:28px">
  <tr>
    <td class="meta-col meta-border" style="width:50%;padding:14px 18px;border-right:1px solid rgba(255,255,255,.08);vertical-align:top">
      <div style="font-family:Inter,'Helvetica Neue',Arial,sans-serif;font-size:9px;font-weight:700;text-transform:uppercase;letter-spacing:0.14em;color:rgba(255,255,255,.32);margin-bottom:5px">Date &amp; Time</div>
      <div style="font-family:Inter,'Helvetica Neue',Arial,sans-serif;font-size:14px;font-weight:600;color:#ffffff;line-height:1.4">${dateStr} at ${time}</div>
    </td>
    <td class="meta-col" style="width:50%;padding:14px 18px;vertical-align:top">
      <div style="font-family:Inter,'Helvetica Neue',Arial,sans-serif;font-size:9px;font-weight:700;text-transform:uppercase;letter-spacing:0.14em;color:rgba(255,255,255,.32);margin-bottom:5px">Passengers</div>
      <div style="font-family:Inter,'Helvetica Neue',Arial,sans-serif;font-size:14px;font-weight:600;color:#ffffff">${passengers} Passenger${passengers !== 1 ? 's' : ''}</div>
    </td>
  </tr>
</table>`;
}

function priceBlock(price) {
  if (!price) return '';
  return `
<table cellpadding="0" cellspacing="0" border="0" role="presentation" width="100%" style="margin-bottom:28px">
  <tr>
    <td align="center">
      <div style="font-family:Inter,'Helvetica Neue',Arial,sans-serif;font-size:9px;font-weight:700;text-transform:uppercase;letter-spacing:0.14em;color:rgba(255,255,255,.32);margin-bottom:6px">Fixed Price &mdash; All Inclusive</div>
      <div class="price-num" style="font-family:'Playfair Display',Georgia,'Times New Roman',serif;font-size:54px;font-weight:700;color:#d5a538;line-height:1">&pound;${price}</div>
    </td>
  </tr>
</table>`;
}

function ctaButton(href, label) {
  return `
<table cellpadding="0" cellspacing="0" border="0" role="presentation" width="100%">
  <tr>
    <td align="center" style="border-radius:8px">
      <!--[if mso]><v:roundrect xmlns:v="urn:schemas-microsoft-com:vml" xmlns:w="urn:schemas-microsoft-com:office:word" href="${href}" style="height:54px;v-text-anchor:middle;width:480px" arcsize="7%" fillcolor="#d5a538" strokecolor="#d5a538"><w:anchorlock/><center style="color:#06101c;font-family:Arial,sans-serif;font-size:16px;font-weight:bold">${label}</center></v:roundrect><![endif]-->
      <!--[if !mso]><!-->
      <a href="${href}" style="display:block;padding:18px 28px;font-family:Inter,'Helvetica Neue',Arial,sans-serif;font-size:16px;font-weight:700;color:#06101c;text-decoration:none;text-align:center;border-radius:8px;background:linear-gradient(135deg,#f1c56a,#d5a538 55%,#a97918);box-shadow:0 6px 28px rgba(213,165,56,.20);letter-spacing:0.02em">${label}</a>
      <!--<![endif]-->
    </td>
  </tr>
</table>`;
}

function statusPill(text, color = '#d5a538') {
  return `
<table cellpadding="0" cellspacing="0" border="0" role="presentation" style="margin-bottom:20px">
  <tr>
    <td style="border:1px solid ${color}4D;background:${color}1A;border-radius:999px;padding:5px 15px">
      <span style="font-family:Inter,'Helvetica Neue',Arial,sans-serif;font-size:10px;font-weight:700;color:${color};text-transform:uppercase;letter-spacing:0.14em">${text}</span>
    </td>
  </tr>
</table>`;
}

function greeting(firstName, bodyText) {
  return `
<h1 style="font-family:'Playfair Display',Georgia,'Times New Roman',serif;font-size:26px;font-weight:700;color:#ffffff;margin:0 0 8px;line-height:1.25">Hi ${firstName},</h1>
<p style="font-family:Inter,'Helvetica Neue',Arial,sans-serif;font-size:15px;color:rgba(255,255,255,.58);margin:0 0 28px;line-height:1.65">${bodyText}</p>`;
}

// ── Acceptance email ──────────────────────────────────────────────────────────
function buildAcceptEmail(booking, paymentUrl, price) {
  const firstName = (booking.customer_name || 'there').split(' ')[0];
  const date = require('./format').fmtDate(booking.travel_date);
  const pax = parseInt(booking.passengers) || 1;

  const card = `
${statusPill('&#10003;&nbsp; Transfer Accepted')}
${greeting(firstName, 'Your airport transfer has been accepted. Please choose your payment method below to complete your booking.')}
${journeyBlock(booking)}
${metadataBlock(date, booking.travel_time || 'TBC', pax)}
${priceBlock(price)}
${ctaButton(paymentUrl, 'Choose Payment Method')}
${supportRow()}`;

  return emailShell(card);
}

// ── Booking confirmed email ───────────────────────────────────────────────────
function buildConfirmEmail(booking, notes, price) {
  const firstName = (booking.customer_name || 'there').split(' ')[0];
  const date = require('./format').fmtDate(booking.travel_date);
  const pax = parseInt(booking.passengers) || 1;
  const method = booking.payment_method === 'cash' ? 'Cash on the day' : 'Paid by card';

  const notesBlock = notes
    ? `<p style="font-family:Inter,'Helvetica Neue',Arial,sans-serif;font-size:14px;color:rgba(255,255,255,.58);margin:0 0 20px;line-height:1.6;padding:14px 18px;background:rgba(255,255,255,.04);border-radius:8px;border-left:3px solid rgba(213,165,56,.50)">${notes}</p>`
    : '';

  const paymentBlock = `
<table cellpadding="0" cellspacing="0" border="0" role="presentation" width="100%" style="margin-bottom:24px">
  <tr>
    <td style="padding:14px 18px;background:rgba(255,255,255,.04);border-radius:8px">
      <span style="font-family:Inter,'Helvetica Neue',Arial,sans-serif;font-size:12px;color:rgba(255,255,255,.38);text-transform:uppercase;letter-spacing:0.1em">Payment &nbsp;</span>
      <span style="font-family:Inter,'Helvetica Neue',Arial,sans-serif;font-size:14px;font-weight:600;color:#ffffff">${method}</span>
    </td>
  </tr>
</table>`;

  const card = `
${statusPill('&#10003;&nbsp; Booking Confirmed')}
${greeting(firstName, 'Your airport transfer is confirmed. We look forward to seeing you on the day.')}
${journeyBlock(booking)}
${metadataBlock(date, booking.travel_time || 'TBC', pax)}
${priceBlock(price)}
${paymentBlock}
${notesBlock}
${supportRow()}`;

  return emailShell(card);
}

// ── Rejection email ───────────────────────────────────────────────────────────
function buildRejectEmail(booking) {
  const firstName = (booking.customer_name || 'there').split(' ')[0];
  const date = require('./format').fmtDate(booking.travel_date);
  const { pickup, destination } = getPickupDest(booking);

  const card = `
${statusPill('Journey Unavailable', '#94a3b8')}
${greeting(firstName, 'Unfortunately EV Exec is unable to cover your requested journey. We\'re sorry for any inconvenience.')}

<table cellpadding="0" cellspacing="0" border="0" role="presentation" width="100%" style="background-color:rgba(255,255,255,.04);border:1px solid rgba(255,255,255,.09);border-radius:10px;margin-bottom:24px">
  <tr>
    <td style="padding:20px 24px">
      <div style="font-family:Inter,'Helvetica Neue',Arial,sans-serif;font-size:9px;font-weight:700;color:rgba(255,255,255,.32);text-transform:uppercase;letter-spacing:0.14em;margin-bottom:8px">Requested Journey</div>
      <div style="font-family:Inter,'Helvetica Neue',Arial,sans-serif;font-size:15px;font-weight:600;color:rgba(255,255,255,.75)">${pickup} &#8594; ${destination}</div>
      <div style="font-family:Inter,'Helvetica Neue',Arial,sans-serif;font-size:13px;color:rgba(255,255,255,.40);margin-top:5px">${date} at ${booking.travel_time || 'TBC'}</div>
    </td>
  </tr>
</table>

<p style="font-family:Inter,'Helvetica Neue',Arial,sans-serif;font-size:14px;color:rgba(255,255,255,.50);margin:0 0 4px;line-height:1.65">No payment has been taken. If you have any questions or would like to discuss alternative arrangements, please get in touch.</p>
${supportRow()}`;

  return emailShell(card);
}

module.exports = { buildAcceptEmail, buildConfirmEmail, buildRejectEmail };
