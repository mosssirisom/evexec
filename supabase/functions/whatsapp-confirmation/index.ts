// supabase/functions/whatsapp-confirmation/index.ts
//
// Triggered by a Supabase Database Webhook on UPDATE to the bookings table.
// When a booking's status changes to 'confirmed' this function fires,
// builds a WhatsApp message, and delivers it via the Twilio API.

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

// ── Credentials (set via: supabase secrets set KEY=value) ───────────────────
const TWILIO_ACCOUNT_SID   = Deno.env.get("TWILIO_ACCOUNT_SID")   ?? "";
const TWILIO_AUTH_TOKEN    = Deno.env.get("TWILIO_AUTH_TOKEN")     ?? "";
const TWILIO_WHATSAPP_FROM = Deno.env.get("TWILIO_WHATSAPP_NUMBER") ?? "";
// Optional: your Meta-approved Content Template SID (e.g. HXxxxxxxxx)
const TEMPLATE_SID         = Deno.env.get("TWILIO_TEMPLATE_SID")  ?? "";

// ── Types ────────────────────────────────────────────────────────────────────
interface BookingRecord {
  id: string;
  customer_name:    string;
  customer_phone:   string;
  journey_type:     string;
  pickup_location:  string | null;
  dropoff_address:  string | null;
  airport:          string | null;
  travel_date:      string | null;
  travel_time:      string | null;
  passengers:       number;
  quoted_price:     number | null;
  payment_method:   string | null;
  status:           string;
}

interface WebhookPayload {
  type:       "INSERT" | "UPDATE" | "DELETE";
  table:      string;
  schema:     string;
  record:     BookingRecord;
  old_record: BookingRecord | null;
}

// ── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Normalise a UK phone number to E.164 format and prepend whatsapp:
 * Handles: 07xxx, +447xxx, 447xxx
 */
function toWhatsApp(raw: string): string {
  let num = raw.replace(/[\s\-\(\)\.]/g, "");
  if (num.startsWith("07"))  num = "+44" + num.slice(1);  // 07xxx → +447xxx
  if (num.startsWith("447")) num = "+" + num;             // 447xxx → +447xxx
  if (!num.startsWith("+"))  num = "+" + num;
  return `whatsapp:${num}`;
}

/** Parse YYYY-MM-DD as local midnight to avoid UTC off-by-one in UK timezone */
function fmtDate(dateStr: string | null): string {
  if (!dateStr) return "TBC";
  const d = new Date(dateStr + "T00:00:00");
  return d.toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" });
}

/** Human-readable route: "Pickup → Airport" or "Airport → Drop-off" */
function routeLine(b: BookingRecord): string {
  return b.journey_type === "From Airport"
    ? `${b.airport ?? "Airport"} → ${b.dropoff_address ?? "your destination"}`
    : `${b.pickup_location ?? "your pickup"} → ${b.airport ?? "Airport"}`;
}

/** Short reference from first UUID segment e.g. "A1B2C3D4" */
function shortRef(id: string): string {
  return id.split("-")[0].toUpperCase();
}

// ── Main handler ─────────────────────────────────────────────────────────────
serve(async (req: Request) => {
  if (req.method !== "POST") {
    return new Response("Method Not Allowed", { status: 405 });
  }

  // 1 ── Parse the Supabase webhook payload ──────────────────────────────────
  let payload: WebhookPayload;
  try {
    payload = await req.json();
  } catch {
    console.error("[whatsapp-confirmation] Invalid JSON payload");
    return new Response("Bad Request", { status: 400 });
  }

  const booking    = payload.record;
  const oldBooking = payload.old_record;

  // 2 ── Only act when status transitions INTO 'confirmed' ───────────────────
  //      Guards against re-firing if something else on the row is updated later
  if (booking.status !== "confirmed") {
    console.log(`[whatsapp-confirmation] Skipped — status is '${booking.status}'`);
    return new Response(JSON.stringify({ skipped: true }), { status: 200 });
  }
  if (oldBooking?.status === "confirmed") {
    console.log("[whatsapp-confirmation] Skipped — was already confirmed");
    return new Response(JSON.stringify({ skipped: true }), { status: 200 });
  }

  // 3 ── Validate required fields ────────────────────────────────────────────
  if (!booking.customer_phone) {
    console.error("[whatsapp-confirmation] No customer_phone on booking", booking.id);
    return new Response("Missing phone", { status: 422 });
  }
  if (!TWILIO_ACCOUNT_SID || !TWILIO_AUTH_TOKEN || !TWILIO_WHATSAPP_FROM) {
    console.error("[whatsapp-confirmation] Twilio credentials not configured");
    return new Response("Server misconfiguration", { status: 500 });
  }

  // 4 ── Build message variables (data flows: DB row → variables → message) ──
  const firstName = booking.customer_name?.split(" ")[0] ?? "there";
  const route     = routeLine(booking);
  const date      = fmtDate(booking.travel_date);
  const time      = booking.travel_time ?? "TBC";
  const pax       = String(booking.passengers ?? 1);
  const ref       = shortRef(booking.id);
  const price     = booking.quoted_price ? `£${booking.quoted_price}` : null;
  const payMethod = booking.payment_method === "cash" ? "Cash on the day" : "Paid by card";

  const to   = toWhatsApp(booking.customer_phone);
  const from = TWILIO_WHATSAPP_FROM.startsWith("whatsapp:")
    ? TWILIO_WHATSAPP_FROM
    : `whatsapp:${TWILIO_WHATSAPP_FROM}`;

  // 5 ── Build the Twilio POST body ──────────────────────────────────────────
  //
  //  ── OPTION A: Pre-approved Meta utility template (production) ────────────
  //
  //  Once your template is approved in Twilio Content Editor, set
  //  TWILIO_TEMPLATE_SID and the variables below must match your template's
  //  placeholder order exactly:
  //    {{1}} customer first name
  //    {{2}} route (e.g. "Blackpool → Manchester Airport")
  //    {{3}} date  (e.g. "1 June 2026")
  //    {{4}} time  (e.g. "06:30")
  //    {{5}} passengers
  //    {{6}} booking reference
  //
  //  const params = new URLSearchParams({
  //    From:             from,
  //    To:               to,
  //    ContentSid:       TEMPLATE_SID,
  //    ContentVariables: JSON.stringify({
  //      "1": firstName,
  //      "2": route,
  //      "3": date,
  //      "4": time,
  //      "5": pax,
  //      "6": ref,
  //    }),
  //  });
  //
  //  ── OPTION B: Free-form message (sandbox / 24-hr session window) ─────────
  //  Used for Twilio sandbox testing. Switch to Option A for production sends.
  //
  const messageBody = [
    `Hi ${firstName} 👋`,
    "",
    "✅ *Your EV Exec transfer is confirmed!*",
    "",
    `🗺️ *Route:* ${route}`,
    `📅 *Date:* ${date} at ${time}`,
    `👥 *Passengers:* ${pax}`,
    price
      ? `💳 *Price:* ${price} — ${payMethod}`
      : `💳 *Payment:* ${payMethod}`,
    `🔖 *Reference:* ${ref}`,
    "",
    "We look forward to seeing you. Questions? Call or WhatsApp: 07721 070370",
    "",
    "_EV Exec — Premium Airport Transfers_",
  ].join("\n");

  const params = new URLSearchParams({ From: from, To: to, Body: messageBody });

  // 6 ── POST to Twilio Messages API ─────────────────────────────────────────
  const twilioUrl = `https://api.twilio.com/2010-04-01/Accounts/${TWILIO_ACCOUNT_SID}/Messages.json`;
  const authHeader = `Basic ${btoa(`${TWILIO_ACCOUNT_SID}:${TWILIO_AUTH_TOKEN}`)}`;

  try {
    const res  = await fetch(twilioUrl, {
      method:  "POST",
      headers: {
        "Authorization":  authHeader,
        "Content-Type":   "application/x-www-form-urlencoded",
      },
      body: params.toString(),
    });

    const data = await res.json();

    if (!res.ok) {
      console.error("[whatsapp-confirmation] Twilio error", res.status, JSON.stringify(data));
      return new Response(JSON.stringify({ error: data }), { status: 502 });
    }

    console.log(`[whatsapp-confirmation] ✓ SID=${data.sid} → ${to}`);
    return new Response(JSON.stringify({ success: true, sid: data.sid }), {
      status:  200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("[whatsapp-confirmation] Fetch exception:", err);
    return new Response(JSON.stringify({ error: String(err) }), { status: 500 });
  }
});
