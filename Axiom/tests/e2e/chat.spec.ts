import { test, expect } from '@playwright/test';
test('Mock chat: send, Markdown, copy, persistence, edit, regenerate, stop, rename, delete', async ({
  page,
  context,
}) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'С чего начнём?' })).toBeVisible();
  await expect(page.locator('.welcome')).toHaveCSS('opacity', '1');
  await page.evaluate(() => document.fonts.ready);
  await page.screenshot({
    path: 'test-results/desktop-empty.png',
    fullPage: true,
    animations: 'disabled',
  });
  await page.getByRole('button', { name: 'Выбрать модель' }).click();
  await expect(page.getByRole('region', { name: 'Модели' })).toBeVisible();
  await page.getByRole('button', { name: 'В избранное: Axiom Mock', exact: true }).click();
  await expect(page.getByText('Избранные', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Закрыть выбор модели' }).click();
  await page.getByRole('textbox', { name: 'Сообщение', exact: true }).fill('Первый тест Axiom');
  await page.getByRole('button', { name: 'Отправить сообщение' }).click();
  await expect(page.getByRole('button', { name: 'Остановить генерацию' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Отправить сообщение' })).toBeVisible({
    timeout: 20_000,
  });
  await expect(page.getByTestId('message-assistant')).toContainText('Axiom Mock');
  await expect(page.locator('pre code')).toContainText('console.log');
  await page.getByRole('button', { name: 'Копировать код' }).click();
  await expect(page.getByRole('button', { name: 'Скопировано', exact: true })).toBeVisible();
  expect(await page.evaluate(() => navigator.clipboard.readText())).toContain('console.log');
  await page.screenshot({ path: 'test-results/desktop-chat.png', fullPage: true });
  await page.reload();
  await page.getByRole('button', { name: 'Первый тест Axiom', exact: true }).first().click();
  await expect(page.getByTestId('message-assistant')).toContainText('console.log');
  await page.getByRole('button', { name: 'Редактировать сообщение', exact: true }).click();
  await page.getByRole('textbox', { name: 'Сообщение', exact: true }).fill('Исправленный вопрос');
  await page.getByRole('button', { name: 'Отправить сообщение' }).click();
  await expect(page.getByTestId('message-user')).toContainText('Исправленный вопрос');
  await page.getByRole('button', { name: 'Остановить генерацию' }).click();
  await expect(page.getByText('Ответ остановлен', { exact: true })).toBeVisible();
  await expect(page.getByTestId('message-user')).toHaveCount(1);
  await page.getByRole('button', { name: 'Повторить ответ', exact: true }).click();
  await page.getByRole('button', { name: 'Остановить генерацию' }).click();
  await expect(page.getByText('Ответ остановлен', { exact: true })).toBeVisible();
  await expect(page.getByTestId('message-assistant')).toHaveCount(1);
  page.once('dialog', (dialog) => dialog.accept('Проверенный диалог'));
  await page.getByRole('button', { name: 'Первый тест Axiom', exact: true }).hover();
  await page.getByRole('button', { name: 'Переименовать Первый тест Axiom' }).click();
  await expect(page.getByRole('button', { name: 'Проверенный диалог', exact: true })).toBeVisible();
  page.once('dialog', (dialog) => dialog.accept());
  await page.getByRole('button', { name: 'Проверенный диалог', exact: true }).hover();
  await page.getByRole('button', { name: 'Удалить диалог Проверенный диалог' }).click();
  await expect(page.getByRole('heading', { name: 'С чего начнём?' })).toBeVisible();
  expect(errors).toEqual([]);
});
test('Settings, unavailable provider, manual model and mobile layout', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: /Настройки/ }).click();
  await page.getByRole('button', { name: /Своё подключение/ }).click();
  await page.getByLabel('Название', { exact: true }).fill('Offline test');
  await page.getByLabel('Base URL').fill('http://127.0.0.1:1/v1');
  await page.getByLabel(/Модели — ID/).fill('manual-model');
  await page.getByRole('button', { name: 'Сохранить и проверить' }).click();
  await expect(page.getByRole('alert')).toContainText('недоступен');
  await expect(page.getByRole('heading', { name: 'Offline test' })).toBeVisible();
  await page.getByRole('button', { name: 'Вернуться в чат' }).click();
  await page.getByRole('button', { name: 'Выбрать модель' }).click();
  await page
    .getByRole('button', { name: /manual-model/ })
    .first()
    .click();
  await page.getByRole('textbox', { name: 'Сообщение', exact: true }).fill('Test unavailable');
  await page.getByRole('button', { name: 'Отправить сообщение' }).click();
  await expect(page.getByRole('alert')).toContainText('недоступен');
  await page.setViewportSize({ width: 390, height: 844 });
  await page.reload();
  await expect(page.getByRole('button', { name: 'Открыть боковую панель' })).toBeVisible();
  await expect(page.locator('.welcome')).toHaveCSS('opacity', '1');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  );
  await page.screenshot({
    path: 'test-results/mobile.png',
    fullPage: true,
    animations: 'disabled',
  });
});

test('Text attachments are submitted and restored with the conversation', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Выбрать модель' }).click();
  await page
    .getByRole('button', { name: /Axiom Mock.*Локальная/ })
    .first()
    .click();
  await page.locator('input[type=file]').setInputFiles({
    name: 'notes.md',
    mimeType: 'text/markdown',
    buffer: Buffer.from('# Project notes\nAxiom attachments test', 'utf8'),
  });
  await expect(page.locator('.composer-files')).toContainText('notes.md');
  await page.getByRole('textbox', { name: 'Сообщение', exact: true }).fill('Проверь файл');
  await page.getByRole('button', { name: 'Отправить сообщение' }).click();
  await expect(page.getByTestId('message-assistant')).toContainText('Получено текстовых файлов');
  await page.getByRole('button', { name: 'Остановить генерацию' }).click();
  await expect(page.getByText('Ответ остановлен', { exact: true })).toBeVisible();
  await page.reload();
  await page.getByRole('button', { name: 'Проверь файл', exact: true }).click();
  await expect(page.getByTestId('message-user')).toContainText('notes.md');
});

test('Stop during slow conversation creation preserves the unsent draft', async ({ page }) => {
  let release: () => void = () => {};
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route('**/api/conversations', async (route) => {
    if (route.request().method() === 'POST') await gate;
    await route.continue();
  });
  await page.goto('/');
  await expect(page.getByRole('button', { name: 'Выбрать модель' })).toContainText('Axiom Mock');
  await page.getByRole('textbox', { name: 'Сообщение', exact: true }).fill('Сохранить черновик');
  await page.getByRole('button', { name: 'Отправить сообщение' }).click();
  await page.getByRole('button', { name: 'Остановить генерацию' }).click();
  release();
  await expect(page.getByRole('button', { name: 'Отправить сообщение' })).toBeVisible();
  await expect(page.getByRole('textbox', { name: 'Сообщение', exact: true })).toHaveValue(
    'Сохранить черновик',
  );
  await expect(page.getByTestId('message-user')).toHaveCount(0);
});

test('Mock continuation preserves stopped partial output and creates another turn', async ({
  page,
}) => {
  await page.goto('/');
  await expect(page.getByRole('button', { name: 'Выбрать модель' })).toContainText('Axiom Mock');
  await page
    .getByRole('textbox', { name: 'Сообщение', exact: true })
    .fill('Напиши длинное объяснение');
  await page.getByRole('button', { name: 'Отправить сообщение' }).click();
  await expect(page.getByTestId('message-assistant')).toContainText('локальная тестовая модель');
  await page.getByRole('button', { name: 'Остановить генерацию' }).click();
  await expect(page.getByText('Ответ остановлен', { exact: true })).toBeVisible();
  const partial = await page.getByTestId('message-assistant').locator('.markdown').innerText();
  await page
    .getByRole('textbox', { name: 'Сообщение', exact: true })
    .fill('Продолжи с того места, где остановился');
  await page.getByRole('button', { name: 'Отправить сообщение' }).click();
  await expect(page.getByTestId('message-assistant').last()).toContainText('В контексте сейчас 2');
  await page.getByRole('button', { name: 'Остановить генерацию' }).click();
  await expect(page.getByRole('button', { name: 'Отправить сообщение' })).toBeVisible();
  await expect(page.getByTestId('message-user')).toHaveCount(2);
  await expect(page.getByTestId('message-assistant')).toHaveCount(2);
  expect(await page.getByTestId('message-assistant').first().locator('.markdown').innerText()).toBe(
    partial,
  );
});

test('Rapid favorite toggles serialize browser writes and persist the final state', async ({
  page,
}) => {
  await page.request.put('/api/settings', {
    headers: { 'X-Axiom-Client': 'chat' },
    data: { favoriteModels: [], selectedModel: JSON.stringify(['axiom-mock', 'axiom-mock']) },
  });
  let release!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  let puts = 0;
  await page.route('**/api/settings', async (route) => {
    if (route.request().method() === 'PUT') {
      puts++;
      if (puts === 1) await gate;
    }
    await route.continue();
  });
  await page.goto('/');
  await page.getByRole('button', { name: 'Выбрать модель' }).click();
  await page.getByRole('button', { name: 'В избранное: Axiom Mock', exact: true }).click();
  await page
    .getByRole('button', { name: 'Убрать из избранного: Axiom Mock', exact: true })
    .first()
    .click();
  expect(puts).toBe(1);
  release();
  await expect.poll(() => puts).toBe(2);
  await expect
    .poll(async () => (await (await page.request.get('/api/settings')).json()).favoriteModels)
    .toEqual([]);
  await page.reload();
  await page.getByRole('button', { name: 'Выбрать модель' }).click();
  await expect(
    page.getByRole('button', { name: 'В избранное: Axiom Mock', exact: true }),
  ).toBeVisible();
});
