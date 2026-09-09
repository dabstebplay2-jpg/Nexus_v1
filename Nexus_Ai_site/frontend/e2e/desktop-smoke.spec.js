import { test, expect } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  await page.route('**/api/**', async (route) => {
    const url = new URL(route.request().url());
    if (url.pathname.endsWith('/auth/config')) {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          google_oauth_enabled: false,
          telegram_auth_enabled: false,
          email_auth_enabled: true,
        }),
      });
      return;
    }
    await route.fulfill({
      status: 503,
      contentType: 'application/json',
      body: JSON.stringify({ detail: 'API unavailable in UI smoke test' }),
    });
  });
});

test('desktop shell has no horizontal overflow', async ({ page }, testInfo) => {
  await page.goto('/');
  await expect(page.locator('h1.nx-wordmark')).toBeVisible();
  await expect(page.locator('main')).toBeVisible();
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth > window.innerWidth + 2
  );
  expect(overflow).toBe(false);
  await page.screenshot({ path: testInfo.outputPath('home.png'), fullPage: true });
});

test('settings traps focus and closes with Escape', async ({ page }) => {
  await page.goto('/?settings=general');
  const dialog = page.getByRole('dialog');
  await expect(dialog).toBeVisible();
  await expect
    .poll(() => page.evaluate(() => document.querySelector('[role="dialog"]')?.contains(document.activeElement)))
    .toBe(true);
  await page.keyboard.press('Escape');
  await expect(dialog).toBeHidden();
});
