'use strict';

const { verifyAuth } = require('../../lib/auth');
const { parseBody }  = require('../../lib/parse');
const { isValidUUID } = require('../../lib/supabase');
const { normaliseUkPhone } = require('../../lib/notify');
const { stripeRequest, getOrCreateStripeCustomer } = require('../../lib/stripeCustomer');

const SUPABASE_URL = () => process.env.SUPABASE_URL || 'https://yoltkmhtxwluqxxpewbl.supabase.co';
const SERVICE_KEY  = () => process.env.SUPABASE_SERVICE_ROLE_KEY;
// Public anon key (same one /api/config hands the browser); used only to call
// sync_my_points() as the signed-in customer.
const ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InlvbHRrbWh0eHdsdXF4eHBld2JsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzk0ODMwNjgsImV4cCI6MjA5NTA1OTA2OH0.kLwJK13TsSNn4oK3NZj33awGigWfdKgPP-cbqpqrIbo';

// Stripe payment method IDs are pm_ followed only by alphanumerics. A bare
// `startsWith('pm_')` check lets the rest of the string through unchecked --
// since it's interpolated straight into a Stripe API URL path, a value like
// `pm_x/../../customers/cus_someoneElse` would make this server call an
// arbitrary Stripe endpoint with its own secret key. This regex is the real
// boundary; startsWith alone is not.
const VALID_PM_ID = /^pm_[a-zA-Z0-9]+$/;

function headers(extra = {}) {
  return {
    'Content-Type': 'application/json',
    'apikey': SERVICE_KEY(),
    'Authorization': `Bearer ${SERVICE_KEY()}`,
    ...extra
  };
}

function normaliseEmail(email) {
  return String(email || '').trim().toLowerCase();
}

const DONE_STATUSES = ['Completed', 'completed', 'Cancelled', 'cancelled', 'Canceled', 'canceled', 'rejected', 'No Show', 'no show'];

function isNoShow(booking) {
  return booking.status === 'No Show' || booking.status === 'no show' ||
    (/^cancel/i.test(booking.status || '') && String(booking.driver_notes || '').includes('[No Show]'));
}

function customerStatus(booking) {
  const status = booking.status || '';
  const driverId = booking.assigned_driver_id || booking.driver_id || null;

  if (isNoShow(booking)) return 'No Show';
  if (/^cancel/i.test(status)) return 'Cancelled';
  if (status === 'rejected') return 'Unavailable';
  if (/^completed$/i.test(status)) return 'Trip Completed';
  if (status === 'Passenger On Board' || /^active$/i.test(status)) return 'On Board';
  if (/^arrived$/i.test(status)) return 'Driver Arrived';
  if (status === 'En Route' || status === 'en_route') return 'Driver En Route';
  if (['Dispatched', 'accepted', 'confirmed'].includes(status)) return driverId ? 'Driver Confirmed' : 'Trip Confirmed';
  return 'Awaiting Approval';
}

// Today's date in the UK as YYYY-MM-DD.
function ukToday() {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/London', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
}

// Upcoming = not finished and not in the past. A journey already under way
// (En Route / Arrived / On Board) stays upcoming until it is completed.
function isUpcoming(booking, today) {
  if (DONE_STATUSES.includes(booking.status)) return false;
  if (['En Route', 'en_route', 'Arrived', 'arrived', 'Passenger On Board', 'active', 'Active'].includes(booking.status)) return true;
  return !booking.travel_date || booking.travel_date >= today;
}

function attachCustomerStatus(rows) {
  const today = ukToday();
  return rows.map(row => {
    const { driver_notes, ...rest } = row;
    return { ...rest, customer_status: customerStatus(row), upcoming: isUpcoming(row, today) };
  });
}

// Privilege Points balance and history from the points ledger. The ledger is
// written only by the database (one point per completed journey, once per
// booking); sync_my_points() catches up any completed journeys of this
// customer that were not awarded yet. It runs as the customer, using their
// own token, so it can only ever touch their own bookings.
async function getPoints(user, token) {
  if (token) {
    await fetch(`${SUPABASE_URL()}/rest/v1/rpc/sync_my_points`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', apikey: ANON_KEY, Authorization: `Bearer ${token}` },
      body: '{}'
    }).catch(() => {});
  }
  const r = await fetch(
    `${SUPABASE_URL()}/rest/v1/points_transactions?user_id=eq.${user.id}&select=points,type,note,created_at&order=created_at.desc&limit=200`,
    { headers: headers() }
  );
  if (!r.ok) throw new Error(await r.text());
  const history = await r.json();
  return { balance: history.reduce((sum, t) => sum + (t.points || 0), 0), history };
}

// ── GET|PATCH /api/account/profile ─────────────────────────────────────────

async function handleProfile(req, res, user, token) {
  if (req.method === 'GET') {
    try {
      const [r, points] = await Promise.all([
        fetch(`${SUPABASE_URL()}/rest/v1/profiles?id=eq.${user.id}&select=*&limit=1`, { headers: headers() }),
        getPoints(user, token)
      ]);
      if (!r.ok) throw new Error(await r.text());
      const rows = await r.json();
      const profile = { ...(rows[0] || { id: user.id, push_enabled: false }), privilege_points: points.balance };
      return res.end(JSON.stringify({ profile, points_history: points.history }));
    } catch (err) {
      res.statusCode = 500;
      return res.end(JSON.stringify({ error: err.message }));
    }
  }

  if (req.method === 'PATCH') {
    let body;
    try { body = await parseBody(req); }
    catch { res.statusCode = 400; return res.end(JSON.stringify({ error: 'Invalid body' })); }

    const allowed = ['full_name', 'phone', 'avatar_url', 'push_enabled', 'notify_email', 'notify_sms'];
    const update = {};
    for (const k of allowed) { if (k in body) update[k] = body[k]; }

    try {
      const r = await fetch(
        `${SUPABASE_URL()}/rest/v1/profiles`,
        {
          method: 'POST',
          headers: headers({ Prefer: 'resolution=merge-duplicates,return=representation' }),
          body: JSON.stringify({ ...update, id: user.id, updated_at: new Date().toISOString() })
        }
      );
      if (!r.ok) throw new Error(await r.text());
      const rows = await r.json();
      const points = await getPoints(user, null);
      return res.end(JSON.stringify({ profile: rows[0] ? { ...rows[0], privilege_points: points.balance } : null }));
    } catch (err) {
      res.statusCode = 500;
      return res.end(JSON.stringify({ error: err.message }));
    }
  }

  res.statusCode = 405;
  res.end(JSON.stringify({ error: 'Method not allowed' }));
}

// ── Bookings owned by the signed-in customer ──────────────────────────────
// A booking is the customer's when it is linked to their account, or when it
// has no account and its email is exactly their (confirmed) account email.
// Every journey, receipt and invoice lookup goes through this rule.

const BOOKING_FIELDS = 'id,ref,journey_type,pickup_location,airport,dropoff_address,travel_date,travel_time,passengers,luggage,return_journey,return_date,return_time,status,quoted_price,payment_status,payment_method,created_at,flight_number,assigned_driver_id,driver_id,customer_email,user_id,driver_notes,notes';

function ownsBooking(row, user) {
  const email = normaliseEmail(user.email);
  return Boolean(row) && (row.user_id === user.id || (!row.user_id && email && normaliseEmail(row.customer_email) === email));
}

async function fetchOwnedBookings(user) {
  const email = normaliseEmail(user.email);
  const requests = [
    fetch(`${SUPABASE_URL()}/rest/v1/bookings?user_id=eq.${user.id}&select=${BOOKING_FIELDS}&order=created_at.desc&limit=100`, { headers: headers() })
  ];
  if (email) {
    requests.push(fetch(
      // ilike only to ignore capital letters: % and _ are escaped so they
      // match literally, and rows are re-checked for an exact match below.
      `${SUPABASE_URL()}/rest/v1/bookings?customer_email=ilike.${encodeURIComponent(email.replace(/[\\%_]/g, c => '\\' + c))}&select=${BOOKING_FIELDS}&order=created_at.desc&limit=100`,
      { headers: headers() }
    ));
  }
  const responses = await Promise.all(requests);
  const merged = [];
  const seen = new Set();
  for (const r of responses) {
    if (!r.ok) continue;
    for (const row of await r.json()) {
      if (seen.has(row.id) || !ownsBooking(row, user)) continue;
      seen.add(row.id);
      merged.push(row);
    }
  }
  merged.sort((a, b) => new Date(b.created_at || 0) - new Date(a.created_at || 0));
  return merged.slice(0, 100);
}

// ── Invoices ───────────────────────────────────────────────────────────────
// The operator app's invoices table is the single source: one invoice per
// booking (database-enforced), created when the booking is completed. A
// return trip is two bookings; the outbound invoice covers both, so the
// return leg points to it.

const INVOICE_FIELDS = 'id,invoice_number,booking_id,booking_ref,customer_name,customer_email,customer_phone,customer_address,line_items,journey,subtotal,vat_rate,vat_amount,total,status,issue_date,due_date,notes,tenant_id';

// Draft invoices are the office's work in progress: customers only see an
// invoice once it has been issued (sent, paid or voided) or the booking has
// been marked invoiced/paid.
function invoiceVisible(inv, booking) {
  return inv.status !== 'Draft' || ['Paid', 'Invoiced'].includes(booking?.payment_status);
}

// Paid when either the invoice or the booking is marked paid; a voided
// invoice, or an unpaid cancelled booking, is Cancelled; otherwise Outstanding.
function invoiceStatus(inv, booking) {
  if (inv.status === 'Void') return 'Cancelled';
  if (inv.status === 'Paid' || booking?.payment_status === 'Paid') return 'Paid';
  if (booking && /^cancel/i.test(booking.status || '')) return 'Cancelled';
  return 'Outstanding';
}

function outboundRefOf(booking) {
  const m = String(booking.notes || '').match(/Outbound ref: (EVX-[A-Z0-9]+)/);
  return m ? m[1] : null;
}

function routeOf(b) {
  return `${b.pickup_location || b.airport || 'Pickup'} → ${b.dropoff_address || b.airport || 'Destination'}`;
}

async function syncMyInvoices(token) {
  if (!token) return;
  await fetch(`${SUPABASE_URL()}/rest/v1/rpc/sync_my_invoices`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', apikey: ANON_KEY, Authorization: `Bearer ${token}` },
    body: '{}'
  }).catch(() => {});
}

// Invoices for the given bookings, keyed by booking id. Return legs get their
// outbound booking's invoice (looked up by reference among the same
// customer's bookings only).
async function invoicesForBookings(bookings) {
  const ids = bookings.map(b => b.id);
  const byId = new Map();
  if (!ids.length) return byId;
  const r = await fetch(`${SUPABASE_URL()}/rest/v1/invoices?booking_id=in.(${ids.join(',')})&select=${INVOICE_FIELDS}`, { headers: headers() });
  if (!r.ok) throw new Error(await r.text());
  const rows = await r.json();
  const bookingById = new Map(bookings.map(b => [b.id, b]));
  for (const inv of rows) {
    const bk = bookingById.get(inv.booking_id);
    if (bk && invoiceVisible(inv, bk)) byId.set(bk.id, { inv, booking: bk });
  }
  const byRef = new Map(bookings.map(b => [b.ref, b]));
  for (const b of bookings) {
    if (byId.has(b.id)) continue;
    const outbound = byRef.get(outboundRefOf(b));
    if (outbound && byId.has(outbound.id)) byId.set(b.id, { ...byId.get(outbound.id), viaReturnLeg: true });
  }
  return byId;
}

function invoiceSummary(inv, booking) {
  return {
    id: inv.id,
    number: inv.invoice_number,
    issueDate: inv.issue_date,
    status: invoiceStatus(inv, booking),
    total: Number(inv.total) || 0,
    route: routeOf(booking),
    bookingId: booking.id,
    bookingRef: booking.ref
  };
}

// ── GET /api/account/journeys ──────────────────────────────────────────────

async function handleJourneys(req, res, user, token) {
  if (req.method !== 'GET') {
    res.statusCode = 405;
    return res.end(JSON.stringify({ error: 'Method not allowed' }));
  }

  try {
    await syncMyInvoices(token);
    const owned = await fetchOwnedBookings(user);
    const invoices = await invoicesForBookings(owned);
    const journeys = attachCustomerStatus(owned).map(j => {
      const found = invoices.get(j.id);
      const { notes, ...rest } = j;
      return { ...rest, invoice: found ? { id: found.inv.id, number: found.inv.invoice_number, status: invoiceStatus(found.inv, found.booking), coversReturn: Boolean(found.viaReturnLeg) } : null };
    });
    res.statusCode = 200;
    res.end(JSON.stringify({ journeys }));
  } catch (err) {
    res.statusCode = 500;
    res.end(JSON.stringify({ error: err.message }));
  }
}

// ── GET /api/account/invoices ──────────────────────────────────────────────

async function handleInvoices(req, res, user, token) {
  if (req.method !== 'GET') {
    res.statusCode = 405;
    return res.end(JSON.stringify({ error: 'Method not allowed' }));
  }
  try {
    await syncMyInvoices(token);
    const owned = await fetchOwnedBookings(user);
    const invoices = await invoicesForBookings(owned);
    const list = [];
    const seen = new Set();
    for (const { inv, booking } of invoices.values()) {
      if (seen.has(inv.id)) continue;
      seen.add(inv.id);
      list.push(invoiceSummary(inv, booking));
    }
    list.sort((a, b) => String(b.issueDate || '').localeCompare(String(a.issueDate || '')) || String(b.number).localeCompare(String(a.number)));
    res.end(JSON.stringify({ invoices: list }));
  } catch (err) {
    res.statusCode = 500;
    res.end(JSON.stringify({ error: err.message }));
  }
}

// ── GET /api/account/invoice?id=… ──────────────────────────────────────────
// Ownership is checked against the invoice's booking on every request; an
// invoice that is not the customer's is reported as not found.

async function handleInvoice(req, res, user) {
  if (req.method !== 'GET') {
    res.statusCode = 405;
    return res.end(JSON.stringify({ error: 'Method not allowed' }));
  }
  const id = (req.query && req.query.id) || '';
  if (!isValidUUID(id)) {
    res.statusCode = 400;
    return res.end(JSON.stringify({ error: 'Valid invoice id required' }));
  }
  const notFound = () => { res.statusCode = 404; return res.end(JSON.stringify({ error: 'Invoice not found' })); };
  try {
    const r = await fetch(`${SUPABASE_URL()}/rest/v1/invoices?id=eq.${id}&select=${INVOICE_FIELDS}&limit=1`, { headers: headers() });
    if (!r.ok) throw new Error(await r.text());
    const inv = (await r.json())[0];
    if (!inv || !inv.booking_id) return notFound();

    const br = await fetch(`${SUPABASE_URL()}/rest/v1/bookings?id=eq.${inv.booking_id}&select=${BOOKING_FIELDS}&limit=1`, { headers: headers() });
    if (!br.ok) throw new Error(await br.text());
    const booking = (await br.json())[0];
    if (!ownsBooking(booking, user) || !invoiceVisible(inv, booking)) return notFound();

    const tr = await fetch(`${SUPABASE_URL()}/rest/v1/tenants?id=eq.${inv.tenant_id || booking.tenant_id || '00000000-0000-0000-0000-000000000001'}&select=name,brand&limit=1`, { headers: headers() });
    const tenant = tr.ok ? (await tr.json())[0] : null;
    const biz = (tenant && tenant.brand && tenant.brand.invoice) || {};

    return res.end(JSON.stringify({
      invoice: {
        id: inv.id,
        number: inv.invoice_number,
        issueDate: inv.issue_date,
        dueDate: inv.due_date,
        status: invoiceStatus(inv, booking),
        customer: { name: inv.customer_name, email: inv.customer_email, phone: inv.customer_phone, address: inv.customer_address },
        lineItems: Array.isArray(inv.line_items) ? inv.line_items.map(li => ({ description: li.description, quantity: Number(li.quantity) || 0, unitPrice: Number(li.unit_price) || 0 })) : [],
        journey: inv.journey || {},
        subtotal: Number(inv.subtotal) || 0,
        vatRate: Number(inv.vat_rate) || 0,
        vatAmount: Number(inv.vat_amount) || 0,
        total: Number(inv.total) || 0,
        paymentTerms: (inv.notes && inv.notes.trim()) || biz.payment_terms || '',
        paymentMethod: booking.payment_method || null,
        booking: { id: booking.id, ref: booking.ref, status: booking.status }
      },
      business: {
        name: biz.business_name || (tenant && tenant.name) || 'EV Exec',
        addressLines: biz.address_lines || [],
        phone: biz.phone || '',
        email: biz.email || '',
        web: biz.web || '',
        tagline: biz.tagline || []
      }
    }));
  } catch (err) {
    res.statusCode = 500;
    return res.end(JSON.stringify({ error: err.message }));
  }
}

// ── GET|POST|DELETE /api/account/addresses ─────────────────────────────────

async function handleAddresses(req, res, user) {
  if (req.method === 'GET') {
    try {
      const r = await fetch(
        `${SUPABASE_URL()}/rest/v1/saved_addresses?user_id=eq.${user.id}&select=id,label,address&order=created_at.asc`,
        { headers: headers() }
      );
      if (!r.ok) throw new Error(await r.text());
      const addresses = await r.json();
      return res.end(JSON.stringify({ addresses }));
    } catch (err) {
      res.statusCode = 500;
      return res.end(JSON.stringify({ error: err.message }));
    }
  }

  if (req.method === 'POST') {
    let body;
    try { body = await parseBody(req); }
    catch { res.statusCode = 400; return res.end(JSON.stringify({ error: 'Invalid body' })); }

    const label = String(body.label || '').trim();
    const address = String(body.address || '').trim();
    if (!label || !address) {
      res.statusCode = 400;
      return res.end(JSON.stringify({ error: 'Label and address are required' }));
    }

    try {
      const r = await fetch(
        `${SUPABASE_URL()}/rest/v1/saved_addresses`,
        {
          method: 'POST',
          headers: headers({ Prefer: 'return=representation' }),
          body: JSON.stringify({ user_id: user.id, label, address })
        }
      );
      if (!r.ok) throw new Error(await r.text());
      const rows = await r.json();
      return res.end(JSON.stringify({ address: rows[0] || null }));
    } catch (err) {
      res.statusCode = 500;
      return res.end(JSON.stringify({ error: err.message }));
    }
  }

  if (req.method === 'DELETE') {
    const id = (req.query && req.query.id) || '';
    if (!isValidUUID(id)) {
      res.statusCode = 400;
      return res.end(JSON.stringify({ error: 'Valid id required' }));
    }

    try {
      const r = await fetch(
        `${SUPABASE_URL()}/rest/v1/saved_addresses?id=eq.${id}&user_id=eq.${user.id}`,
        { method: 'DELETE', headers: headers() }
      );
      if (!r.ok) throw new Error(await r.text());
      return res.end(JSON.stringify({ ok: true }));
    } catch (err) {
      res.statusCode = 500;
      return res.end(JSON.stringify({ error: err.message }));
    }
  }

  res.statusCode = 405;
  res.end(JSON.stringify({ error: 'Method not allowed' }));
}

// ── POST /api/account/claim-booking ───────────────────────────────────────

async function handleClaimBooking(req, res, user) {
  if (req.method !== 'POST') {
    res.statusCode = 405;
    return res.end(JSON.stringify({ error: 'Method not allowed' }));
  }

  let body;
  try { body = await parseBody(req); }
  catch { res.statusCode = 400; return res.end(JSON.stringify({ error: 'Invalid body' })); }

  const ref = String(body.ref || '').trim().toUpperCase();
  const phone = normaliseUkPhone(body.phone || '');
  if (!ref.startsWith('EVX-') || ref.length < 7) {
    res.statusCode = 400;
    return res.end(JSON.stringify({ error: 'Invalid booking reference. Format: EVX-XXXXXX' }));
  }

  try {
    const r = await fetch(
      `${SUPABASE_URL()}/rest/v1/bookings?ref=eq.${encodeURIComponent(ref)}&select=id,ref,user_id,return_journey,customer_email,customer_phone,status&limit=1`,
      { headers: headers() }
    );
    if (!r.ok) throw new Error('Database error');
    const rows = await r.json();
    if (!rows.length) {
      res.statusCode = 404;
      return res.end(JSON.stringify({ error: 'Booking reference not found' }));
    }

    const booking = rows[0];

    if (booking.user_id === user.id) {
      return res.end(JSON.stringify({ ok: true, already_claimed: true }));
    }

    if (booking.user_id && booking.user_id !== user.id) {
      res.statusCode = 409;
      return res.end(JSON.stringify({ error: 'This booking is already linked to another account' }));
    }

    const bookingEmail = normaliseEmail(booking.customer_email || '');
    const userEmail    = normaliseEmail(user.email || '');
    if (bookingEmail) {
      if (userEmail && bookingEmail !== userEmail) {
        res.statusCode = 403;
        return res.end(JSON.stringify({ error: 'This booking reference does not match your account email' }));
      }
    } else {
      // No email on file for this booking — verify with phone instead, so a
      // bare reference number (visible in emails/SMS the customer received)
      // isn't enough on its own to link someone else's booking to your account.
      const bookingPhone = normaliseUkPhone(booking.customer_phone || '');
      if (!bookingPhone || !phone || bookingPhone !== phone) {
        res.statusCode = 403;
        return res.end(JSON.stringify({ error: 'phone_required', message: 'This booking has no email on file. Enter the phone number used when booking to verify it\'s yours.' }));
      }
    }

    const upd = await fetch(
      `${SUPABASE_URL()}/rest/v1/bookings?id=eq.${booking.id}`,
      {
        method: 'PATCH',
        headers: headers({ Prefer: 'return=minimal' }),
        body: JSON.stringify({ user_id: user.id })
      }
    );
    if (!upd.ok) throw new Error('Failed to link booking');

    // Points are not awarded here: the database awards one point when a
    // linked journey is completed (straight away if it already is).
    return res.end(JSON.stringify({ ok: true, completed: /^completed$/i.test(booking.status || '') }));
  } catch (err) {
    res.statusCode = 500;
    return res.end(JSON.stringify({ error: err.message || 'Failed to claim booking' }));
  }
}

async function getProfileRow(userId) {
  const r = await fetch(
    `${SUPABASE_URL()}/rest/v1/profiles?id=eq.${userId}&select=*&limit=1`,
    { headers: headers() }
  );
  if (!r.ok) throw new Error(await r.text());
  const rows = await r.json();
  return rows[0] || null;
}

// ── GET|POST|DELETE /api/account/payment-methods ───────────────────────────
// Real saved cards via a Stripe Customer per user. Card data never touches
// this server: the client collects it with Stripe.js/Elements and confirms
// the SetupIntent directly with Stripe, so only a payment_method id (never a
// card number) ever reaches this API.

async function handlePaymentMethods(req, res, user) {
  if (!process.env.STRIPE_SECRET_KEY) {
    res.statusCode = 503;
    return res.end(JSON.stringify({ error: 'Payments are not configured yet.' }));
  }

  if (req.method === 'GET') {
    try {
      const profile = await getProfileRow(user.id);
      if (!profile?.stripe_customer_id) {
        return res.end(JSON.stringify({ paymentMethods: [], defaultId: null }));
      }
      const [pms, customer] = await Promise.all([
        stripeRequest(`payment_methods?customer=${profile.stripe_customer_id}&type=card`),
        stripeRequest(`customers/${profile.stripe_customer_id}`)
      ]);
      const paymentMethods = (pms.data || []).map(pm => ({
        id: pm.id,
        brand: pm.card?.brand || 'card',
        last4: pm.card?.last4 || '····',
        expMonth: pm.card?.exp_month,
        expYear: pm.card?.exp_year
      }));
      return res.end(JSON.stringify({
        paymentMethods,
        defaultId: customer.invoice_settings?.default_payment_method || null
      }));
    } catch (err) {
      res.statusCode = 500;
      return res.end(JSON.stringify({ error: err.message }));
    }
  }

  if (req.method === 'DELETE') {
    const id = (req.query && req.query.id) || '';
    if (!VALID_PM_ID.test(id)) {
      res.statusCode = 400;
      return res.end(JSON.stringify({ error: 'Valid payment method id required' }));
    }
    try {
      const profile = await getProfileRow(user.id);
      const pm = await stripeRequest(`payment_methods/${id}`);
      if (!profile?.stripe_customer_id || pm.customer !== profile.stripe_customer_id) {
        res.statusCode = 403;
        return res.end(JSON.stringify({ error: 'This card does not belong to your account' }));
      }
      await stripeRequest(`payment_methods/${id}/detach`, new URLSearchParams());
      return res.end(JSON.stringify({ ok: true }));
    } catch (err) {
      res.statusCode = 500;
      return res.end(JSON.stringify({ error: err.message }));
    }
  }

  res.statusCode = 405;
  res.end(JSON.stringify({ error: 'Method not allowed' }));
}

async function handlePaymentMethodSetupIntent(req, res, user) {
  if (req.method !== 'POST') {
    res.statusCode = 405;
    return res.end(JSON.stringify({ error: 'Method not allowed' }));
  }
  if (!process.env.STRIPE_SECRET_KEY) {
    res.statusCode = 503;
    return res.end(JSON.stringify({ error: 'Payments are not configured yet.' }));
  }
  try {
    const profile = await getProfileRow(user.id);
    const customerId = await getOrCreateStripeCustomer(user, profile);
    const params = new URLSearchParams();
    params.set('customer', customerId);
    params.set('payment_method_types[]', 'card');
    params.set('usage', 'off_session');
    const setupIntent = await stripeRequest('setup_intents', params);
    return res.end(JSON.stringify({ clientSecret: setupIntent.client_secret }));
  } catch (err) {
    res.statusCode = 500;
    return res.end(JSON.stringify({ error: err.message }));
  }
}

async function handlePaymentMethodDefault(req, res, user) {
  if (req.method !== 'POST') {
    res.statusCode = 405;
    return res.end(JSON.stringify({ error: 'Method not allowed' }));
  }
  let body;
  try { body = await parseBody(req); }
  catch { res.statusCode = 400; return res.end(JSON.stringify({ error: 'Invalid body' })); }

  const pmId = String(body.paymentMethodId || '');
  if (!VALID_PM_ID.test(pmId)) {
    res.statusCode = 400;
    return res.end(JSON.stringify({ error: 'Valid payment method id required' }));
  }

  try {
    const profile = await getProfileRow(user.id);
    const pm = await stripeRequest(`payment_methods/${pmId}`);
    if (!profile?.stripe_customer_id || pm.customer !== profile.stripe_customer_id) {
      res.statusCode = 403;
      return res.end(JSON.stringify({ error: 'This card does not belong to your account' }));
    }
    const params = new URLSearchParams();
    params.set('invoice_settings[default_payment_method]', pmId);
    await stripeRequest(`customers/${profile.stripe_customer_id}`, params);
    return res.end(JSON.stringify({ ok: true }));
  } catch (err) {
    res.statusCode = 500;
    return res.end(JSON.stringify({ error: err.message }));
  }
}

// ── GET /api/account/receipt?bookingId=... ──────────────────────────────────
// Card payments get Stripe's own hosted receipt. Cash/bank-transfer bookings
// have no Stripe object to point at, so a structured breakdown is returned
// instead for the frontend to render as a simple on-page receipt.

async function handleReceipt(req, res, user) {
  if (req.method !== 'GET') {
    res.statusCode = 405;
    return res.end(JSON.stringify({ error: 'Method not allowed' }));
  }
  const bookingId = (req.query && req.query.bookingId) || '';
  if (!isValidUUID(bookingId)) {
    res.statusCode = 400;
    return res.end(JSON.stringify({ error: 'Valid bookingId required' }));
  }

  try {
    const r = await fetch(
      `${SUPABASE_URL()}/rest/v1/bookings?id=eq.${bookingId}&select=*&limit=1`,
      { headers: headers() }
    );
    if (!r.ok) throw new Error(await r.text());
    const rows = await r.json();
    const booking = rows[0];
    if (!booking) {
      res.statusCode = 404;
      return res.end(JSON.stringify({ error: 'Booking not found' }));
    }

    if (!ownsBooking(booking, user)) {
      res.statusCode = 403;
      return res.end(JSON.stringify({ error: 'This booking is not on your account' }));
    }

    let stripeReceiptUrl = null;
    if (booking.stripe_session_id && process.env.STRIPE_SECRET_KEY) {
      try {
        const session = await stripeRequest(`checkout/sessions/${booking.stripe_session_id}`);
        if (session.payment_intent) {
          const pi = await stripeRequest(`payment_intents/${session.payment_intent}?expand[]=latest_charge`);
          stripeReceiptUrl = pi.latest_charge?.receipt_url || null;
        }
      } catch { /* fall through to the structured breakdown */ }
    }

    return res.end(JSON.stringify({
      stripeReceiptUrl,
      booking: {
        ref: booking.ref,
        journeyType: booking.journey_type,
        pickupLocation: booking.pickup_location,
        airport: booking.airport,
        dropoffAddress: booking.dropoff_address,
        travelDate: booking.travel_date,
        travelTime: booking.travel_time,
        quotedPrice: booking.quoted_price,
        paymentMethod: booking.payment_method,
        paymentStatus: booking.payment_status,
        createdAt: booking.created_at
      }
    }));
  } catch (err) {
    res.statusCode = 500;
    return res.end(JSON.stringify({ error: err.message }));
  }
}

// ── Router ─────────────────────────────────────────────────────────────────

module.exports = async function handler(req, res) {
  res.setHeader('Content-Type', 'application/json');

  const user = await verifyAuth(req);
  if (!user) {
    res.statusCode = 401;
    return res.end(JSON.stringify({ error: 'Unauthorised' }));
  }

  const path = (req.url || '').split('?')[0];
  if (path.endsWith('/profile'))                    return handleProfile(req, res, user, (req.headers['authorization'] || '').replace(/^Bearer /, ''));
  const token = (req.headers['authorization'] || '').replace(/^Bearer /, '');
  if (path.endsWith('/journeys'))                   return handleJourneys(req, res, user, token);
  if (path.endsWith('/invoices'))                   return handleInvoices(req, res, user, token);
  if (path.endsWith('/invoice'))                    return handleInvoice(req, res, user);
  if (path.endsWith('/addresses'))                  return handleAddresses(req, res, user);
  if (path.endsWith('/claim-booking'))              return handleClaimBooking(req, res, user);
  if (path.endsWith('/payment-methods/setup-intent')) return handlePaymentMethodSetupIntent(req, res, user);
  if (path.endsWith('/payment-methods/default'))    return handlePaymentMethodDefault(req, res, user);
  if (path.endsWith('/payment-methods'))            return handlePaymentMethods(req, res, user);
  if (path.endsWith('/receipt'))                    return handleReceipt(req, res, user);

  res.statusCode = 404;
  res.end(JSON.stringify({ error: 'Not found' }));
};