import { test, expect } from '@playwright/test';

test.describe('mobile viewport smoke', () => {
  test.beforeEach(async ({ page }) => {
    // UI smoke tests should stay deterministic when the cloud API is not
    // running on a developer machine or CI worker.
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

  test('home loads without horizontal overflow', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('body')).toBeVisible();
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 2);
    expect(overflow).toBe(false);
    const hero = page.locator('h1.nx-wordmark');
    await expect(hero).toBeVisible();
    const heroBox = await hero.boundingBox();
    const viewport = page.viewportSize();
    expect(heroBox).not.toBeNull();
    expect(heroBox.width).toBeLessThanOrEqual(viewport.width);

    const scrollable = await page.evaluate(() => {
      const host = document.querySelector('.nx-page-host');
      const region = document.querySelector('.nx-scroll-region');
      const el = region || host;
      if (!el) return { ok: false, reason: 'no-scroll-container' };
      const canScroll = el.scrollHeight > el.clientHeight + 8;
      const before = el.scrollTop;
      el.scrollTop = before + 48;
      const moved = el.scrollTop > before;
      el.scrollTop = before;
      return { ok: canScroll ? moved : true, canScroll, moved };
    });
    expect(scrollable.ok).toBe(true);
  });

  test('pricing loads', async ({ page }) => {
    await page.goto('/pricing');
    await expect(page.getByRole('heading', { name: /выберите свой план/i })).toBeVisible();
  });

  test('settings modal is full-screen on narrow viewport', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/?settings=search');
    await expect(page.locator('.settings-dialog')).toBeVisible();
    const dialogBox = await page.locator('.settings-dialog').boundingBox();
    const viewport = page.viewportSize();
    expect(dialogBox.width).toBeGreaterThanOrEqual(viewport.width - 4);
  });

  test('spaces route loads on mobile viewport', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/spaces');
    await expect(page.locator('body')).toBeVisible();
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 2);
    expect(overflow).toBe(false);
  });

  test('ide lite loads and mobile dock visible', async ({ page }) => {
    await page.addInitScript(() => {
      localStorage.setItem('nexus_ide_lite_tour_done', '1');
    });
    await page.goto('/ide/lite');
    await expect(page.locator('.ide-mobile-dock')).toBeVisible();
    await page.locator('.ide-mobile-dock').getByRole('button', { name: 'Agent' }).click();
    await expect(page.locator('.ide-side-panel')).toBeVisible();
  });
});
