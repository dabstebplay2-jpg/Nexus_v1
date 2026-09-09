#!/usr/bin/env node
/** VITE_DISCORD_INVITE_URL → Vercel (production + preview) */
import { spawnSync } from 'child_process';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const url = process.argv[2]?.trim();

if (!url?.startsWith('https://discord.gg/') && !url?.startsWith('https://discord.com/invite/')) {
  console.error('Usage: node scripts/discord-sync-invite-env.mjs "https://discord.gg/..."');
  process.exit(1);
}

for (const env of ['production', 'preview']) {
  const r = spawnSync(
    'vercel',
    ['env', 'add', 'VITE_DISCORD_INVITE_URL', env, '--force'],
    { cwd: root, input: `${url}\n`, encoding: 'utf8', shell: true }
  );
  if (r.stdout) process.stdout.write(r.stdout);
  if (r.stderr) process.stderr.write(r.stderr);
  if (r.status !== 0) process.exit(r.status ?? 1);
  console.log(`Vercel ${env}: VITE_DISCORD_INVITE_URL ok`);
}
