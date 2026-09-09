import { chromium } from '@playwright/test';
import assert from 'node:assert/strict';
import { mkdirSync } from 'node:fs';

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
const base = process.env.AXIOM_SMOKE_URL ?? 'http://127.0.0.1:5173';
let conversationId;
try {
  await page.goto(base);
  const health = await page.request.get(`${base}/api/health`).then((response) => response.json());
  assert.equal(health.version, '0.1.0-alpha.2');
  await page.getByRole('button', { name: 'Выбрать модель' }).click();
  await page
    .getByRole('button', { name: /Axiom Mock.*Локальная/ })
    .first()
    .click();
  await page.getByRole('textbox', { name: 'Сообщение', exact: true }).fill('Alpha.2 dev smoke');
  const created = page.waitForResponse(
    (response) =>
      response.url().endsWith('/api/conversations') && response.request().method() === 'POST',
  );
  await page.getByRole('button', { name: 'Отправить сообщение' }).click();
  conversationId = (await (await created).json()).id;
  await page
    .getByTestId('message-assistant')
    .getByText(/локальная тестовая модель/)
    .waitFor();
  await page.getByRole('button', { name: 'Остановить генерацию' }).click();
  await page.getByText('Ответ остановлен', { exact: true }).waitFor();
  const result = await page.request
    .get(`${base}/api/conversations/${conversationId}`)
    .then((response) => response.json());
  assert.equal(result.messages[1].status, 'aborted');
  assert.ok(result.messages[1].parts[0].text.length > 0);
  mkdirSync('.axiom/verification', { recursive: true });
  await page.screenshot({ path: '.axiom/verification/alpha2-dev.png', animations: 'disabled' });
  console.log('Dev smoke passed: compiled packages, API version, Mock streaming and Stop.');
} finally {
  if (conversationId) {
    await page.request
      .post(`${base}/api/conversations/${conversationId}/stop`, {
        headers: { 'X-Axiom-Client': 'chat' },
      })
      .catch(() => undefined);
    await page.request
      .delete(`${base}/api/conversations/${conversationId}`, {
        headers: { 'X-Axiom-Client': 'chat' },
      })
      .catch(() => undefined);
  }
  await browser.close();
}
