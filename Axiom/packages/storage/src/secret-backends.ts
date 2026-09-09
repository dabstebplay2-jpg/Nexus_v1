import type { SecretStorage } from '@axiom/shared';
import { EncryptedFileSecretStorage } from './secrets.js';
export interface SecretStorageOptions {
  backend: string;
  directory: string;
}
export type SecretStorageFactory = (options: SecretStorageOptions) => SecretStorage;
/** OS backends plug in here. Unsupported choices fail explicitly, never silently downgrade. */
export class SecretStorageRegistry {
  private backends = new Map<string, SecretStorageFactory>();
  register(name: string, factory: SecretStorageFactory): void {
    if (this.backends.has(name)) throw new Error(`Secret backend already registered: ${name}`);
    this.backends.set(name, factory);
  }
  create(options: SecretStorageOptions): SecretStorage {
    const factory = this.backends.get(options.backend);
    if (!factory)
      throw new Error(`Secret backend unavailable: ${options.backend}. No fallback was applied.`);
    return factory(options);
  }
}
export function createSecretStorageRegistry(): SecretStorageRegistry {
  const registry = new SecretStorageRegistry();
  registry.register(
    'encrypted-file',
    (options) => new EncryptedFileSecretStorage(options.directory),
  );
  return registry;
}
