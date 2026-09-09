import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { OpenAICompatibleProvider } from '@axiom/providers';
import { readSSE } from '@axiom/providers';
import type { Model, ProviderConfiguration } from '@axiom/shared';
test('SSE preserves split UTF-8, CRLF, comments and multiline events', async () => {
  const bytes = new TextEncoder().encode(
    ': comment\r\ndata: Привет\r\ndata: мир\r\n\r\ndata: [DONE]\n\n',
  );
  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      for (const byte of bytes) controller.enqueue(new Uint8Array([byte]));
      controller.close();
    },
  });
  const events = [];
  for await (const data of readSSE(body)) events.push(data);
  assert.deepEqual(events, ['Привет\nмир', '[DONE]']);
});
test('OpenAI-compatible makes real HTTP requests, discovers models, streams and masks API errors', async () => {
  let mode = 'normal';
  let received: unknown;
  let auth: string | undefined;
  const server = createServer(async (req, res) => {
    auth = req.headers.authorization;
    if (mode === 'auth') {
      res.writeHead(401);
      res.end('private provider error');
      return;
    }
    if (req.url === '/v1/models') {
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({ data: [{ id: 'local/test' }] }));
      return;
    }
    const buffers = [];
    for await (const buffer of req) buffers.push(buffer as Buffer);
    received = JSON.parse(Buffer.concat(buffers).toString());
    res.setHeader('Content-Type', 'text/event-stream');
    res.write('data: {"choices":[{"delta":{"content":"Привет "}}]}\r\n\r\n');
    if (mode === 'truncated') {
      res.end();
      return;
    }
    res.end(
      'data: {"choices":[{"delta":{"content":"мир"},"finish_reason":"stop"}]}\n\ndata: [DONE]\n\n',
    );
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  try {
    const model: Model = {
      id: 'local/test',
      displayName: 'Local',
      provider: 'test',
      locality: 'local',
      capabilities: { text: true, streaming: true },
    };
    const configuration: ProviderConfiguration = {
      id: 'test',
      name: 'Test',
      kind: 'openai-compatible',
      enabled: true,
      locality: 'local',
      baseUrl: `http://127.0.0.1:${(server.address() as AddressInfo).port}/v1`,
      models: [model],
    };
    const provider = new OpenAICompatibleProvider(configuration, {
      get: () => 'abc',
      set: () => {},
      delete: () => {},
    });
    assert.equal((await provider.listModels())[0]?.displayName, 'Local');
    const request = {
      model,
      signal: new AbortController().signal,
      messages: [
        {
          id: 'm',
          conversationId: 'c',
          role: 'user' as const,
          createdAt: '',
          status: 'complete' as const,
          parts: [{ type: 'text' as const, text: 'Hi' }],
        },
      ],
    };
    assert.equal((await provider.chat(request)).text, 'Привет мир');
    assert.equal(auth, 'Bearer abc');
    assert.deepEqual(received, {
      model: 'local/test',
      stream: true,
      messages: [{ role: 'user', content: 'Hi' }],
    });
    mode = 'truncated';
    await assert.rejects(provider.chat(request), /до завершения/);
    mode = 'auth';
    await assert.rejects(provider.listModels(), /API-ключ не принят/);
  } finally {
    await closeServer(server);
  }
});
async function closeServer(server: Server) {
  server.closeAllConnections();
  await new Promise<void>((resolve) => server.close(() => resolve()));
}
