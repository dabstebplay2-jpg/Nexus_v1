import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  SQLiteStorage,
  migrations,
  runMigrations,
  createSecretStorageRegistry,
} from '@axiom/storage';
import type { Message } from '@axiom/shared';

// Frozen legacy DDL, deliberately independent of the new migration implementation.
const alpha1 = `CREATE TABLE migrations(version INTEGER PRIMARY KEY); INSERT INTO migrations VALUES(1);
CREATE TABLE conversations(id TEXT PRIMARY KEY,title TEXT NOT NULL,createdAt TEXT NOT NULL,updatedAt TEXT NOT NULL);
CREATE TABLE messages(sequence INTEGER PRIMARY KEY AUTOINCREMENT,id TEXT UNIQUE NOT NULL,conversationId TEXT NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,data TEXT NOT NULL);
CREATE INDEX messages_conversation ON messages(conversationId,sequence);
CREATE TABLE provider_configurations(id TEXT PRIMARY KEY,data TEXT NOT NULL);
CREATE TABLE application_settings(id INTEGER PRIMARY KEY CHECK(id=1),data TEXT NOT NULL);`;
test('Empty database migrates once; reopening does not rerun applied migrations', () => {
  const db = new DatabaseSync(':memory:');
  runMigrations(db);
  assert.deepEqual(
    db
      .prepare('SELECT version FROM migrations ORDER BY version')
      .all()
      .map((r) => r.version),
    [1, 2],
  );
  runMigrations(
    db,
    migrations.map((m) => ({ ...m, up: () => assert.fail('migration repeated') })),
  );
  assert.ok(
    db
      .prepare('PRAGMA table_info(messages)')
      .all()
      .some((r) => r.name === 'status'),
  );
  db.close();
});
test('Real alpha.1 schema migrates preserving messages/parts/order/config/settings and recovers only generating', () => {
  const directory = mkdtempSync(join(tmpdir(), 'axiom-migration-'));
  const path = join(directory, 'legacy.sqlite');
  try {
    let db = new DatabaseSync(path);
    db.exec(alpha1);
    db.prepare('INSERT INTO conversations VALUES(?,?,?,?)').run(
      'c',
      'Legacy',
      '2026-01-01',
      '2026-01-02',
    );
    const original: Message[] = ['complete', 'generating', 'error', 'aborted'].map(
      (status, index) => ({
        id: `m${index}`,
        conversationId: 'c',
        role: index === 0 ? 'user' : 'assistant',
        status: status as Message['status'],
        createdAt: '2026-01-01',
        model: 'legacy-model',
        provider: 'legacy-provider',
        parts: [
          { type: 'text', text: `kept ${index}` },
          {
            type: 'file',
            attachment: { id: 'f', name: 'f.md', mimeType: 'text/plain', size: 3 },
            text: 'abc',
          },
        ],
      }),
    );
    for (const m of original)
      db.prepare('INSERT INTO messages(id,conversationId,data) VALUES(?,?,?)').run(
        m.id,
        m.conversationId,
        JSON.stringify(m),
      );
    const config = {
      id: 'p',
      name: 'Legacy provider',
      kind: 'openai-compatible',
      enabled: true,
      baseUrl: 'http://localhost:1234/v1',
      locality: 'local',
      models: [],
    };
    db.prepare('INSERT INTO provider_configurations VALUES(?,?)').run('p', JSON.stringify(config));
    db.prepare('INSERT INTO application_settings VALUES(1,?)').run(
      JSON.stringify({ favoriteModels: ['legacy'] }),
    );
    db.close();
    const storage = new SQLiteStorage(path);
    const migrated = storage.getMessages('c');
    assert.deepEqual(
      migrated.map((m) => m.id),
      original.map((m) => m.id),
    );
    assert.deepEqual(
      migrated.map((m) => m.parts),
      original.map((m) => m.parts),
    );
    assert.deepEqual(
      migrated.map((m) => m.status),
      ['complete', 'aborted', 'error', 'aborted'],
    );
    assert.equal(storage.getConversation('c')?.title, 'Legacy');
    assert.deepEqual(storage.listProviders(), [config]);
    assert.deepEqual(storage.getSettings().favoriteModels, ['legacy']);
    storage.close();
    db = new DatabaseSync(path);
    const plan = db
      .prepare("EXPLAIN QUERY PLAN SELECT id FROM messages WHERE status='generating'")
      .all();
    assert.match(JSON.stringify(plan), /messages_status/);
    const rows = db
      .prepare(
        'SELECT status,role,model_id,provider_id,created_at,updated_at,data FROM messages ORDER BY sequence',
      )
      .all();
    for (const row of rows) {
      const value = JSON.parse(String(row.data)) as Message;
      assert.equal(row.status, value.status);
      assert.equal(row.role, value.role);
      assert.equal(row.model_id, value.model);
    }
    db.close();
    const reopened = new SQLiteStorage(path);
    assert.deepEqual(reopened.getMessages('c'), migrated);
    reopened.deleteConversation('c');
    assert.deepEqual(reopened.getMessages('c'), []);
    reopened.close();
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});
test('Migration failure rolls back schema, writes and version; valid retry succeeds', () => {
  const db = new DatabaseSync(':memory:');
  runMigrations(db);
  assert.throws(
    () =>
      runMigrations(db, [
        ...migrations,
        {
          version: 3,
          name: 'failure',
          up(database) {
            database.exec('CREATE TABLE partial(id INTEGER); INSERT INTO partial VALUES(1);');
            throw new Error('Injected failure');
          },
        },
      ]),
    /rolled back/,
  );
  assert.equal(db.prepare("SELECT name FROM sqlite_master WHERE name='partial'").get(), undefined);
  assert.equal(db.prepare('SELECT MAX(version) AS version FROM migrations').get()?.version, 2);
  runMigrations(db, [
    ...migrations,
    {
      version: 3,
      name: 'fixed',
      up(database) {
        database.exec('CREATE TABLE partial(id INTEGER)');
      },
    },
  ]);
  assert.equal(db.prepare('SELECT MAX(version) AS version FROM migrations').get()?.version, 3);
  db.close();
});
test('Corrupt legacy payload aborts migration without losing the original table', () => {
  const db = new DatabaseSync(':memory:');
  db.exec(alpha1);
  db.exec(
    "INSERT INTO conversations VALUES('c','x','',''); INSERT INTO messages(id,conversationId,data) VALUES('bad','c','not JSON');",
  );
  assert.throws(() => runMigrations(db), /Migration 2/);
  assert.equal(db.prepare('SELECT data FROM messages').get()?.data, 'not JSON');
  assert.equal(db.prepare('SELECT MAX(version) AS version FROM migrations').get()?.version, 1);
  db.close();
});
test('Migration runner rejects duplicate/gap/future versions and secret backends never silently downgrade', () => {
  const db = new DatabaseSync(':memory:');
  assert.throws(() => runMigrations(db, [migrations[1]!]), /consecutive/);
  runMigrations(db);
  db.exec('INSERT INTO migrations VALUES(99)');
  assert.throws(() => runMigrations(db), /unknown/);
  db.close();
  const registry = createSecretStorageRegistry();
  assert.throws(() => registry.create({ backend: 'windows-dpapi', directory: '.' }), /No fallback/);
  const vault = { get: () => undefined, set: () => {}, delete: () => {} };
  registry.register('os-test', () => vault);
  assert.equal(registry.create({ backend: 'os-test', directory: '.' }), vault);
});
