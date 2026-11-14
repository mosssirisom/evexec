// Customer's yes / no reply to a price the office quoted (the link in the quote text).
//
// GET shows the quote and two buttons. Nothing is recorded on GET, so an email or
// chat link scanner opening the page can't answer for the customer. Only the POST
// from that page records the reply, once: a second tap changes nothing.
//
// A "yes" does NOT create a booking or take payment. It tells the office, which
// then books it and sends the usual payment link, as for any other booking.

const { dbFindOne, dbUpdateMatching } = require('./supabase');
const { sendPushToOperatorDevices } = require('./push');
const { brandFor } = require('./brand');

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const esc = (v) => String(v == null ? '' : v).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');

// DD/MM/YYYY and HH:MM (house style); plain strings are rearranged, never parsed as dates.
function ddmmyyyy(d) { const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(d || '')); return m ? `${m[3]}/${m[2]}/${m[1]}` : ''; }
function hhmm(t) { return String(t || '').slice(0, 5); }

function summary(q) {
  const from = q.airport || q.pickup_location || '';
  const to = q.destination || '';
  const lines = [];
  if (from || to) lines.push(`${from}${from && to ? ' to ' : ''}${to}`);
  if (q.pickup_date) lines.push(`${ddmmyyyy(q.pickup_date)}${q.pickup_time ? ` at ${hhmm(q.pickup_time)}` : ''}`);
  if (q.return_required && q.return_date) lines.push(`Return ${ddmmyyyy(q.return_date)}${q.return_time ? ` at ${hhmm(q.return_time)}` : ''}`);
  if (q.passengers) lines.push(`${q.passengers} passenger${q.passengers === 1 ? '' : 's'}`);
  return lines;
}

function price(q) {
  const n = Number(q.quoted_price);
  return Number.isFinite(n) ? (Number.isInteger(n) ? `£${n}` : `£${n.toFixed(2)}`) : '';
}

function page(title, bodyHtml, brand) {
  const name = esc((brand && brand.name) || '');
  return `<!doctype html><html lang="en-GB"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex"><title>${esc(title)}${name ? ` | ${name}` : ''}</title>
<style>body{margin:0;font-family:Jost,system-ui,sans-serif;background:#0B132B;color:#f5f5f5;display:flex;min-height:100vh;align-items:center;justify-content:center;padding:20px;box-sizing:border-box}
.card{max-width:460px;width:100%;background:#131d38;border:1px solid #2F3742;border-radius:12px;padding:28px}
h1{font-size:22px;margin:0 0 12px;color:#D7A23F;font-weight:600}p{line-height:1.5;margin:0 0 12px;color:#dfe3ea}
ul{padding-left:18px;margin:0 0 16px;color:#dfe3ea}li{margin-bottom:4px}
.btn{display:block;width:100%;box-sizing:border-box;text-align:center;padding:14px;border-radius:6px;border:0;font:600 16px Jost,system-ui,sans-serif;cursor:pointer;margin-top:10px;text-decoration:none}
.yes{background:#D7A23F;color:#0B132B}.no{background:transparent;color:#f5f5f5;border:1px solid #3A4350}</style></head>
<body><main class="card">${bodyHtml}</main></body></html>`;
}

function invalid(brand) {
  return page('Link not valid', `<h1>This link is not valid</h1><p>It may have expired or been copied wrongly. Please reply to the message you received, or call us and we will help.</p>`, brand);
}

function renderGet(q, r, token, brand) {
  const r2 = r === 'yes' ? 'yes' : 'no';
  const lines = summary(q).map((l) => `<li>${esc(l)}</li>`).join('');
  const amount = price(q);
  const question = r2 === 'yes'
    ? `<h1>Confirm you would like to go ahead</h1><p>${esc(q.customer_name ? `${q.customer_name}, ` : '')}${amount ? `we will go ahead for <b>${esc(amount)}</b>.` : 'we will go ahead with the price we sent you.'}</p>`
    : `<h1>Confirm you do not want to go ahead</h1><p>No problem. We will not take this booking any further.</p>`;
  const body = `${question}<ul>${lines}</ul>
<form method="post" action="/api/booking/quote-response?t=${encodeURIComponent(token)}&amp;r=${r2}">
<button class="btn ${r2 === 'yes' ? 'yes' : 'no'}" type="submit">${r2 === 'yes' ? 'Yes, go ahead' : 'No, thank you'}</button></form>
<p style="font-size:13px;margin-top:14px;color:#9aa4b5">If you change your mind, just reply to our message.</p>`;
  return page(r2 === 'yes' ? 'Go ahead' : 'Not going ahead', body, brand);
}

function renderDone(r, brand) {
  return page('Thank you', `<h1>Thank you</h1><p>${r === 'yes' ? 'We have received your yes. We will be in touch shortly to confirm your booking and send the payment details.' : 'We have received your reply. We are sorry we could not help this time, and thank you for getting in touch.'}</p>`, brand);
}

function renderAlready(q, brand) {
  return page('Already answered', `<h1>You have already replied</h1><p>You told us ${q.customer_response === 'yes' ? 'yes, go ahead' : 'no thank you'}. If you need to change this, please reply to our message.</p>`, brand);
}

const isUuid = (v) => UUID_RE.test(String(v || ''));

async function findQuote(token) {
  if (!isUuid(token)) return null;
  return dbFindOne('quote_requests', { quote_token: token }, '*');
}

/**
 * Records the reply once. Returns 'recorded', 'already' or 'missing'.
 * The conditional update (only where no reply exists yet) is what stops a second tap
 * or a double submit from changing the first answer.
 */
async function recordReply(token, r) {
  const q = await findQuote(token);
  if (!q) return { status: 'missing' };
  const changed = await dbUpdateMatching(
    'quote_requests',
    `quote_token=eq.${encodeURIComponent(token)}&customer_response=is.null`,
    { customer_response: r, responded_at: new Date().toISOString() },
  );
  if (!changed || !changed.length) return { status: 'already', quote: q };
  sendPushToOperatorDevices(
    r === 'yes' ? 'Quote accepted' : 'Quote declined',
    `${q.customer_name || 'Customer'} · ${price(q) || 'quote'} · ${ddmmyyyy(q.pickup_date) || ''}`.trim(),
    '/operator/inbox',
    `quote-reply-${q.id}`,
    q.tenant_id,
  ).catch(() => {});
  return { status: 'recorded', quote: { ...q, customer_response: r } };
}

async function handle(req, res) {
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store, max-age=0');
  res.setHeader('X-Robots-Tag', 'noindex');
  const token = String((req.query || {}).t || '');
  const r = String((req.query || {}).r || '');
  if (!['yes', 'no'].includes(r)) { res.statusCode = 400; return res.end(invalid()); }
  const q = await findQuote(token);
  if (!q) { res.statusCode = 404; return res.end(invalid()); }
  const brand = brandFor(q.tenant_id) || undefined;
  if (req.method === 'POST') {
    const out = await recordReply(token, r);
    if (out.status === 'missing') { res.statusCode = 404; return res.end(invalid(brand)); }
    if (out.status === 'already') return res.end(renderAlready(out.quote, brand));
    return res.end(renderDone(r, brand));
  }
  if (q.customer_response) return res.end(renderAlready(q, brand));
  return res.end(renderGet(q, r, token, brand));
}

module.exports = { handle, renderGet, renderDone, renderAlready, recordReply, summary, price, ddmmyyyy, isUuid };
