#!/usr/bin/env node
/**
 * Posts the latest changelog entry to Discord (#signal).
 * Production auto-run uses Vercel. GitHub Actions is kept as manual fallback only.
 */
import { existsSync, readFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import {
  getLatestEntry,
  loadChangelog,
  sanitizeDiscordMarkdown,
  trimDiscord,
  validateChangelog,
} from './changelog-utils.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const DEFAULT_TEXT_CHANNEL_ID = '1512122313670262985';
const DEFAULT_GUILD_ID = '1512107730427711498';
const FALLBACK_SITE_URL = 'https://nexus-zeta-ruby-12.vercel.app';
const EMBED_COLOR = 0x14b8a6;
const MAX_CHANGE_LINES = 4;

function exitLater(code) {
  setTimeout(() => process.exit(code), 50);
}

function isDryRun() {
  return process.argv.includes('--dry-run') || process.env.CHANGELOG_NOTIFY_DRY_RUN === '1';
}

function isVercelBuild() {
  return process.env.VERCEL === '1';
}

function cleanSiteUrl(value) {
  const raw = String(value || '').trim();
  if (!raw) return FALLBACK_SITE_URL;
  return raw.startsWith('http') ? raw.replace(/\/+$/, '') : `https://${raw.replace(/\/+$/, '')}`;
}

function siteUrl() {
  return cleanSiteUrl(
    process.env.NEXUS_PUBLIC_SITE_URL ||
      process.env.VITE_PUBLIC_SITE_URL ||
      process.env.VERCEL_PROJECT_PRODUCTION_URL ||
      FALLBACK_SITE_URL
  );
}

function finish(code) {
  if (code !== 0 && isVercelBuild()) {
    console.warn('Discord changelog failed; Vercel build continues.');
    exitLater(0);
    return;
  }
  exitLater(code);
}

function shouldSkipAutoNotify() {
  if (isDryRun()) return false;
  if (process.env.FORCE_CHANGELOG_NOTIFY === '1') return false;
  if (process.env.CI === 'true' || process.env.GITHUB_ACTIONS === 'true') return false;
  if (isVercelBuild() && process.env.VERCEL_ENV !== 'production') {
    console.log(`Пропуск Discord: Vercel env=${process.env.VERCEL_ENV || '?'} (нужен production).`);
    return true;
  }
  return false;
}

function loadLocalJson(name) {
  const path = join(root, name);
  if (!existsSync(path)) return null;
  return JSON.parse(readFileSync(path, 'utf8'));
}

function loadWebhookConfig() {
  const rawEnv = process.env.DISCORD_CHANGELOG_WEBHOOK_URL;
  const envUrl = rawEnv?.trim();
  if (rawEnv !== undefined && !envUrl) {
    console.warn(
      'DISCORD_CHANGELOG_WEBHOOK_URL задан, но пустой. Обновите Production env на Vercel: npm run discord:sync-vercel'
    );
  }
  if (envUrl) {
    return {
      url: envUrl,
      source: 'DISCORD_CHANGELOG_WEBHOOK_URL',
      channel_id: process.env.DISCORD_CHANGELOG_CHANNEL_ID?.trim() || DEFAULT_TEXT_CHANNEL_ID,
      guild_id: process.env.DISCORD_GUILD_ID?.trim() || DEFAULT_GUILD_ID,
    };
  }

  const cfg = loadLocalJson('discord-webhook.local.json');
  if (!cfg?.url) return null;
  return {
    channel_id: DEFAULT_TEXT_CHANNEL_ID,
    guild_id: DEFAULT_GUILD_ID,
    ...cfg,
    source: 'discord-webhook.local.json',
  };
}

function loadBotConfig() {
  const envToken = process.env.DISCORD_BOT_TOKEN?.trim();
  if (envToken) {
    return {
      token: envToken,
      source: 'DISCORD_BOT_TOKEN',
      channel_id: process.env.DISCORD_CHANGELOG_CHANNEL_ID?.trim() || DEFAULT_TEXT_CHANNEL_ID,
      guild_id: process.env.DISCORD_GUILD_ID?.trim() || DEFAULT_GUILD_ID,
    };
  }

  const cfg = loadLocalJson('discord-bot.local.json');
  if (!cfg?.token) return null;
  return {
    channel_id: DEFAULT_TEXT_CHANNEL_ID,
    guild_id: DEFAULT_GUILD_ID,
    ...cfg,
    source: 'discord-bot.local.json',
  };
}

function validateBeforeSend() {
  const result = validateChangelog(root);
  for (const warning of result.warnings) {
    console.warn(`WARN ${warning}`);
  }
  if (!result.ok) {
    throw new Error(`Changelog validation failed:\n- ${result.errors.join('\n- ')}`);
  }
}

function sanitizeCodeBlockLine(value) {
  return String(value || '')
    .replace(/@everyone/g, '@\u200beveryone')
    .replace(/@here/g, '@\u200bhere')
    .replace(/`/g, "'")
    .replace(/\s+/g, ' ')
    .trim();
}

function diffPrefix(label) {
  if (label === 'Исправлено') return '-';
  if (label === 'Новое') return '+';
  return '+';
}

function buildPayload(entry) {
  const baseUrl = siteUrl();
  const updatesUrl = `${baseUrl}/updates`;
  const brandIcon = `${baseUrl}/brand/image/logo/brand.png`;
  const changes = (entry.changes || []).slice(0, MAX_CHANGE_LINES);
  const hiddenCount = Math.max(0, (entry.changes || []).length - changes.length);
  const changeLines = changes.map((change) => {
    const label = sanitizeCodeBlockLine(change.label || 'Изменение');
    const text = sanitizeCodeBlockLine(change.text);
    return `${diffPrefix(change.label)} ${label}: ${text}`;
  });
  if (hiddenCount > 0) {
    changeLines.push(`+ Еще ${hiddenCount} пункт(а) в полной истории.`);
  }

  const description = [
    `**${trimDiscord(sanitizeDiscordMarkdown(entry.title), 120)}**`,
    trimDiscord(sanitizeDiscordMarkdown(entry.summary), 700),
    changeLines.length > 0 ? `\`\`\`diff\n${changeLines.join('\n')}\n\`\`\`` : null,
    `[full changelog](${updatesUrl})`,
  ]
    .filter(Boolean)
    .join('\n\n');

  return {
    username: 'Nexus Signal',
    avatar_url: brandIcon,
    allowed_mentions: { parse: [] },
    embeds: [
      {
        title: `patch notes / nexus-ai@${entry.version}`,
        url: updatesUrl,
        description: trimDiscord(description, 4096),
        color: EMBED_COLOR,
        footer: {
          text: `${entry.date} · #signal`,
          icon_url: brandIcon,
        },
        timestamp: new Date().toISOString(),
      },
    ],
  };
}

function printSuccess(entry, message, via, extra = {}) {
  console.log(`Changelog v${entry.version} sent to Discord via ${via}.`);
  if (extra.source) console.log(`Source: ${extra.source}`);
  if (message?.channel_id) {
    const guildId = extra.guild_id || message.guild_id || DEFAULT_GUILD_ID;
    console.log(`Open message: https://discord.com/channels/${guildId}/${message.channel_id}/${message.id}`);
  }
}

async function postViaWebhook(cfg, payload, expectedChannelId) {
  const webhookBase = cfg.url.replace(/\?.*$/, '');
  const metaRes = await fetch(webhookBase);
  if (!metaRes.ok) {
    throw new Error(`Cannot read webhook: ${metaRes.status} ${await metaRes.text()}`);
  }

  const meta = await metaRes.json();
  if (meta.channel_id !== expectedChannelId) {
    return {
      ok: false,
      reason: 'wrong_channel',
      actual: meta.channel_id,
      expected: expectedChannelId,
    };
  }

  const res = await fetch(`${webhookBase}?wait=true`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`Webhook POST failed: ${res.status} ${text}`);

  const message = text ? JSON.parse(text) : null;
  if (!message?.embeds?.length) {
    throw new Error('Discord accepted message but embed is missing');
  }

  return { ok: true, message, guild_id: cfg.guild_id || meta.guild_id };
}

async function postViaBot(botCfg, payload) {
  const channelId = botCfg.channel_id || DEFAULT_TEXT_CHANNEL_ID;
  const res = await fetch(`https://discord.com/api/v10/channels/${channelId}/messages`, {
    method: 'POST',
    headers: {
      Authorization: `Bot ${botCfg.token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`Bot POST failed: ${res.status} ${text}`);
  return { ok: true, message: JSON.parse(text), guild_id: botCfg.guild_id };
}

async function run() {
  if (shouldSkipAutoNotify()) {
    finish(0);
    return;
  }

  validateBeforeSend();

  const { entries } = loadChangelog(root);
  const entry = getLatestEntry(entries);
  const payload = buildPayload(entry);

  if (isDryRun()) {
    console.log(JSON.stringify(payload, null, 2));
    finish(0);
    return;
  }

  const webhookCfg = loadWebhookConfig();
  const botCfg = loadBotConfig();
  const expectedChannelId = webhookCfg?.channel_id || botCfg?.channel_id || DEFAULT_TEXT_CHANNEL_ID;

  if (webhookCfg) {
    try {
      const result = await postViaWebhook(webhookCfg, payload, expectedChannelId);
      if (result.ok) {
        printSuccess(entry, result.message, 'webhook', {
          source: webhookCfg.source,
          guild_id: result.guild_id,
        });
        if (process.env.VERCEL === '1' && process.env.VERCEL_ENV === 'production') {
          console.log(
            `После успешной отправки задайте CHANGELOG_NOTIFIED_VERSION=${entry.version} в Vercel Production (чтобы не дублировать при redeploy).`
          );
        }
        finish(0);
        return;
      }
      console.warn(`Webhook ведёт в канал ${result.actual}, нужен ${result.expected}. Пробую бота.`);
    } catch (e) {
      console.warn(`Webhook: ${e.message}. Пробую бота.`);
    }
  }

  if (botCfg) {
    try {
      const result = await postViaBot(botCfg, payload);
      printSuccess(entry, result.message, 'bot', {
        source: botCfg.source,
        guild_id: result.guild_id,
      });
      finish(0);
      return;
    } catch (e) {
      console.error(`Bot: ${e.message}`);
      finish(1);
      return;
    }
  }

  console.error(`Не удалось отправить ченджлог: нет webhook/bot config для #signal (${expectedChannelId}).`);
  finish(1);
}

run().catch((e) => {
  console.error(e);
  finish(1);
});
