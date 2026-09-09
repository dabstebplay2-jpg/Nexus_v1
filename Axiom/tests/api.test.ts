import test from 'node:test';
import assert from 'node:assert/strict';
import type { AddressInfo } from 'node:net';
import { SQLiteStorage } from '@axiom/storage';
import { createApp } from '../apps/server/src/app';
test('API validates input/origin, persists secrets server-side and streams Mock', async () => {
  const storage = new SQLiteStorage(':memory:');
  const secretMap = new Map<string, string>();
  const { app } = createApp(storage, {
    get: (id) => secretMap.get(id),
    set: (id, value) => {
      secretMap.set(id, value);
    },
    delete: (id) => {
      secretMap.delete(id);
    },
  });
  const server = app.listen(0, '127.0.0.1');
  await new Promise<void>((resolve) => server.once('listening', resolve));
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}/api`;
  const post = (path: string, body: unknown, headers = {}) =>
    fetch(`${base}${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Axiom-Client': 'chat', ...headers },
      body: JSON.stringify(body),
    });
  try {
    assert.equal(
      (await post('/conversations', {}, { Origin: 'https://evil.example' })).status,
      403,
    );
    assert.equal((await fetch(`${base}/conversations`, { method: 'POST' })).status, 403);
    assert.equal((await post('/providers', { name: 'bad' })).status, 400);
    const connection = await post('/providers', {
      name: 'Test',
      baseUrl: 'http://localhost:1234/v1',
      apiKey: 'hidden-key',
      locality: 'local',
      models: [],
    });
    assert.equal(connection.status, 201);
    const saved = await connection.text();
    assert.ok(!saved.includes('hidden-key'));
    assert.ok(saved.includes('hasSecret'));
    const config = await fetch(`${base}/providers`).then((r) => r.text());
    assert.ok(!config.includes('hidden-key'));
    const conversation = (await post('/conversations', {}).then((r) => r.json())) as { id: string };
    const response = await post(`/conversations/${conversation.id}/generate`, {
      providerId: 'axiom-mock',
      modelId: 'axiom-mock',
      parts: [{ type: 'text', text: 'API smoke' }],
    });
    assert.equal(response.status, 200);
    const reader = response.body!.getReader();
    await reader.read();
    await post(`/conversations/${conversation.id}/stop`, {});
    let output = '';
    while (true) {
      const chunk = await reader.read();
      if (chunk.done) break;
      output += new TextDecoder().decode(chunk.value);
    }
    assert.match(output, /"type":"done"/);
    assert.equal(storage.getMessages(conversation.id)[1]?.status, 'aborted');
  } finally {
    server.closeAllConnections();
    await new Promise<void>((resolve) => server.close(() => resolve()));
    storage.close();
  }
});
