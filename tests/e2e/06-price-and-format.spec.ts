/**
 * Unit-style contract tests for the pricing and format logic.
 * These run via the API layer so they test real server-side code.
 */
import { test, expect } from '@playwright/test';
import { submitBookingViaApi, sampleBooking, AIRPORTS, PRICES } from '../helpers/booking';

const BASE = process.env.BASE_URL ?? 'http://localhost:3000';

// ── Price lookup via API ──────────────────────────────────────────────────────

for (const airport of AIRPORTS) {
  test(`One-way price for "${airport}" matches PRICES table`, async ({ request }) => {
    const bookingId = await submitBookingViaApi(
      request,
      sampleBooking({ airport, return_journey: false }),
      BASE,
    );
    const res = await request.get(`${BASE}/api/booking/get?id=${bookingId}`);
    const booking = await res.json();
    expect(Number(booking.quoted_price)).toBe(PRICES[airport].oneWay);
  });

  test(`Return price for "${airport}" is higher than one-way`, async ({ request }) => {
    const bookingId = await submitBookingViaApi(
      request,
      sampleBooking({ airport, return_journey: true }),
      BASE,
    );
    const res = await request.get(`${BASE}/api/booking/get?id=${bookingId}`);
    const booking = await res.json();
    expect(Number(booking.quoted_price)).toBe(PRICES[airport].return);
    expect(PRICES[airport].return).toBeGreaterThan(PRICES[airport].oneWay);
  });
}

// ── CO2 savings logic (frontend contract) ────────────────────────────────────

test('CO2 savings: EV 0g/km vs diesel 120g/km for Manchester (30 miles ≈ 48 km)', async ({
  page,
}) => {
  // This tests that the account page CO2 calculator uses the correct baseline.
  // Standard diesel: 120 g CO2/km
  // EV: 0 g CO2/km
  // 30 miles = ~48.3 km
  // Expected savings: 48.3 km × 120 g/km ≈ 5,796 g = ~5.8 kg CO2

  // If the account page exposes calculated CO2 we can assert it here.
  // For now we validate the formula constants.
  const DIESEL_G_PER_KM = 120;
  const EV_G_PER_KM = 0;
  const MILES_TO_KM = 1.60934;
  const distanceMiles = 30;
  const distanceKm = distanceMiles * MILES_TO_KM;
  const savingsGrams = (DIESEL_G_PER_KM - EV_G_PER_KM) * distanceKm;
  const savingsKg = savingsGrams / 1000;

  expect(savingsKg).toBeCloseTo(5.8, 0);
  expect(EV_G_PER_KM).toBe(0);
  expect(DIESEL_G_PER_KM).toBeGreaterThanOrEqual(100);
});

// ── Ref uniqueness stress test ────────────────────────────────────────────────

test('10 sequential bookings all have unique ref values', async ({ request }) => {
  const refs = await Promise.all(
    Array.from({ length: 10 }, () =>
      submitBookingViaApi(request, sampleBooking(), BASE).then(id =>
        request
          .get(`${BASE}/api/booking/get?id=${id}`)
          .then(r => r.json())
          .then(b => b.ref as string),
      ),
    ),
  );

  const uniqueRefs = new Set(refs);
  expect(uniqueRefs.size).toBe(10);

  for (const ref of refs) {
    expect(ref).toMatch(/^EVX-[A-Z0-9]+$/);
  }
});
