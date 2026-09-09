import { mkdirSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { SQLiteStorage, createSecretStorageRegistry } from '@axiom/storage';
import { AXIOM_VERSION } from '@axiom/shared';
import { createApp } from './app';
const root = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
const data = resolve(process.env.AXIOM_DATA_DIR ?? resolve(root, '.axiom'));
mkdirSync(data, { recursive: true, mode: 0o700 });
const storage = new SQLiteStorage(resolve(data, 'axiom.sqlite'));
const { app, core } = createApp(
  storage,
  createSecretStorageRegistry().create({
    backend: process.env.AXIOM_SECRET_BACKEND ?? 'encrypted-file',
    directory: data,
  }),
  resolve(root, 'apps/chat/dist'),
);
const port = Number(process.env.PORT ?? 3001);
const server = app.listen(port, '127.0.0.1', () => {
  const address = server.address();
  console.log(
    `Axiom ${AXIOM_VERSION}: http://127.0.0.1:${typeof address === 'object' && address ? address.port : port}`,
  );
});
for (const signal of ['SIGINT', 'SIGTERM'] as const)
  process.on(signal, () => {
    core.stopAll();
    server.close(() => {
      storage.close();
      process.exit(0);
    });
    setTimeout(() => process.exit(0), 3000).unref();
  });
