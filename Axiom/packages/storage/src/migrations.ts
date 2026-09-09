import type { DatabaseSync } from 'node:sqlite';
export interface Migration {
  version: number;
  name: string;
  up(db: DatabaseSync): void;
}
export const migrations: readonly Migration[] = [
  {
    version: 1,
    name: 'alpha.1 baseline',
    up(db) {
      db.exec(`
      CREATE TABLE IF NOT EXISTS conversations (id TEXT PRIMARY KEY, title TEXT NOT NULL, createdAt TEXT NOT NULL, updatedAt TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS messages (sequence INTEGER PRIMARY KEY AUTOINCREMENT, id TEXT UNIQUE NOT NULL, conversationId TEXT NOT NULL REFERENCES conversations(id) ON DELETE CASCADE, data TEXT NOT NULL);
      CREATE INDEX IF NOT EXISTS messages_conversation ON messages(conversationId, sequence);
      CREATE TABLE IF NOT EXISTS provider_configurations (id TEXT PRIMARY KEY, data TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS application_settings (id INTEGER PRIMARY KEY CHECK(id = 1), data TEXT NOT NULL);
    `);
    },
  },
  {
    version: 2,
    name: 'indexed message metadata',
    up(db) {
      db.exec(`
      ALTER TABLE messages RENAME TO messages_v1;
      CREATE TABLE messages (
        sequence INTEGER PRIMARY KEY AUTOINCREMENT,
        id TEXT UNIQUE NOT NULL,
        conversation_id TEXT NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
        role TEXT NOT NULL CHECK(role IN ('system', 'user', 'assistant', 'tool')),
        status TEXT NOT NULL CHECK(status IN ('complete', 'generating', 'aborted', 'error')),
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        model_id TEXT,
        provider_id TEXT,
        data TEXT NOT NULL CHECK(json_valid(data))
      );
      INSERT INTO messages(sequence,id,conversation_id,role,status,created_at,updated_at,model_id,provider_id,data)
      SELECT sequence,id,conversationId,json_extract(data,'$.role'),json_extract(data,'$.status'),
        json_extract(data,'$.createdAt'),COALESCE(json_extract(data,'$.updatedAt'),json_extract(data,'$.createdAt')),
        json_extract(data,'$.model'),json_extract(data,'$.provider'),data FROM messages_v1;
      DROP TABLE messages_v1;
      CREATE INDEX messages_conversation ON messages(conversation_id,sequence);
      CREATE INDEX messages_status ON messages(status);
    `);
    },
  },
];
/** Applied versions must be an exact prefix. No automatic downgrades or partial migrations. */
export function runMigrations(db: DatabaseSync, plan: readonly Migration[] = migrations): void {
  if (plan.some((m, index) => m.version !== index + 1))
    throw new Error('Migrations must have consecutive unique versions starting at 1');
  db.exec('CREATE TABLE IF NOT EXISTS migrations (version INTEGER PRIMARY KEY)');
  const applied = db.prepare('SELECT version FROM migrations ORDER BY version').all();
  if (applied.some((row, index) => row.version !== plan[index]?.version))
    throw new Error(
      'Database migration history is unknown or non-contiguous; restore a compatible application',
    );
  for (const migration of plan.slice(applied.length)) {
    db.exec('BEGIN IMMEDIATE');
    try {
      migration.up(db);
      db.prepare('INSERT INTO migrations(version) VALUES(?)').run(migration.version);
      db.exec('COMMIT');
    } catch (error) {
      db.exec('ROLLBACK');
      throw new Error(`Migration ${migration.version} (${migration.name}) failed; rolled back`, {
        cause: error,
      });
    }
  }
}
