'use strict';

// Durable record of every Stripe webhook delivery (public.stripe_webhook_events,
// keyed by Stripe event id) and of rejected deliveries
// (public.stripe_webhook_rejections). Vercel keeps logs for an hour on this
// plan, so this is what shows afterwards what Stripe sent and what we did.
// Every call here is best effort: if the log can't be written, payment
// processing carries on, because the booking update is the real source of truth.

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://yoltkmhtxwluqxxpewbl.supabase.co';

function headers(extra = {}) {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  return { 'Content-Type': 'application/json', apikey: key, Authorization: `Bearer ${key}`, ...extra };
}

// Records that an event arrived (or arrived again) and returns its row, so a
// repeat delivery of an event that was already handled can be answered at once.
async function eventSeen(event, sessionId) {
  try {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/rpc/stripe_webhook_event_seen`, {
      method: 'POST', headers: headers(),
      body: JSON.stringify({ p_event_id: event.id, p_event_type: event.type, p_livemode: Boolean(event.livemode), p_session_id: sessionId || null })
    });
    if (!res.ok) { console.error('stripe_webhook_event_seen failed:', res.status, await res.text()); return null; }
    const row = await res.json();
    return Array.isArray(row) ? row[0] || null : row;
  } catch (err) { console.error('stripe_webhook_event_seen error:', err.message || err); return null; }
}

async function eventResult(eventId, fields) {
  try {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/stripe_webhook_events?event_id=eq.${encodeURIComponent(eventId)}`, {
      method: 'PATCH', headers: headers({ Prefer: 'return=minimal' }),
      body: JSON.stringify({ ...fields, processed_at: new Date().toISOString() })
    });
    if (!res.ok) console.error('stripe_webhook_events update failed:', res.status, await res.text());
  } catch (err) { console.error('stripe_webhook_events update error:', err.message || err); }
}

async function rejection(reason, diagnostics) {
  try {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/stripe_webhook_rejections`, {
      method: 'POST', headers: headers({ Prefer: 'return=minimal' }),
      body: JSON.stringify({ reason: String(reason).slice(0, 200), claimed_event_id: diagnostics.claimed_event_id || null, diagnostics })
    });
    if (!res.ok) console.error('stripe_webhook_rejections insert failed:', res.status, await res.text());
  } catch (err) { console.error('stripe_webhook_rejections insert error:', err.message || err); }
}

// Outcomes that are final: a repeat delivery of the same event changes nothing.
const FINAL = new Set(['recorded', 'already_paid', 'duplicate_payment', 'not_paid', 'no_reference', 'unknown_booking', 'ignored']);

module.exports = { eventSeen, eventResult, rejection, FINAL };
