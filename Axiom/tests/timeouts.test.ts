import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import {
  RequestTimeouts,
  ProviderTimeoutError,
  OpenAICompatibleProvider,
  mockConfiguration,
  type TimeoutClock,
} from '@axiom/providers';
class ManualClock implements TimeoutClock {
  now = 0;
  private next = 0;
  tasks = new Map<number, { at: number; callback: () => void }>();
  set(callback: () => void, ms: number) {
    const id = ++this.next;
    this.tasks.set(id, { at: this.now + ms, callback });
    return id;
  }
  clear(handle: unknown) {
    this.tasks.delete(handle as number);
  }
  advance(ms: number) {
    const target = this.now + ms;
    while (true) {
      const next = [...this.tasks]
        .filter(([, t]) => t.at <= target)
        .sort((a, b) => a[1].at - b[1].at)[0];
      if (!next) break;
      this.now = next[1].at;
      this.tasks.delete(next[0]);
      next[1].callback();
    }
    this.now = target;
  }
}
test('Active stream survives ten virtual minutes with no absolute deadline; idle then expires', () => {
  const clock = new ManualClock();
  const scope = new RequestTimeouts({ connectionMs: 30_000, idleMs: 180_000 }, undefined, clock);
  scope.headersReceived();
  for (let i = 0; i < 20; i++) {
    clock.advance(30_000);
    assert.equal(scope.signal.aborted, false);
    scope.activity();
  }
  assert.equal(clock.now, 600_000);
  clock.advance(180_000);
  assert.ok(scope.signal.reason instanceof ProviderTimeoutError);
  assert.equal((scope.signal.reason as ProviderTimeoutError).kind, 'idle');
  scope.dispose();
  assert.equal(clock.tasks.size, 0);
});
test('Connection and optional absolute deadlines are distinct; user abort reason wins and timers dispose', () => {
  for (const kind of ['connection', 'absolute'] as const) {
    const clock = new ManualClock();
    const scope = new RequestTimeouts(
      { connectionMs: 20, idleMs: 100, absoluteMs: 50 },
      undefined,
      clock,
    );
    if (kind === 'absolute') scope.headersReceived();
    clock.advance(kind === 'connection' ? 20 : 50);
    assert.equal((scope.signal.reason as ProviderTimeoutError).kind, kind);
    scope.dispose();
    assert.equal(clock.tasks.size, 0);
  }
  const clock = new ManualClock();
  const user = new AbortController();
  const scope = new RequestTimeouts({ connectionMs: 20, idleMs: 100 }, user.signal, clock);
  const reason = new Error('user cancelled');
  user.abort(reason);
  assert.equal(scope.signal.reason, reason);
  scope.dispose();
  assert.equal(clock.tasks.size, 0);
});
test('HTTP stream remains active beyond header deadline, detects idle and honors user abort', async () => {
  let mode = 'active';
  const server = createServer((_req, res) => {
    res.writeHead(200, { 'Content-Type': 'text/event-stream' });
    res.flushHeaders();
    if (mode === 'idle') return;
    let count = 0;
    const timer = setInterval(() => {
      res.write(': heartbeat\n\n');
      if (++count === 12) {
        clearInterval(timer);
        res.end(
          'data: {"choices":[{"delta":{"content":"ok"},"finish_reason":"stop"}]}\n\ndata: [DONE]\n\n',
        );
      }
    }, 20);
    res.on('close', () => clearInterval(timer));
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  try {
    const config = {
      ...mockConfiguration,
      id: 'http',
      kind: 'openai-compatible',
      baseUrl: `http://127.0.0.1:${(server.address() as AddressInfo).port}`,
      timeouts: { connectionMs: 150, idleMs: 100 },
    };
    const provider = new OpenAICompatibleProvider(config, {
      get: () => undefined,
      set: () => {},
      delete: () => {},
    });
    const request = {
      model: mockConfiguration.models[0]!,
      messages: [],
      signal: new AbortController().signal,
    };
    assert.equal((await provider.chat(request)).text, 'ok');
    mode = 'idle';
    await assert.rejects(
      provider.chat(request),
      (error) => error instanceof ProviderTimeoutError && error.kind === 'idle',
    );
    const user = new AbortController();
    const pending = provider.chat({ ...request, signal: user.signal });
    user.abort();
    await assert.rejects(pending, (error) => error instanceof Error && error.name === 'AbortError');
  } finally {
    server.closeAllConnections();
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});
