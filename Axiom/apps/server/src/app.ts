import express, { type ErrorRequestHandler } from 'express';
import { randomUUID } from 'node:crypto';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { z } from 'zod';
import { ChatCore, ProviderRegistry } from '@axiom/core';
import {
  AxiomError,
  AXIOM_VERSION,
  friendlyError,
  type ChatRepository,
  type ConfigurationRepository,
  type ProviderConfiguration,
  type SecretStorage,
} from '@axiom/shared';
import { mockConfiguration, MockProvider, OpenAICompatibleProvider } from '@axiom/providers';
import { generationSchema, providerSchema, settingsSchema } from './validation';
export function createApp(
  storage: ChatRepository & ConfigurationRepository,
  secrets: SecretStorage,
  staticDirectory?: string,
) {
  const app = express();
  const core = new ChatCore(storage);
  const registry = new ProviderRegistry();
  registry.register('mock', () => new MockProvider());
  registry.register(
    'openai-compatible',
    (config, vault) => new OpenAICompatibleProvider(config, vault),
  );
  const configurations = () => [mockConfiguration, ...storage.listProviders()];
  const configById = (id: string) => {
    const config = configurations().find((p) => p.id === id);
    if (!config) throw new AxiomError('Провайдер не подключён.', 404);
    return config;
  };
  app.disable('x-powered-by');
  app.use('/api', (req, res, next) => {
    const host = req.hostname;
    if (!['localhost', '127.0.0.1', '[::1]'].includes(host))
      return res.status(403).json({ error: 'Доступ разрешён только с этого компьютера.' });
    const origin = req.get('origin');
    if (
      origin &&
      origin !== `http://${req.get('host')}` &&
      !['http://127.0.0.1:5173', 'http://localhost:5173'].includes(origin)
    )
      return res.status(403).json({ error: 'Источник запроса запрещён.' });
    if (!['GET', 'HEAD'].includes(req.method) && req.get('x-axiom-client') !== 'chat')
      return res.status(403).json({ error: 'Отсутствует заголовок клиента Axiom.' });
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    next();
  });
  app.use(express.json({ limit: '12mb' }));
  app.get('/api/health', (_req, res) => res.json({ status: 'ok', version: AXIOM_VERSION }));
  app.get('/api/conversations', (_req, res) => res.json(storage.listConversations()));
  app.post('/api/conversations', (_req, res) => {
    const now = new Date().toISOString();
    const conversation = {
      id: randomUUID(),
      title: 'Новый диалог',
      createdAt: now,
      updatedAt: now,
    };
    storage.saveConversation(conversation);
    res.status(201).json(conversation);
  });
  app.get('/api/conversations/:id', (req, res) => {
    const conversation = storage.getConversation(req.params.id);
    if (!conversation) throw new AxiomError('Диалог не найден.', 404);
    res.json({ conversation, messages: storage.getMessages(conversation.id) });
  });
  app.patch('/api/conversations/:id', (req, res) => {
    const { title } = z.object({ title: z.string().trim().min(1).max(120) }).parse(req.body);
    const c = storage.getConversation(req.params.id);
    if (!c) throw new AxiomError('Диалог не найден.', 404);
    storage.saveConversation({ ...c, title });
    res.json({ ok: true });
  });
  app.delete('/api/conversations/:id', (req, res) => {
    if (core.isActive(req.params.id)) throw new AxiomError('Сначала остановите генерацию.', 409);
    storage.deleteConversation(req.params.id);
    res.json({ ok: true });
  });
  app.post('/api/conversations/:id/stop', (req, res) => {
    core.stop(req.params.id);
    res.json({ ok: true });
  });
  app.post('/api/conversations/:id/generate', async (req, res) => {
    const input = generationSchema.parse(req.body);
    const config = configById(input.providerId);
    const model = config.models.find((m) => m.id === input.modelId);
    if (!model) throw new AxiomError('Модель не найдена. Обновите список моделей в настройках.');
    const provider = registry.create(config, secrets);
    const controller = new AbortController();
    res.on('close', () => controller.abort());
    const events = core.generate(
      { ...input, conversationId: req.params.id, model },
      provider,
      controller.signal,
    );
    // Validate and start the iterator before committing HTTP headers.
    const first = await events[Symbol.asyncIterator]().next();
    res.setHeader('Content-Type', 'application/x-ndjson; charset=utf-8');
    res.setHeader('X-Accel-Buffering', 'no');
    res.flushHeaders();
    if (!first.done) res.write(`${JSON.stringify(first.value)}\n`);
    for await (const event of events) {
      if (!res.destroyed) res.write(`${JSON.stringify(event)}\n`);
    }
    res.end();
  });
  app.get('/api/providers', (_req, res) =>
    res.json(
      configurations().map((config) => ({ ...config, hasSecret: !!secrets.get(config.id) })),
    ),
  );
  app.get('/api/models', (_req, res) =>
    res.json(
      configurations()
        .filter((p) => p.enabled)
        .flatMap((p) => p.models),
    ),
  );
  app.post('/api/providers', (req, res) => {
    const input = providerSchema.parse(req.body);
    const id = randomUUID();
    const config: ProviderConfiguration = {
      id,
      name: input.name,
      kind: 'openai-compatible',
      timeouts: input.timeouts,
      baseUrl: input.baseUrl.replace(/\/+$/, ''),
      locality: input.locality,
      enabled: true,
      models: input.models.map((m) => ({ ...m, provider: id, locality: input.locality })),
    };
    if (input.apiKey) secrets.set(id, input.apiKey);
    storage.saveProvider(config);
    res.status(201).json({ ...config, hasSecret: !!input.apiKey });
  });
  app.put('/api/providers/:id', (req, res) => {
    const id = req.params.id;
    if (id === mockConfiguration.id) throw new AxiomError('Встроенную модель нельзя изменить.');
    const previous = configById(id);
    const input = providerSchema.parse(req.body);
    const config: ProviderConfiguration = {
      id,
      name: input.name,
      kind: 'openai-compatible',
      timeouts: input.timeouts ?? previous.timeouts,
      baseUrl: input.baseUrl.replace(/\/+$/, ''),
      locality: input.locality,
      enabled: true,
      models: input.models.map((m) => ({ ...m, provider: id, locality: input.locality })),
    };
    if (input.clearSecret) secrets.delete(id);
    else if (input.apiKey) secrets.set(id, input.apiKey);
    storage.saveProvider(config);
    res.json({ ...config, hasSecret: !!secrets.get(id) });
  });
  app.post('/api/providers/:id/test', async (req, res) => {
    const config = configById(req.params.id);
    const models = await registry.create(config, secrets).listModels();
    const merged = [
      ...models,
      ...config.models.filter((m) => !models.some((discovered) => discovered.id === m.id)),
    ];
    if (config.id !== mockConfiguration.id) storage.saveProvider({ ...config, models: merged });
    res.json({
      models: merged,
      message: `Подключение установлено. Обнаружено моделей: ${models.length}.`,
    });
  });
  app.delete('/api/providers/:id', (req, res) => {
    if (req.params.id === mockConfiguration.id)
      throw new AxiomError('Встроенную модель нельзя удалить.');
    storage.deleteProvider(req.params.id);
    secrets.delete(req.params.id);
    res.json({ ok: true });
  });
  app.get('/api/settings', (_req, res) => res.json(storage.getSettings()));
  app.put('/api/settings', (req, res) => {
    storage.saveSettings(settingsSchema.parse(req.body));
    res.json({ ok: true });
  });
  app.use('/api', (_req, res) => res.status(404).json({ error: 'API endpoint не найден.' }));
  if (staticDirectory && existsSync(join(staticDirectory, 'index.html'))) {
    app.use(express.static(staticDirectory));
    app.get('/{*path}', (_req, res) => res.sendFile(join(staticDirectory, 'index.html')));
  }
  const errors: ErrorRequestHandler = (error: unknown, _req, res, _next) => {
    void _next;
    if (res.headersSent) {
      res.end();
      return;
    }
    const invalid = error instanceof z.ZodError || error instanceof SyntaxError;
    res.status(invalid ? 400 : error instanceof AxiomError ? error.status : 500).json({
      error: invalid ? 'Проверьте заполненные поля и размер вложений.' : friendlyError(error),
    });
  };
  app.use(errors);
  return { app, core };
}
