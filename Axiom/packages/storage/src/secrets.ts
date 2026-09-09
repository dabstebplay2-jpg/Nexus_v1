import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync, renameSync } from 'node:fs';
import { join } from 'node:path';
import type { SecretStorage } from '@axiom/shared';
/** Local single-user fallback. Replace with OS keychain for distributed desktop builds. */
export class EncryptedFileSecretStorage implements SecretStorage {
  private key: Buffer;
  private values: Record<string, string>;
  private path: string;
  constructor(directory: string) {
    const keyPath = join(directory, 'master.key');
    this.path = join(directory, 'secrets.json');
    if (!existsSync(keyPath)) {
      if (existsSync(this.path))
        throw new Error('Secret master key is missing. Restore it before starting Axiom.');
      writeFileSync(keyPath, randomBytes(32), { mode: 0o600, flag: 'wx' });
    }
    this.key = readFileSync(keyPath);
    this.values = existsSync(this.path)
      ? (JSON.parse(readFileSync(this.path, 'utf8')) as Record<string, string>)
      : {};
  }
  get(id: string): string | undefined {
    const value = this.values[id];
    if (!value) return undefined;
    const data = Buffer.from(value, 'base64');
    const decipher = createDecipheriv('aes-256-gcm', this.key, data.subarray(0, 12));
    decipher.setAuthTag(data.subarray(12, 28));
    return Buffer.concat([decipher.update(data.subarray(28)), decipher.final()]).toString('utf8');
  }
  set(id: string, secret: string): void {
    const nonce = randomBytes(12);
    const cipher = createCipheriv('aes-256-gcm', this.key, nonce);
    const encrypted = Buffer.concat([cipher.update(secret, 'utf8'), cipher.final()]);
    this.values[id] = Buffer.concat([nonce, cipher.getAuthTag(), encrypted]).toString('base64');
    this.persist();
  }
  delete(id: string): void {
    delete this.values[id];
    this.persist();
  }
  private persist(): void {
    writeFileSync(`${this.path}.tmp`, JSON.stringify(this.values), { mode: 0o600 });
    renameSync(`${this.path}.tmp`, this.path);
  }
}
