import { DatabaseSync } from 'node:sqlite';
import type {
  AppSettings,
  ChatRepository,
  ConfigurationRepository,
  Conversation,
  Message,
  ProviderConfiguration,
} from '@axiom/shared';
import { runMigrations } from './migrations.js';
export class SQLiteStorage implements ChatRepository, ConfigurationRepository {
  private db: DatabaseSync;
  constructor(path: string) {
    this.db = new DatabaseSync(path);
    try {
      this.db.exec('PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON;');
      runMigrations(this.db);
      const recoveredAt = new Date().toISOString();
      this.db
        .prepare(
          `UPDATE messages SET status='aborted', updated_at=?,
        data=json_set(data,'$.status','aborted','$.updatedAt',?) WHERE status='generating'`,
        )
        .run(recoveredAt, recoveredAt);
    } catch (error) {
      this.db.close();
      throw error;
    }
  }
  listConversations(): Conversation[] {
    return this.db
      .prepare('SELECT * FROM conversations ORDER BY updatedAt DESC')
      .all() as unknown as Conversation[];
  }
  getConversation(id: string): Conversation | undefined {
    return this.db.prepare('SELECT * FROM conversations WHERE id = ?').get(id) as unknown as
      Conversation | undefined;
  }
  saveConversation(c: Conversation): void {
    this.db
      .prepare(
        'INSERT INTO conversations VALUES(?, ?, ?, ?) ON CONFLICT(id) DO UPDATE SET title=excluded.title, updatedAt=excluded.updatedAt',
      )
      .run(c.id, c.title, c.createdAt, c.updatedAt);
  }
  deleteConversation(id: string): void {
    this.db.prepare('DELETE FROM conversations WHERE id = ?').run(id);
  }
  getMessages(id: string): Message[] {
    return this.db
      .prepare('SELECT data FROM messages WHERE conversation_id = ? ORDER BY sequence')
      .all(id)
      .map((row) => JSON.parse(String(row.data)) as Message);
  }
  saveMessage(m: Message): void {
    const updatedAt = new Date().toISOString();
    const result = this.db
      .prepare(
        `INSERT INTO messages(id,conversation_id,role,status,created_at,updated_at,model_id,provider_id,data)
        VALUES(?,?,?,?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET role=excluded.role,status=excluded.status,
        updated_at=excluded.updated_at,model_id=excluded.model_id,provider_id=excluded.provider_id,data=excluded.data
        WHERE messages.conversation_id=excluded.conversation_id AND messages.created_at=excluded.created_at`,
      )
      .run(
        m.id,
        m.conversationId,
        m.role,
        m.status,
        m.createdAt,
        updatedAt,
        m.model ?? null,
        m.provider ?? null,
        JSON.stringify({ ...m, updatedAt }),
      );
    if (!result.changes) throw new Error('Message identity cannot be changed');
    m.updatedAt = updatedAt;
  }
  truncateFrom(conversationId: string, messageId: string): void {
    this.db
      .prepare(
        'DELETE FROM messages WHERE conversation_id = ? AND sequence >= (SELECT sequence FROM messages WHERE id = ? AND conversation_id = ?)',
      )
      .run(conversationId, messageId, conversationId);
  }
  transaction<T>(action: () => T): T {
    this.db.exec('BEGIN');
    try {
      const result = action();
      this.db.exec('COMMIT');
      return result;
    } catch (error) {
      this.db.exec('ROLLBACK');
      throw error;
    }
  }
  listProviders(): ProviderConfiguration[] {
    return this.db
      .prepare('SELECT data FROM provider_configurations')
      .all()
      .map((row) => JSON.parse(String(row.data)) as ProviderConfiguration);
  }
  saveProvider(p: ProviderConfiguration): void {
    this.db
      .prepare(
        'INSERT INTO provider_configurations VALUES(?, ?) ON CONFLICT(id) DO UPDATE SET data=excluded.data',
      )
      .run(p.id, JSON.stringify(p));
  }
  deleteProvider(id: string): void {
    this.db.prepare('DELETE FROM provider_configurations WHERE id = ?').run(id);
  }
  getSettings(): AppSettings {
    const row = this.db.prepare('SELECT data FROM application_settings WHERE id = 1').get();
    return row ? (JSON.parse(String(row.data)) as AppSettings) : { favoriteModels: [] };
  }
  saveSettings(s: AppSettings): void {
    this.db
      .prepare(
        'INSERT INTO application_settings VALUES(1, ?) ON CONFLICT(id) DO UPDATE SET data=excluded.data',
      )
      .run(JSON.stringify(s));
  }
  close(): void {
    this.db.close();
  }
}
