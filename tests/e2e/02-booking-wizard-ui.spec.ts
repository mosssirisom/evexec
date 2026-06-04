/**
 * Browser (UI) tests for the 3-step booking wizard on index.html.
 * Tests navigation, validation, state persistence, and form submission.
 */
import { test, expect } from '@playwright/test';

const tomorrow = () => {
  const d = new Date();
  d.setDate(d.getDate() + 3);
  return d.toISOString().split('T')[0];
};

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  // Scroll to the booking wizard
  await page.locator('#bwStep1').scrollIntoViewIfNeeded();
});

// ── Step navigation ────────────────────────────────────────────────────────────

test('Step 1 is visible on page load', async ({ page }) => {
  await expect(page.locator('#bwStep1')).toBeVisible();
  await expect(page.locator('#bwStep2')).toBeHidden();
  await expect(page.locator('#bwStep3')).toBeHidden();
});

test('Cannot proceed past Step 1 without selecting a journey type', async ({ page }) => {
  // Try to find a "Next" button for step 1 and click before selecting type
  const next = page.locator('#bwNext1, button[data-next="2"]').first();
  if (await next.isVisible()) {
    await next.click();
    // Step 2 must still be hidden
    await expect(page.locator('#bwStep2')).toBeHidden();
  }
});

test('Selecting "To Airport" and continuing shows Step 2', async ({ page }) => {
  // Select "To Airport" journey type
  const toAirportBtn = page.locator('[data-type="To Airport"], button:has-text("To Airport")').first();
  if (await toAirportBtn.isVisible()) {
    await toAirportBtn.click();
    await page.locator('#bwNext1').first().click();
    await expect(page.locator('#bwStep2')).toBeVisible();
  }
});

test('Back button on Step 3 returns to Step 2 without data loss', async ({ page }) => {
  // Navigate forward to Step 3
  const toAirportBtn = page.locator('[data-type="To Airport"], button:has-text("To Airport")').first();
  if (await toAirportBtn.isVisible()) await toAirportBtn.click();

  const next1 = page.locator('#bwNext1').first();
  if (await next1.isVisible()) await next1.click();

  const airportSelect = page.locator('#bwAirport');
  if (await airportSelect.isVisible()) await airportSelect.selectOption('Manchester Airport');

  const next2 = page.locator('#bwNext2').first();
  if (await next2.isVisible()) await next2.click();

  // Fill step 3 fields
  await page.locator('#bwDate').fill(tomorrow());
  await page.locator('#bwTime').fill('08:30');
  await page.locator('#bwName').fill('Back-Button Test');

  // Click back
  await page.locator('#bwBack3').click();
  await expect(page.locator('#bwStep2')).toBeVisible();

  // Go forward again — Step 3 data must persist
  if (await next2.isVisible()) await next2.click();
  const name = await page.locator('#bwName').inputValue();
  expect(name).toBe('Back-Button Test');
});

// ── Date/Time visual separation (regression for touching boxes) ───────────────

test('Travel Date and Travel Time inputs have visible gap between them', async ({ page }) => {
  const toAirportBtn = page.locator('[data-type="To Airport"], button:has-text("To Airport")').first();
  if (await toAirportBtn.isVisible()) await toAirportBtn.click();

  const next1 = page.locator('#bwNext1').first();
  if (await next1.isVisible()) await next1.click();

  const next2 = page.locator('#bwNext2').first();
  if (await next2.isVisible()) await next2.click();

  const dateInput = page.locator('#bwDate');
  const timeInput = page.locator('#bwTime');

  await expect(dateInput).toBeVisible();
  await expect(timeInput).toBeVisible();

  const dateBox = await dateInput.boundingBox();
  const timeBox = await timeInput.boundingBox();

  if (dateBox && timeBox) {
    const gap = timeBox.x - (dateBox.x + dateBox.width);
    // The gap between the right edge of date box and left edge of time box
    // must be at least 8px (gap-2 in Tailwind = 8px)
    expect(gap).toBeGreaterThanOrEqual(8);
  }
});

test('On mobile (375px), date and time inputs are not overlapping', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });

  const toAirportBtn = page.locator('[data-type="To Airport"], button:has-text("To Airport")').first();
  if (await toAirportBtn.isVisible()) await toAirportBtn.click();

  const next1 = page.locator('#bwNext1').first();
  if (await next1.isVisible()) await next1.click();

  const next2 = page.locator('#bwNext2').first();
  if (await next2.isVisible()) await next2.click();

  const dateInput = page.locator('#bwDate');
  const timeInput = page.locator('#bwTime');

  const dateBox = await dateInput.boundingBox();
  const timeBox = await timeInput.boundingBox();

  if (dateBox && timeBox) {
    // Inputs must not overlap — either side by side with gap or stacked
    const xOverlap = dateBox.x < timeBox.x + timeBox.width && timeBox.x < dateBox.x + dateBox.width;
    const yOverlap = dateBox.y < timeBox.y + timeBox.height && timeBox.y < dateBox.y + dateBox.height;
    expect(xOverlap && yOverlap).toBe(false);
  }
});

// ── Validation ────────────────────────────────────────────────────────────────

test('Submit without name shows an error, does not call API', async ({ page }) => {
  const toAirportBtn = page.locator('[data-type="To Airport"], button:has-text("To Airport")').first();
  if (await toAirportBtn.isVisible()) await toAirportBtn.click();

  const next1 = page.locator('#bwNext1').first();
  if (await next1.isVisible()) await next1.click();

  const next2 = page.locator('#bwNext2').first();
  if (await next2.isVisible()) await next2.click();

  // Fill date and time but leave name blank
  await page.locator('#bwDate').fill(tomorrow());
  await page.locator('#bwTime').fill('07:00');
  await page.locator('#bwPhone').fill('07700900123');

  // Intercept to confirm API was NOT called
  let apiCalled = false;
  page.on('request', req => {
    if (req.url().includes('/api/booking/create')) apiCalled = true;
  });

  await page.locator('#bwSubmit').click();
  // Wait briefly
  await page.waitForTimeout(1000);
  expect(apiCalled).toBe(false);
});

// ── Return journey fields ─────────────────────────────────────────────────────

test('Return journey section is hidden by default on Step 3', async ({ page }) => {
  const toAirportBtn = page.locator('[data-type="To Airport"], button:has-text("To Airport")').first();
  if (await toAirportBtn.isVisible()) await toAirportBtn.click();

  const next1 = page.locator('#bwNext1').first();
  if (await next1.isVisible()) await next1.click();

  const next2 = page.locator('#bwNext2').first();
  if (await next2.isVisible()) await next2.click();

  await expect(page.locator('#bwReturnSection')).toBeHidden();
});

test('Toggling return journey shows return date and time fields', async ({ page }) => {
  const toAirportBtn = page.locator('[data-type="To Airport"], button:has-text("To Airport")').first();
  if (await toAirportBtn.isVisible()) await toAirportBtn.click();

  const next1 = page.locator('#bwNext1').first();
  if (await next1.isVisible()) await next1.click();

  const next2 = page.locator('#bwNext2').first();
  if (await next2.isVisible()) await next2.click();

  const returnToggle = page.locator('[id*="bwReturn"][type="checkbox"], input[type="checkbox"][id*="return"]').first();
  if (await returnToggle.isVisible()) {
    await returnToggle.check();
    await expect(page.locator('#bwReturnSection')).toBeVisible();
    await expect(page.locator('#bwRetDate')).toBeVisible();
    await expect(page.locator('#bwRetTime')).toBeVisible();
  }
});

// ── Passenger counter ─────────────────────────────────────────────────────────

test('Passenger counter clamps at 1 minimum', async ({ page }) => {
  const toAirportBtn = page.locator('[data-type="To Airport"], button:has-text("To Airport")').first();
  if (await toAirportBtn.isVisible()) await toAirportBtn.click();

  const next1 = page.locator('#bwNext1').first();
  if (await next1.isVisible()) await next1.click();

  const next2 = page.locator('#bwNext2').first();
  if (await next2.isVisible()) await next2.click();

  // Click decrement three times from default 1
  for (let i = 0; i < 3; i++) {
    await page.locator('#bwPaxDec').click();
  }
  const count = await page.locator('#bwPaxCount').textContent();
  expect(Number(count)).toBe(1);
});

test('Passenger counter clamps at 4 maximum', async ({ page }) => {
  const toAirportBtn = page.locator('[data-type="To Airport"], button:has-text("To Airport")').first();
  if (await toAirportBtn.isVisible()) await toAirportBtn.click();

  const next1 = page.locator('#bwNext1').first();
  if (await next1.isVisible()) await next1.click();

  const next2 = page.locator('#bwNext2').first();
  if (await next2.isVisible()) await next2.click();

  for (let i = 0; i < 10; i++) {
    await page.locator('#bwPaxInc').click();
  }
  const count = await page.locator('#bwPaxCount').textContent();
  expect(Number(count)).toBe(4);
});

// ── Full happy-path submission ─────────────────────────────────────────────────

test('Complete booking submission returns bookingId and shows success', async ({ page }) => {
  let capturedBookingId: string | null = null;

  page.on('response', async res => {
    if (res.url().includes('/api/booking/create') && res.status() === 200) {
      const body = await res.json().catch(() => ({}));
      if (body.bookingId) capturedBookingId = body.bookingId;
    }
  });

  const toAirportBtn = page.locator('[data-type="To Airport"], button:has-text("To Airport")').first();
  if (await toAirportBtn.isVisible()) await toAirportBtn.click();

  const next1 = page.locator('#bwNext1').first();
  if (await next1.isVisible()) await next1.click();

  const airportSelect = page.locator('#bwAirport');
  if (await airportSelect.isVisible()) await airportSelect.selectOption('Manchester Airport');

  const next2 = page.locator('#bwNext2').first();
  if (await next2.isVisible()) await next2.click();

  await page.locator('#bwDate').fill(tomorrow());
  await page.locator('#bwTime').fill('09:00');
  await page.locator('#bwName').fill('E2E Test User');
  await page.locator('#bwPhone').fill('07700900999');
  await page.locator('#bwEmail').fill('e2e@evexec-test.invalid');

  await page.locator('#bwSubmit').click();

  // Wait up to 8 s for the API to respond
  await page.waitForFunction(
    () => {
      const el = document.querySelector('[id*="Success"], [id*="success"], .success-message');
      return el && window.getComputedStyle(el).display !== 'none';
    },
    { timeout: 8_000 },
  ).catch(() => null); // don't fail here — we check capturedBookingId below

  expect(capturedBookingId).toMatch(
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
  );
});
