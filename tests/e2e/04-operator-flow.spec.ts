/**
 * Operator accept / reject flow tests.
 * These exercise the token-gated operator action endpoints.
 */
import { test, expect } from '@playwright/test';
import { submitBookingViaApi, sampleBooking } from '../helpers/booking';
import * as crypto from 'crypto';

const BASE = process.env.BASE_URL ?? 'http://localhost:3000';

// We need to generate tokens the same way the server does.
// The actual token implementation in lib/token.js uses HMAC-SHA256.
// In CI, set HMAC_SECRET to match the server's secret.
function generateToken(id: string, action: string): string {
  const secret = process.env.HMAC_SECRET ?? 'dev-secret-change-in-prod';
  return crypto.createHmac('sha256', secret).update(`${id}:${action}`).digest('hex');
}

// ── Accept endpoint ───────────────────────────────────────────────────────────

test('operator/accept: rejects request with no id or token', async ({ request }) => {
  const res = await request.get(`${BASE}/api/operator/accept`);
  expect(res.status()).toBe(400);
  const text = await res.text();
  expect(text).toContain('missing');
});

test('operator/accept: rejects invalid UUID id', async ({ request }) => {
  const res = await request.get(
    `${BASE}/api/operator/accept?id=not-a-uuid&token=sometoken`,
  );
  expect(res.status()).toBe(400);
  const text = await res.text();
  expect(text).toContain('invalid');
});

test('operator/accept: rejects forged token with 403', async ({ request }) => {
  const bookingId = await submitBookingViaApi(request, sampleBooking(), BASE);
  const res = await request.get(
    `${BASE}/api/operator/accept?id=${bookingId}&token=forged-token-abcdef`,
  );
  expect(res.status()).toBe(403);
});

test('operator/accept: accepts valid token and sets status to Dispatched', async ({
  request,
}) => {
  const bookingId = await submitBookingViaApi(request, sampleBooking(), BASE);
  const token = generateToken(bookingId, 'accept');

  const res = await request.get(
    `${BASE}/api/operator/accept?id=${bookingId}&token=${token}`,
  );
  // Should render the success HTML page
  expect(res.status()).toBe(200);
  const html = await res.text();
  expect(html).toContain('Accepted');

  // Verify the booking status in DB
  const getRes = await request.get(`${BASE}/api/booking/get?id=${bookingId}`);
  const booking = await getRes.json();
  expect(booking.status).toBe('Dispatched');
});

test('operator/accept: second accept attempt shows "Already Actioned"', async ({
  request,
}) => {
  const bookingId = await submitBookingViaApi(request, sampleBooking(), BASE);
  const token = generateToken(bookingId, 'accept');
  const url = `${BASE}/api/operator/accept?id=${bookingId}&token=${token}`;

  await request.get(url); // first accept
  const res2 = await request.get(url); // second attempt
  expect(res2.status()).toBe(200);
  const html = await res2.text();
  expect(html).toContain('Already Actioned');
});

// ── Reject endpoint ───────────────────────────────────────────────────────────

test('operator/reject: rejects request with no parameters', async ({ request }) => {
  const res = await request.get(`${BASE}/api/operator/reject`);
  expect(res.status()).toBe(400);
});

test('operator/reject: rejects forged token with 403', async ({ request }) => {
  const bookingId = await submitBookingViaApi(request, sampleBooking(), BASE);
  const res = await request.get(
    `${BASE}/api/operator/reject?id=${bookingId}&token=forged`,
  );
  expect(res.status()).toBe(403);
});

test('operator/reject: valid token sets status to Cancelled', async ({ request }) => {
  const bookingId = await submitBookingViaApi(request, sampleBooking(), BASE);
  const token = generateToken(bookingId, 'reject');

  const res = await request.get(
    `${BASE}/api/operator/reject?id=${bookingId}&token=${token}`,
  );
  expect(res.status()).toBe(200);
  const html = await res.text();
  expect(html).toContain('Rejected');

  const getRes = await request.get(`${BASE}/api/booking/get?id=${bookingId}`);
  const booking = await getRes.json();
  expect(booking.status).toBe('Cancelled');
});

test('operator/reject: cannot reject an already-accepted booking', async ({ request }) => {
  const bookingId = await submitBookingViaApi(request, sampleBooking(), BASE);

  // Accept first
  const acceptToken = generateToken(bookingId, 'accept');
  await request.get(`${BASE}/api/operator/accept?id=${bookingId}&token=${acceptToken}`);

  // Now try to reject
  const rejectToken = generateToken(bookingId, 'reject');
  const res = await request.get(
    `${BASE}/api/operator/reject?id=${bookingId}&token=${rejectToken}`,
  );
  expect(res.status()).toBe(200);
  const html = await res.text();
  expect(html).toContain('Already Actioned');

  // Status must remain Dispatched, not Cancelled
  const getRes = await request.get(`${BASE}/api/booking/get?id=${bookingId}`);
  const booking = await getRes.json();
  expect(booking.status).toBe('Dispatched');
});

// ── Cross-contamination guard ─────────────────────────────────────────────────

test('Accept token cannot be reused for reject action', async ({ request }) => {
  const bookingId = await submitBookingViaApi(request, sampleBooking(), BASE);
  // Generate an accept token and try to use it for reject
  const acceptToken = generateToken(bookingId, 'accept');
  const res = await request.get(
    `${BASE}/api/operator/reject?id=${bookingId}&token=${acceptToken}`,
  );
  // Should be rejected as 403 — tokens are action-scoped
  expect(res.status()).toBe(403);
});
