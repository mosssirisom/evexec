/**
 * Shared helpers used across the EV Exec test suite.
 */
import type { Page, APIRequestContext } from '@playwright/test';

export const AIRPORTS = [
  'Manchester Airport',
  'Liverpool Airport',
  'Leeds Bradford Airport',
  'Birmingham Airport',
  'Newcastle Airport',
] as const;

export const PRICES: Record<string, { oneWay: number; return: number }> = {
  'Manchester Airport':     { oneWay: 90,  return: 160 },
  'Liverpool Airport':      { oneWay: 95,  return: 170 },
  'Leeds Bradford Airport': { oneWay: 135, return: 250 },
  'Birmingham Airport':     { oneWay: 215, return: 410 },
  'Newcastle Airport':      { oneWay: 250, return: 480 },
};

export interface BookingPayload {
  journey_type: string;
  pickup_location: string;
  airport: string;
  travel_date: string;
  travel_time: string;
  passengers: number;
  customer_name: string;
  customer_phone: string;
  customer_email: string;
  contact_method: string;
  return_journey?: boolean;
}

/** Minimal valid booking payload for API-level tests. */
export function sampleBooking(overrides: Partial<BookingPayload> = {}): BookingPayload {
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 3);
  const travelDate = tomorrow.toISOString().split('T')[0];

  return {
    journey_type: 'To Airport',
    pickup_location: '42 Test Street, Blackpool, FY1 1AA',
    airport: 'Manchester Airport',
    travel_date: travelDate,
    travel_time: '06:00',
    passengers: 2,
    customer_name: 'QA Test Customer',
    customer_phone: '07700900123',
    customer_email: 'qa@evexec-test.invalid',
    contact_method: 'WhatsApp',
    ...overrides,
  };
}

/** Submit a booking directly via the API. Returns the bookingId. */
export async function submitBookingViaApi(
  request: APIRequestContext,
  payload: BookingPayload = sampleBooking(),
  baseURL = 'http://localhost:3000',
): Promise<string> {
  const res = await request.post(`${baseURL}/api/booking/create`, {
    data: payload,
    headers: { 'Content-Type': 'application/json' },
  });

  if (!res.ok()) {
    const body = await res.text();
    throw new Error(`Booking API failed ${res.status()}: ${body}`);
  }

  const json = await res.json();
  if (!json.bookingId) throw new Error('No bookingId in response: ' + JSON.stringify(json));
  return json.bookingId;
}

/** Fill and submit the 3-step booking wizard on index.html. */
export async function fillAndSubmitBookingWizard(
  page: Page,
  opts: {
    journeyType?: 'To Airport' | 'From Airport';
    airport?: string;
    pickupAddress?: string;
    travelDate?: string;
    travelTime?: string;
    name?: string;
    phone?: string;
    email?: string;
  } = {},
): Promise<void> {
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 3);
  const date = opts.travelDate ?? tomorrow.toISOString().split('T')[0];

  // --- Step 1: Journey type ---
  const type = opts.journeyType ?? 'To Airport';
  await page.locator(`[data-type="${type}"], button:has-text("${type}")`).first().click();
  await page.locator('#bwNext1, button:has-text("Next")').first().click();

  // --- Step 2: Airport ---
  const airport = opts.airport ?? 'Manchester Airport';
  await page.locator('#bwAirport, select[id*="Airport"], select[id*="airport"]').first().selectOption(airport);
  await page.locator('#bwNext2, button:has-text("Next")').first().click();

  // --- Step 3: Date / Time / Details ---
  await page.locator('#bwDate').fill(date);
  await page.locator('#bwTime').fill(opts.travelTime ?? '07:30');

  if (opts.pickupAddress) {
    await page.locator('#bwAddress').fill(opts.pickupAddress);
  }

  await page.locator('#bwName').fill(opts.name ?? 'QA Test Customer');
  await page.locator('#bwPhone').fill(opts.phone ?? '07700900123');
  if (opts.email) {
    await page.locator('#bwEmail').fill(opts.email);
  }

  await page.locator('#bwSubmit').click();
}

/** Wait for the booking confirmation toast/modal that contains a bookingId. */
export async function waitForBookingConfirmation(page: Page): Promise<string | null> {
  // Wait for either a success message or a redirect to booking.html
  await page.waitForFunction(
    () =>
      document.querySelector('[id*="bwSuccess"], [class*="success"]') !== null ||
      window.location.href.includes('/booking?id='),
    { timeout: 10_000 },
  );

  const url = page.url();
  const match = url.match(/[?&]id=([0-9a-f-]{36})/i);
  return match?.[1] ?? null;
}
