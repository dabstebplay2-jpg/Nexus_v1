#!/usr/bin/env node
/**
 * Creates a channel webhook on #signal via bot token and writes discord-webhook.local.json
 */
import { writeFileSync, existsSync, readFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const TEXT_CHANNEL_ID = '1512122313670262985';
const GUILD_ID = '1512107730427711498';

function loadBotConfig() {
  if (process.env.DISCORD_BOT_TOKEN?.trim()) {
    return { token: process.env.DISCORD_BOT_TOKEN.trim() };
  }
  const path = join(root, 'discord-bot.local.json');
  if (!existsSync(path)) return null;
  const cfg = JSON.parse(readFileSync(path, 'utf8'));
  return cfg.token ? cfg : null;
}

function exitLater(code) {
  setTimeout(() => process.exit(code), 50);
}

const bot = loadBotConfig();
if (!bot) {
  console.error(
    'Нужен Bot Token в frontend/discord-bot.local.json:\n' +
      '{ "token": "...", "channel_id": "' +
      TEXT_CHANNEL_ID +
      '" }\n' +
      'Developer Portal → Nexus AI Bot → Бот → Reset Token'
  );
  exitLater(1);
} else {
  (async () => {
    const res = await fetch(`https://discord.com/api/v10/channels/${TEXT_CHANNEL_ID}/webhooks`, {
      method: 'POST',
      headers: {
        Authorization: `Bot ${bot.token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ name: 'Nexus Changelog' }),
    });
    const text = await res.text();
    if (!res.ok) {
      console.error('Не удалось создать вебхук:', res.status, text);
      console.error('У бота должно быть право «Управлять вебхуками» на сервере.');
      exitLater(1);
      return;
    }
    const hook = JSON.parse(text);
    const url = `https://discord.com/api/webhooks/${hook.id}/${hook.token}`;
    const out = {
      name: hook.name,
      channel_id: TEXT_CHANNEL_ID,
      guild_id: GUILD_ID,
      id: hook.id,
      url,
    };
    writeFileSync(join(root, 'discord-webhook.local.json'), JSON.stringify(out, null, 2) + '\n');
    console.log('Готово: вебхук создан на #signal.');
    console.log('Сохранено: frontend/discord-webhook.local.json');
    console.log('Запустите: npm run changelog:notify');
    exitLater(0);
  })().catch((e) => {
    console.error(e);
    exitLater(1);
  });
}
