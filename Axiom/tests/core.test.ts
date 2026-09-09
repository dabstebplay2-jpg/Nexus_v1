import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { ChatCore, ProviderRegistry } from '@axiom/core';
import {
  AxiomError,
  textOf,
  type AIProvider,
  type ChatEvent,
  type GenerationRequest,
  type ProviderEvent,
} from '@axiom/shared';
import { mockConfiguration, MockProvider, StreamingProvider } from '@axiom/providers';
import { EncryptedFileSecretStorage, SQLiteStorage } from '@axiom/storage';
const model = mockConfiguration.models[0]!;
function fixture() {
  const storage = new SQLiteStorage(':memory:');
  const id = crypto.randomUUID();
  const now = new Date().toISOString();
  storage.saveConversation({ id, title: 'Новый диалог', createdAt: now, updatedAt: now });
  return { storage, id, core: new ChatCore(storage) };
}
class QuickProvider extends StreamingProvider {
  id = 'axiom-mock';
  async listModels() {
    return [model];
  }
  async *streamChat(request: GenerationRequest): AsyncIterable<ProviderEvent> {
    request.signal.throwIfAborted();
    yield { type: 'delta', text: `Ответ ${request.messages.length}` };
    yield { type: 'finish', result: { finishReason: 'stop' } };
  }
}
const consume = async (events: AsyncIterable<ChatEvent>) => {
  const result: ChatEvent[] = [];
  for await (const event of events) result.push(event);
  return result;
};
test('Core persists turns, generates local title, edits/truncates and regenerates', async () => {
  const { core, storage, id } = fixture();
  const provider = new QuickProvider();
  await consume(
    core.generate(
      { conversationId: id, model, parts: [{ type: 'text', text: 'Первая идея' }] },
      provider,
    ),
  );
  assert.equal(storage.getConversation(id)?.title, 'Первая идея');
  assert.equal(storage.getMessages(id).length, 2);
  const first = storage.getMessages(id)[0]!;
  await consume(
    core.generate(
      { conversationId: id, model, parts: [{ type: 'text', text: 'Второй вопрос' }] },
      provider,
    ),
  );
  assert.equal(storage.getMessages(id).length, 4);
  await consume(
    core.generate(
      {
        conversationId: id,
        model,
        editMessageId: first.id,
        parts: [{ type: 'text', text: 'Исправленный вопрос' }],
      },
      provider,
    ),
  );
  assert.equal(storage.getMessages(id).length, 2);
  assert.equal(textOf(storage.getMessages(id)[0]!), 'Исправленный вопрос');
  await consume(core.generate({ conversationId: id, model, regenerate: true }, provider));
  assert.equal(storage.getMessages(id).length, 2);
  assert.equal(storage.getMessages(id)[1]?.status, 'complete');
  storage.close();
});
test('Mock streaming supports stop, partial persistence and concurrent generation guard', async () => {
  const { core, storage, id } = fixture();
  const provider = new MockProvider();
  let chunks = 0;
  for await (const event of core.generate(
    { conversationId: id, model, parts: [{ type: 'text', text: 'Привет' }] },
    provider,
  )) {
    if (event.type === 'delta') {
      chunks++;
      await assert.rejects(
        consume(
          core.generate(
            { conversationId: id, model, parts: [{ type: 'text', text: 'Дубликат' }] },
            provider,
          ),
        ),
        /уже идёт/,
      );
      core.stop(id);
    }
  }
  assert.equal(chunks, 1);
  assert.equal(core.isActive(id), false);
  assert.equal(storage.getMessages(id)[1]?.status, 'aborted');
  assert.ok(textOf(storage.getMessages(id)[1]!).length > 0);
  storage.close();
});
test('Provider failure keeps user and safe error, retry is possible', async () => {
  const { core, storage, id } = fixture();
  class Broken extends QuickProvider {
    async *streamChat(): AsyncIterable<ProviderEvent> {
      yield { type: 'delta', text: 'Часть' };
      throw new Error('secret internal stack');
    }
  }
  await consume(
    core.generate(
      { conversationId: id, model, parts: [{ type: 'text', text: 'Вопрос' }] },
      new Broken(),
    ),
  );
  const failed = storage.getMessages(id)[1]!;
  assert.equal(failed.status, 'error');
  assert.ok(!failed.error?.includes('secret'));
  await consume(
    core.generate({ conversationId: id, model, regenerate: true }, new QuickProvider()),
  );
  assert.equal(storage.getMessages(id)[1]?.status, 'complete');
  storage.close();
});
test('SQLite reopens history/config/settings and recovers interrupted output', () => {
  const dir = mkdtempSync(join(tmpdir(), 'axiom-storage-'));
  const path = join(dir, 'test.sqlite');
  try {
    let db = new SQLiteStorage(path);
    const now = new Date().toISOString();
    db.saveConversation({ id: 'c', title: 'Saved', createdAt: now, updatedAt: now });
    db.saveMessage({
      id: 'm',
      conversationId: 'c',
      role: 'assistant',
      parts: [{ type: 'text', text: 'partial' }],
      createdAt: now,
      status: 'generating',
    });
    db.saveProvider(mockConfiguration);
    db.saveSettings({ favoriteModels: ['mock'] });
    db.close();
    db = new SQLiteStorage(path);
    assert.equal(db.getConversation('c')?.title, 'Saved');
    assert.equal(db.getMessages('c')[0]?.status, 'aborted');
    assert.equal(db.listProviders().length, 1);
    assert.deepEqual(db.getSettings().favoriteModels, ['mock']);
    db.deleteConversation('c');
    assert.equal(db.getMessages('c').length, 0);
    db.close();
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
test('Secret store encrypts, survives reopening and deletes credentials', () => {
  const dir = mkdtempSync(join(tmpdir(), 'axiom-secret-'));
  try {
    const store = new EncryptedFileSecretStorage(dir);
    store.set('test', 'secret-token-123');
    assert.ok(!readFileSync(join(dir, 'secrets.json'), 'utf8').includes('secret-token-123'));
    const reopened = new EncryptedFileSecretStorage(dir);
    assert.equal(reopened.get('test'), 'secret-token-123');
    reopened.delete('test');
    assert.equal(reopened.get('test'), undefined);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
test('Provider registration is explicit and rejects missing/duplicate adapters', () => {
  const registry = new ProviderRegistry();
  registry.register('mock', () => new MockProvider());
  assert.throws(() => registry.register('mock', () => new MockProvider()), /already registered/);
  const vault = { get: () => undefined, set: () => {}, delete: () => {} };
  assert.throws(
    () => registry.create({ ...mockConfiguration, kind: 'missing' }, vault),
    AxiomError,
  );
  assert.equal((registry.create(mockConfiguration, vault) as AIProvider).id, 'axiom-mock');
});

test('Core releases lock after repository failure and rolls back the turn', async () => {
  const { storage, id } = fixture();
  const repository = Object.create(storage) as SQLiteStorage;
  repository.saveMessage = () => {
    throw new Error('Disk write failed');
  };
  const core = new ChatCore(repository);
  await assert.rejects(
    consume(
      core.generate(
        { conversationId: id, model, parts: [{ type: 'text', text: 'Unsaved' }] },
        new QuickProvider(),
      ),
    ),
    /Disk write failed/,
  );
  assert.equal(core.isActive(id), false);
  assert.equal(storage.getMessages(id).length, 0);
  assert.equal(storage.getConversation(id)?.title, 'Новый диалог');
  storage.close();
});

test('Closing a Core iterator cancels the turn and preserves the user message', async () => {
  const { core, storage, id } = fixture();
  for await (const event of core.generate(
    { conversationId: id, model, parts: [{ type: 'text', text: 'Stop consumer' }] },
    new QuickProvider(),
  )) {
    assert.equal(event.type, 'message');
    break;
  }
  assert.equal(core.isActive(id), false);
  assert.equal(storage.getMessages(id)[1]?.status, 'aborted');
  storage.close();
});


test('Pre-aborted generation is side-effect free', async () => {
  const { core, storage, id } = fixture();
  const provider = new QuickProvider();
  let providerCalled = false;
  provider.streamChat = async function* (request: GenerationRequest): AsyncIterable<ProviderEvent> {
    providerCalled = true;
    yield* QuickProvider.prototype.streamChat.call(this, request);
  };
  const controller = new AbortController();
  controller.abort();

  const events = await consume(
    core.generate(
      { conversationId: id, model, parts: [{ type: 'text', text: 'Must not be persisted' }] },
      provider,
      controller.signal,
    ),
  );

  assert.deepEqual(events, []);
  assert.equal(providerCalled, false);
  assert.equal(core.isActive(id), false);
  assert.equal(storage.getMessages(id).length, 0);
  assert.equal(storage.getConversation(id)?.title, 'Новый диалог');
  storage.close();
});

