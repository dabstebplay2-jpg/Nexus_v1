#!/usr/bin/env node
/**
 * Sets GitHub Actions secret DISCORD_CHANGELOG_WEBHOOK_URL from discord-webhook.local.json
 * Requires: gh auth login
 */
import { readFileSync, existsSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { spawnSync } from 'child_process';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

function loadUrl() {
  const arg = process.argv[2]?.trim();
  if (arg?.startsWith('https://discord.com/api/webhooks/')) return arg;
  const path = join(root, 'discord-webhook.local.json');
  if (!existsSync(path)) return null;
  return JSON.parse(readFileSync(path, 'utf8')).url?.trim() || null;
}

const url = loadUrl();
if (!url) {
  console.error('Нужен url в discord-webhook.local.json или аргументом.');
  process.exit(1);
}

const r = spawnSync('gh', ['secret', 'set', 'DISCORD_CHANGELOG_WEBHOOK_URL', '--body', url], {
  cwd: root,
  stdio: 'inherit',
  encoding: 'utf8',
});
if (r.status !== 0) {
  console.error('gh secret set failed. Установите GitHub CLI: https://cli.github.com/');
  process.exit(r.status ?? 1);
}
console.log('GitHub: secret DISCORD_CHANGELOG_WEBHOOK_URL обновлён.');
console.log('Workflow: .github/workflows/frontend-discord-changelog.yml (manual fallback only)');
