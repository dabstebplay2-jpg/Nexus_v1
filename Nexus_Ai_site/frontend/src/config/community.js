/**
 * Сообщество NexusAI в Discord.
 * Постоянная ссылка: Discord → сервер NexusAI → «Пригласить людей» → скопировать.
 * На Vercel: VITE_DISCORD_INVITE_URL (Production + Preview).
 */
export const DISCORD_GUILD_ID = '1512107730427711498';
export const DISCORD_SERVER_NAME = 'NexusAI';

/** Запасной вариант, если env не задан (discord.gg/… из «Пригласить людей») */
const BUILTIN_DISCORD_INVITE = '';

export const DISCORD_INVITE_URL = (
  import.meta.env.VITE_DISCORD_INVITE_URL?.trim() ||
  BUILTIN_DISCORD_INVITE
).trim();

/** Постоянное приглашение или открытие сервера в приложении Discord */
export function getDiscordHref() {
  if (DISCORD_INVITE_URL) return DISCORD_INVITE_URL;
  return `https://discord.com/channels/${DISCORD_GUILD_ID}`;
}

export const hasDiscordInvite = () => Boolean(DISCORD_INVITE_URL);
