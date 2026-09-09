import test from 'node:test';
import assert from 'node:assert/strict';
import {
  RecentTurnsContextBuilder,
  ApproximateTokenEstimator,
  ContextBudgetError,
  includeInModelHistory,
  ChatCore,
} from '@axiom/core';
import { mockConfiguration, StreamingProvider } from '@axiom/providers';
import { SQLiteStorage } from '@axiom/storage';
import { textOf, type Message, type ProviderEvent, type GenerationRequest } from '@axiom/shared';
const conversation = { id: 'c', title: 'Context', createdAt: '', updatedAt: '' };
const model = mockConfiguration.models[0]!;
const message = (
  id: string,
  role: Message['role'],
  text: string,
  status: Message['status'] = 'complete',
): Message => ({
  id,
  conversationId: 'c',
  role,
  status,
  createdAt: '',
  parts: [{ type: 'text', text }],
});
test('History policy includes nonempty aborted assistant, never errors/generating/empty aborted', () => {
  assert.equal(includeInModelHistory(message('a', 'assistant', 'partial', 'aborted')), true);
  for (const status of ['error', 'generating'] as const)
    assert.equal(includeInModelHistory(message('a', 'assistant', 'partial', status)), false);
  assert.equal(includeInModelHistory(message('a', 'assistant', ' \n ', 'aborted')), false);
  assert.equal(includeInModelHistory(message('a', 'assistant', 'complete')), true);
});
test('Context retains newest complete turns and pinned system, without mutating history', () => {
  const builder = new RecentTurnsContextBuilder(
    { estimate: (m) => textOf(m).length },
    { outputReserve: 0, safetyRatio: 0 },
  );
  const messages = [
    message('s', 'system', 'sys'),
    message('u1', 'user', 'aaaa'),
    message('a1', 'assistant', 'bbbb'),
    message('u2', 'user', 'cccc'),
    message('a2', 'assistant', 'dd', 'aborted'),
    message('u3', 'user', 'go'),
  ];
  const original = structuredClone(messages);
  const result = builder.build({ conversation, model: { ...model, contextWindow: 12 }, messages });
  assert.deepEqual(
    result.messages.map((m) => m.id),
    ['s', 'u2', 'a2', 'u3'],
  );
  assert.equal(result.estimatedTokens, 11);
  assert.deepEqual(messages, original);
  assert.deepEqual(result.droppedMessageIds, ['u1', 'a1']);
});
test('Unknown context uses bounded fallback; latest oversized turn and oversized system fail', () => {
  const builder = new RecentTurnsContextBuilder(
    { estimate: (m) => textOf(m).length },
    { fallbackContextWindow: 10, outputReserve: 0, safetyRatio: 0 },
  );
  const unknown = { ...model, contextWindow: undefined };
  assert.equal(
    builder.build({ conversation, model: unknown, messages: [message('u', 'user', 'x')] })
      .inputBudget,
    10,
  );
  for (const role of ['user', 'system'] as const)
    assert.throws(
      () =>
        builder.build({
          conversation,
          model: unknown,
          messages: [message('u', role, 'x'.repeat(11))],
        }),
      ContextBudgetError,
    );
});
test('Context drops orphan assistants, excludes errors and preserves tool exchange atomically', () => {
  const messages = [
    message('orphan', 'assistant', 'x'),
    message('u1', 'user', 'old'),
    {
      ...message('call', 'assistant', ''),
      parts: [{ type: 'tool-call' as const, callId: 't', name: 'f', arguments: {} }],
    },
    {
      ...message('result', 'tool', ''),
      parts: [{ type: 'tool-result' as const, callId: 't', result: {} }],
    },
    message('u2', 'user', 'new'),
    message('bad', 'assistant', 'failed', 'error'),
    message('empty', 'assistant', '', 'aborted'),
  ];
  const builder = new RecentTurnsContextBuilder(
    { estimate: () => 1 },
    { outputReserve: 0, safetyRatio: 0 },
  );
  assert.deepEqual(
    builder
      .build({ conversation, model: { ...model, contextWindow: 3 }, messages })
      .messages.map((m) => m.id),
    ['u2'],
  );
  assert.deepEqual(
    builder
      .build({ conversation, model: { ...model, contextWindow: 4 }, messages })
      .messages.map((m) => m.id),
    ['u1', 'call', 'result', 'u2'],
  );
});
test('Estimator accounts for files, images, Unicode, reasoning and tool payloads deterministically', () => {
  const estimator = new ApproximateTokenEstimator();
  const base = message('u', 'user', 'abc');
  assert.equal(estimator.estimate(base), 9);
  assert.equal(estimator.estimate(message('u', 'user', 'абв')), 10);
  const file = {
    ...base,
    parts: [
      {
        type: 'file' as const,
        attachment: { id: 'f', name: 'f.txt', mimeType: 'text/plain', size: 100 },
        text: 'a'.repeat(100),
      },
    ],
  };
  assert.ok(estimator.estimate(file) > estimator.estimate(base));
  const image = {
    ...base,
    parts: [
      {
        type: 'image' as const,
        attachment: { id: 'i', name: 'i.png', mimeType: 'image/png', size: 1 },
        dataUrl: 'data:image/png;base64,AA==',
      },
    ],
  };
  assert.equal(estimator.estimate(image), 4104);
  assert.ok(
    estimator.estimate({
      ...base,
      parts: [{ type: 'reasoning', summary: 'summary', metadata: { budget: 123 } }],
    }) > 8,
  );
});
test('Continuation actually passes the stopped partial answer to a provider; edit budget error preserves DB', async () => {
  const storage = new SQLiteStorage(':memory:');
  storage.saveConversation(conversation);
  const builder = new RecentTurnsContextBuilder(
    { estimate: (m) => textOf(m).length },
    { fallbackContextWindow: 100, outputReserve: 0, safetyRatio: 0 },
  );
  const core = new ChatCore(storage, builder);
  let received: Message[] = [];
  class Capture extends StreamingProvider {
    id = model.provider;
    async listModels() {
      return [model];
    }
    async *streamChat(request: GenerationRequest): AsyncIterable<ProviderEvent> {
      received = request.messages;
      yield { type: 'delta', text: 'partial answer' };
      yield { type: 'finish', result: { finishReason: 'stop' } };
    }
  }
  const provider = new Capture();
  for await (const event of core.generate(
    { conversationId: 'c', model, parts: [{ type: 'text', text: 'long please' }] },
    provider,
  ))
    if (event.type === 'delta') core.stop('c');
  assert.equal(storage.getMessages('c')[1]?.status, 'aborted');
  for await (const event of core.generate(
    { conversationId: 'c', model, parts: [{ type: 'text', text: 'continue' }] },
    provider,
  ))
    void event;
  assert.deepEqual(received.map(textOf), ['long please', 'partial answer', 'continue']);
  const old = storage.getMessages('c');
  await assert.rejects(async () => {
    for await (const event of core.generate(
      {
        conversationId: 'c',
        model: { ...model, contextWindow: 10 },
        editMessageId: old[0]!.id,
        parts: [{ type: 'text', text: 'oversized edit'.repeat(20) }],
      },
      provider,
    ))
      void event;
  }, ContextBudgetError);
  assert.deepEqual(storage.getMessages('c'), old);
  storage.close();
});
