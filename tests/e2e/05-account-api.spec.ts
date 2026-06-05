/**
 * Customer account portal API tests.
 * Tests authentication guard, journey history, and edge cases.
 */
import { test, expect } from '@playwright/test';

const BASE = process.env.BASE_URL ?? 'http://localhost:3000';

// ── Authentication guard ──────────────────────────────────────────────────────

test('GET /api/account/journeys: returns 401 without auth header', async ({ request }) => {
  const res = await request.get(`${BASE}/api/account/journeys`);
  expect(res.status()).toBe(401);
  const body = await res.json();
  expect(body.error).toBeTruthy();
});

test('GET /api/account/journeys: returns 401 with malformed Bearer token', async ({
  request,
}) => {
  const res = await request.get(`${BASE}/api/account/journeys`, {
    headers: { Authorization: 'Bearer this-is-not-a-jwt' },
  });
  expect(res.status()).toBe(401);
});

test('GET /api/account/journeys: returns 401 with no Bearer prefix', async ({
  request,
}) => {
  const res = await request.get(`${BASE}/api/account/journeys`, {
    headers: { Authorization: 'Basic dXNlcjpwYXNz' },
  });
  expect(res.status()).toBe(401);
});

test('GET /api/account/journeys: rejects GET method — only GET is allowed', async ({
  request,
}) => {
  const res = await request.post(`${BASE}/api/account/journeys`, {
    data: {},
  });
  expect(res.status()).toBe(405);
});

// ── Profile endpoint ──────────────────────────────────────────────────────────

test('GET /api/account/profile: returns 401 without auth', async ({ request }) => {
  const res = await request.get(`${BASE}/api/account/profile`);
  expect(res.status()).toBe(401);
});

// ── Config endpoint ───────────────────────────────────────────────────────────

test('GET /api/config: returns supabaseUrl and supabaseAnon', async ({ request }) => {
  const res = await request.get(`${BASE}/api/config`);
  expect(res.status()).toBe(200);
  const body = await res.json();
  expect(body.supabaseUrl).toBeTruthy();
  expect(body.supabaseAnon).toBeTruthy();
  expect(body.supabaseUrl).toMatch(/^https:\/\//);
});

test('GET /api/config: never exposes service role key', async ({ request }) => {
  const res = await request.get(`${BASE}/api/config`);
  const body = await res.json();
  // The service role key must never appear in the public config response
  expect(JSON.stringify(body)).not.toContain('service_role');
  expect(JSON.stringify(body)).not.toContain('SUPABASE_SERVICE');
});

// ── Health endpoint ───────────────────────────────────────────────────────────

test('GET /api/health: returns 200', async ({ request }) => {
  const res = await request.get(`${BASE}/api/health`);
  expect(res.status()).toBe(200);
});
