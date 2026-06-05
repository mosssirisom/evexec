/**
 * API-level tests for /api/booking/create
 * These run entirely via HTTP — no browser required.
 * They validate request validation, DB writes, and response shape.
 */
import { test, expect } from '@playwright/test';
import { sampleBooking, submitBookingViaApi, AIRPORTS, PRICES } from '../helpers/booking';

const BASE = process.env.BASE_URL ?? 'http://localhost:3000';
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const REF_RE  = /^EVX-[A-Z0-9]+$/;

// ── Happy path ────────────────────────────────────────────────────────────────

test('POST /api/booking/create returns 200 with bookingId UUID', async ({ request }) => {
  const res = await request.post(`${BASE}/api/booking/create`, {
    data: sampleBooking(),
    headers: { 'Content-Type': 'application/json' },
  });

  expect(res.status()).toBe(200);
  const body = await res.json();
  expect(body.success).toBe(true);
  expect(body.bookingId).toMatch(UUID_RE);
});

test('Booking is written to Supabase with status Unassigned', async ({ request }) => {
  const bookingId = await submitBookingViaApi(request, sampleBooking(), BASE);

  // Fetch the booking back via the public get endpoint
  const get = await request.get(`${BASE}/api/booking/get?id=${bookingId}`);
  expect(get.status()).toBe(200);

  const booking = await get.json();
  expect(booking.id).toBe(bookingId);
  expect(booking.status).toBe('Unassigned');
  expect(booking.ref).toMatch(REF_RE);
  expect(booking.customer_name).toBe('QA Test Customer');
});

test('Booking ref matches pattern EVX-[A-Z0-9]+', async ({ request }) => {
  const bookingId = await submitBookingViaApi(request, sampleBooking(), BASE);
  const get = await request.get(`${BASE}/api/booking/get?id=${bookingId}`);
  const booking = await get.json();
  expect(booking.ref).toMatch(REF_RE);
});

test('Price stored matches PRICES lookup for Manchester one-way', async ({ request }) => {
  const bookingId = await submitBookingViaApi(
    request,
    sampleBooking({ airport: 'Manchester Airport', return_journey: false }),
    BASE,
  );
  const get = await request.get(`${BASE}/api/booking/get?id=${bookingId}`);
  const booking = await get.json();
  expect(Number(booking.quoted_price)).toBe(PRICES['Manchester Airport'].oneWay); // £90
});

test('Return journey price stored correctly', async ({ request }) => {
  const bookingId = await submitBookingViaApi(
    request,
    sampleBooking({ airport: 'Manchester Airport', return_journey: true }),
    BASE,
  );
  const get = await request.get(`${BASE}/api/booking/get?id=${bookingId}`);
  const booking = await get.json();
  expect(Number(booking.quoted_price)).toBe(PRICES['Manchester Airport'].return); // £160
});

// ── Validation errors ─────────────────────────────────────────────────────────

test('POST /api/booking/create rejects missing name with 400', async ({ request }) => {
  const res = await request.post(`${BASE}/api/booking/create`, {
    data: { ...sampleBooking(), customer_name: '' },
    headers: { 'Content-Type': 'application/json' },
  });
  expect(res.status()).toBe(400);
  const body = await res.json();
  expect(body.error).toBeTruthy();
});

test('POST /api/booking/create rejects missing phone with 400', async ({ request }) => {
  const res = await request.post(`${BASE}/api/booking/create`, {
    data: { ...sampleBooking(), customer_phone: '' },
    headers: { 'Content-Type': 'application/json' },
  });
  expect(res.status()).toBe(400);
});

test('POST /api/booking/create rejects GET method with 405', async ({ request }) => {
  const res = await request.get(`${BASE}/api/booking/create`);
  expect(res.status()).toBe(405);
});

test('GET /api/booking/get rejects invalid UUID with 400', async ({ request }) => {
  const res = await request.get(`${BASE}/api/booking/get?id=not-a-uuid`);
  expect(res.status()).toBe(400);
});

test('GET /api/booking/get returns 404 for unknown UUID', async ({ request }) => {
  const res = await request.get(
    `${BASE}/api/booking/get?id=00000000-0000-0000-0000-000000000000`,
  );
  expect(res.status()).toBe(404);
});

// ── Edge cases ────────────────────────────────────────────────────────────────

test('Booking with no email address still succeeds', async ({ request }) => {
  const res = await request.post(`${BASE}/api/booking/create`, {
    data: { ...sampleBooking(), customer_email: '' },
    headers: { 'Content-Type': 'application/json' },
  });
  expect(res.status()).toBe(200);
});

test('Booking with unrecognised airport stores null quoted_price', async ({ request }) => {
  const bookingId = await submitBookingViaApi(
    request,
    sampleBooking({ airport: 'Heathrow Airport' }),
    BASE,
  );
  const get = await request.get(`${BASE}/api/booking/get?id=${bookingId}`);
  const booking = await get.json();
  // Heathrow is not in the price table — quoted_price should be null
  expect(booking.quoted_price).toBeNull();
});

test('Booking for max 4 passengers stores correctly', async ({ request }) => {
  const bookingId = await submitBookingViaApi(
    request,
    sampleBooking({ passengers: 4 }),
    BASE,
  );
  const get = await request.get(`${BASE}/api/booking/get?id=${bookingId}`);
  const booking = await get.json();
  expect(booking.passengers).toBe(4);
});

test('Two rapid bookings generate distinct ref values', async ({ request }) => {
  const [id1, id2] = await Promise.all([
    submitBookingViaApi(request, sampleBooking(), BASE),
    submitBookingViaApi(request, sampleBooking(), BASE),
  ]);
  const [b1, b2] = await Promise.all([
    request.get(`${BASE}/api/booking/get?id=${id1}`).then(r => r.json()),
    request.get(`${BASE}/api/booking/get?id=${id2}`).then(r => r.json()),
  ]);
  expect(b1.ref).not.toBe(b2.ref);
});
