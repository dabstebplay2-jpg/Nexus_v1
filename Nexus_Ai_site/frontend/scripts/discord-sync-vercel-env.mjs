#!/usr/bin/env node
/**
 * Pushes discord-webhook.local.json → Vercel DISCORD_CHANGELOG_WEBHOOK_URL (production).
 * Usage: node scripts/discord-sync-vercel-env.mjs [webhook-url]
 */
import { readFileSync, existsSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { spawnSync } from 'child_process';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

function loadVercelScope() {
  const projectPath = join(root, '.vercel', 'project.json');
  if (!existsSync(projectPath)) return null;
  try {
    const cfg = JSON.parse(readFileSync(projectPath, 'utf8'));
    return cfg.orgId || null;
  } catch {
    return null;
  }
}

function loadUrl() {
  const arg = process.argv[2]?.trim();
  if (arg?.startsWith('https://discord.com/api/webhooks/')) return arg;
  const path = join(root, 'discord-webhook.local.json');
  if (!existsSync(path)) return null;
  const cfg = JSON.parse(readFileSync(path, 'utf8'));
  return cfg.url?.trim() || null;
}

const url = loadUrl();
if (!url) {
  console.error(
    'Укажите URL вебхука:\n' +
      '  node scripts/discord-sync-vercel-env.mjs "https://discord.com/api/webhooks/..."\n' +
      'или сохраните url в discord-webhook.local.json (см. discord-webhook.local.json.example).'
  );
  process.exit(1);
}

const scope = loadVercelScope();
const vercelArgs = ['env', 'add', 'DISCORD_CHANGELOG_WEBHOOK_URL', 'production', '--force'];
if (scope) vercelArgs.push('--scope', scope);

const r = spawnSync('vercel', vercelArgs, { cwd: root, input: url + '\n', encoding: 'utf8' });
if (r.stdout) process.stdout.write(r.stdout);
if (r.stderr) process.stderr.write(r.stderr);
if (r.status !== 0) {
  console.error('vercel env add failed. Запустите: vercel link --yes && vercel login');
  process.exit(r.status ?? 1);
}
console.log('Vercel: DISCORD_CHANGELOG_WEBHOOK_URL обновлён (production).');
console.log('Проверка: npm run changelog:notify -- --dry-run');
