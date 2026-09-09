#!/usr/bin/env node
/**
 * Auto-notify on Vercel production build — only if changelog.json changed in this commit.
 * Manual: npm run changelog:notify (always posts).
 */
import { execSync, spawnSync } from 'child_process';
import { existsSync, readFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { getLatestEntry, loadChangelog } from './changelog-utils.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const CHANGELOG = 'src/data/changelog.json';

function exitLater(code) {
  setTimeout(() => process.exit(code), 50);
}

function debugLog(...args) {
  if (process.env.VERCEL_DEBUG_CHANGELOG === '1') {
    console.log('[changelog-notify]', ...args);
  }
}

function findGitRoot(start) {
  let dir = start;
  while (true) {
    if (existsSync(join(dir, '.git'))) return dir;
    const parent = dirname(dir);
    if (parent === dir) return start;
    dir = parent;
  }
}

function fileInOutput(out) {
  return out.split(/\r?\n/).some((line) => {
    const normalized = line.replace(/\\/g, '/').trim();
    if (!normalized) return false;
    return normalized === CHANGELOG || normalized.endsWith(`/${CHANGELOG}`);
  });
}

function changelogChangedViaGit(gitRoot) {
  const sha = process.env.VERCEL_GIT_COMMIT_SHA?.trim();
  const prev = process.env.VERCEL_GIT_PREVIOUS_SHA?.trim();

  const commands = [];
  if (sha && prev) {
    commands.push(`git diff --name-only ${prev} ${sha} -- ${CHANGELOG}`);
  }
  if (sha) {
    commands.push(`git diff-tree --no-commit-id --name-only -r ${sha} -- ${CHANGELOG}`);
    commands.push(`git show --name-only --pretty=format: ${sha} -- ${CHANGELOG}`);
  }
  commands.push(`git diff-tree --no-commit-id --name-only -r HEAD -- ${CHANGELOG}`);
  commands.push(`git show --name-only --pretty=format: HEAD -- ${CHANGELOG}`);
  commands.push(`git log -1 --name-only --pretty=format: -- ${CHANGELOG}`);
  commands.push(`git diff --name-only HEAD^ HEAD -- ${CHANGELOG}`);

  for (const cmd of commands) {
    try {
      const out = execSync(cmd, { cwd: gitRoot, encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] });
      debugLog('git ok:', cmd, '→', out.trim() || '(empty)');
      if (fileInOutput(out)) return true;
    } catch (e) {
      debugLog('git fail:', cmd, e?.message || e);
    }
  }
  return false;
}

async function changelogChangedViaGithubApi() {
  const sha = process.env.VERCEL_GIT_COMMIT_SHA?.trim();
  const owner = process.env.VERCEL_GIT_REPO_OWNER?.trim();
  const repo = process.env.VERCEL_GIT_REPO_SLUG?.trim();
  if (!sha || !owner || !repo) return false;

  const url = `https://api.github.com/repos/${owner}/${repo}/commits/${sha}`;
  const headers = {
    Accept: 'application/vnd.github+json',
    'User-Agent': 'nexus-changelog-notify',
    'X-GitHub-Api-Version': '2022-11-28',
  };
  const token = process.env.GITHUB_TOKEN?.trim() || process.env.VERCEL_GIT_REPO_TOKEN?.trim();
  if (token) headers.Authorization = `Bearer ${token}`;

  try {
    const res = await fetch(url, { headers });
    if (!res.ok) {
      debugLog('github api', res.status, await res.text());
      return false;
    }
    const data = await res.json();
    const files = (data.files || []).map((f) => String(f.filename || '').replace(/\\/g, '/'));
    debugLog('github api files:', files.join(', ') || '(none)');
    return files.some((f) => f === CHANGELOG || f.endsWith(`/${CHANGELOG}`));
  } catch (e) {
    debugLog('github api error', e?.message || e);
    return false;
  }
}

function readPackageVersion() {
  try {
    const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));
    return String(pkg.version || '').trim();
  } catch {
    return '';
  }
}

function shouldNotifyByVersionMarker() {
  if (process.env.VERCEL !== '1' || process.env.VERCEL_ENV !== 'production') return false;

  const { entries } = loadChangelog(root);
  const latest = getLatestEntry(entries);
  const pkgVersion = readPackageVersion();

  if (pkgVersion && latest.version && pkgVersion !== latest.version) {
    console.warn(
      `Пропуск Discord: package.json (${pkgVersion}) ≠ changelog (${latest.version}). Поднимите версии вместе.`
    );
    return false;
  }

  const notified = process.env.CHANGELOG_NOTIFIED_VERSION?.trim();
  if (!latest.version || latest.version === notified) return false;

  console.log(
    `Changelog v${latest.version} ещё не отправлялся (CHANGELOG_NOTIFIED_VERSION=${notified || 'не задан'}).`
  );
  return true;
}

async function changelogChangedInCommit() {
  if (process.env.FORCE_CHANGELOG_NOTIFY === '1') return true;

  const gitRoot = findGitRoot(root);
  const hasGit = existsSync(join(gitRoot, '.git'));

  if (hasGit && changelogChangedViaGit(gitRoot)) return true;

  if (process.env.VERCEL === '1' && (await changelogChangedViaGithubApi())) {
    console.log('Changelog изменён (GitHub API, commit ' + process.env.VERCEL_GIT_COMMIT_SHA + ').');
    return true;
  }

  if (shouldNotifyByVersionMarker()) return true;

  return false;
}

function logDiscordConfigHint() {
  const raw = process.env.DISCORD_CHANGELOG_WEBHOOK_URL;
  const hasWebhook = Boolean(raw?.trim());
  const hasBot = Boolean(process.env.DISCORD_BOT_TOKEN?.trim());
  if (hasWebhook || hasBot) return;
  if (raw !== undefined && !raw?.trim()) {
    console.warn(
      'Discord: DISCORD_CHANGELOG_WEBHOOK_URL задан в Vercel, но пустой — обновите Production env (npm run discord:sync-vercel).'
    );
    return;
  }
  console.warn(
    'Discord: нет DISCORD_CHANGELOG_WEBHOOK_URL в Production — npm run discord:sync-vercel после discord-webhook.local.json.'
  );
}

async function main() {
  if (process.env.VERCEL === '1' && process.env.VERCEL_ENV !== 'production') {
    console.log(`Пропуск Discord: Vercel env=${process.env.VERCEL_ENV || '?'} (нужен production).`);
    exitLater(0);
    return;
  }

  if (!(await changelogChangedInCommit())) {
    console.log(
      'Пропуск Discord: в этом коммите не менялся src/data/changelog.json.\n' +
        'Обновите changelog и push в main — пост уйдёт при production deploy.\n' +
        'Принудительно: FORCE_CHANGELOG_NOTIFY=1 npm run changelog:notify'
    );
    exitLater(0);
    return;
  }

  logDiscordConfigHint();

  const r = spawnSync(process.execPath, [join(root, 'scripts', 'notify-changelog.mjs')], {
    cwd: root,
    stdio: 'inherit',
    env: process.env,
  });
  exitLater(r.status ?? 1);
}

main().catch((e) => {
  console.error(e);
  exitLater(1);
});
