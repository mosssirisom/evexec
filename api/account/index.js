'use strict';

const { verifyAuth } = require('../../lib/auth');
const { parseBody }  = require('../../lib/parse');
const { isValidUUID } = require('../../lib/supabase');
const { awardPoints } = require('../../lib/points');
const { normaliseUkPhone } = require('../../lib/notify');
const { stripeRequest, getOrCreateStripeCustomer } = require('../../lib/stripeCustomer');

const SUPABASE_URL = () => process.env.SUPABASE_URL || 'https://yoltkmhtxwluqxxpewbl.supabase.co';
const SERVICE_KEY  = () => process.env.SUPABASE_SERVICE_ROLE_KEY;

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

function customerStatus(booking) {
  const status = booking.status || '';
  const paymentStatus = booking.payment_status || '';
  const driverId = booking.assigned_driver_id || booking.driver_id || null;

  if (status === 'Cancelled') return 'Unavailable';
  if (status === 'Completed') return 'Trip Completed';
  if (status === 'Passenger On Board') return 'Passenger On Board';
  if (status === 'Driver Arrived') return 'Driver Arrived';
  if (status === 'En Route') return 'Driver En Route';

  if (status === 'Dispatched') {
    if (driverId) return 'Driver Confirmed';
    if (paymentStatus === 'Paid' || paymentStatus === 'Invoiced' || paymentStatus === 'paid' || paymentStatus === 'cash_on_day') {
      return 'Trip Confirmed';
    }
    return 'Trip Confirmed';
  }

  return 'Awaiting Approval';
}

function attachCustomerStatus(rows) {
  return rows.map(row => ({
    ...row,
    customer_status: customerStatus(row)
  }));
}

// ── GET|PATCH /api/account/profile ─────────────────────────────────────────

async function handleProfile(req, res, user) {
  if (req.method === 'GET') {
    try {
      const r = await fetch(
        `${SUPABASE_URL()}/rest/v1/profiles?id=eq.${user.id}&select=*&limit=1`,
        { headers: headers() }
      );
      if (!r.ok) throw new Error(await r.text());
      const rows = await r.json();
      const profile = rows[0] || { id: user.id, privilege_points: 0, push_enabled: false };
      return res.end(JSON.stringify({ profile }));
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
      return res.end(JSON.stringify({ profile: rows[0] || null }));
    } catch (err) {
      res.statusCode = 500;
      return res.end(JSON.stringify({ error: err.message }));
    }
  }

  res.statusCode = 405;
  res.end(JSON.stringify({ error: 'Method not allowed' }));
}

// ── GET /api/account/journeys ──────────────────────────────────────────────

async function handleJourneys(req, res, user) {
  if (req.method !== 'GET') {
    res.statusCode = 405;
    return res.end(JSON.stringify({ error: 'Method not allowed' }));
  }

  try {
    const email  = normaliseEmail(user.email);
    const fields = 'id,ref,journey_type,pickup_location,airport,dropoff_address,travel_date,travel_time,passengers,luggage,return_journey,return_date,return_time,status,quoted_price,payment_status,payment_method,created_at,flight_number,assigned_driver_id,driver_id,customer_email';

    const requests = [
      fetch(
        `${SUPABASE_URL()}/rest/v1/bookings?user_id=eq.${user.id}&select=${fields}&order=created_at.desc&limit=100`,
        { headers: headers() }
      )
    ];

    if (email) {
      requests.push(fetch(
        `${SUPABASE_URL()}/rest/v1/bookings?customer_email=ilike.${encodeURIComponent(email)}&select=${fields}&order=created_at.desc&limit=100`,
        { headers: headers() }
      ));
    }

    const responses = await Promise.all(requests);
    const merged = [];
    const seen = new Set();

    for (const r of responses) {
      if (!r.ok) continue;
      const rows = await r.json();
      for (const row of rows) {
        if (seen.has(row.id)) continue;
        seen.add(row.id);
        merged.push(row);
      }
    }

    merged.sort((a, b) => new Date(b.created_at || 0) - new Date(a.created_at || 0));

    res.statusCode = 200;
    res.end(JSON.stringify({ journeys: attachCustomerStatus(merged.slice(0, 100)) }));
  } catch (err) {
    res.statusCode = 500;
    res.end(JSON.stringify({ error: err.message }));
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
      return res.end(JSON.stringify({ ok: true, points_awarded: 0, already_claimed: true }));
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

    const delta = booking.return_journey ? 2 : 1;
    await awardPoints(user.id, delta);

    return res.end(JSON.stringify({ ok: true, points_awarded: delta }));
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
    if (!id.startsWith('pm_')) {
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
  if (!pmId.startsWith('pm_')) {
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

    const owns = booking.user_id === user.id ||
      (booking.customer_email && normaliseEmail(booking.customer_email) === normaliseEmail(user.email));
    if (!owns) {
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
  if (path.endsWith('/profile'))                    return handleProfile(req, res, user);
  if (path.endsWith('/journeys'))                   return handleJourneys(req, res, user);
  if (path.endsWith('/addresses'))                  return handleAddresses(req, res, user);
  if (path.endsWith('/claim-booking'))              return handleClaimBooking(req, res, user);
  if (path.endsWith('/payment-methods/setup-intent')) return handlePaymentMethodSetupIntent(req, res, user);
  if (path.endsWith('/payment-methods/default'))    return handlePaymentMethodDefault(req, res, user);
  if (path.endsWith('/payment-methods'))            return handlePaymentMethods(req, res, user);
  if (path.endsWith('/receipt'))                    return handleReceipt(req, res, user);

  res.statusCode = 404;
  res.end(JSON.stringify({ error: 'Not found' }));
};