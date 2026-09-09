# Ченджлог и Discord #signal

## Как добавить релиз

1. В `package.json` поднимите `version`.
2. В `src/data/changelog.json` добавьте новую запись первой в `entries`.
3. Проверьте локально:

```bash
npm run changelog:validate
npm run changelog:notify -- --dry-run
```

4. Commit + push в `main`.

## Что постит в Discord

Основной авто-постер только один: Vercel production build.

```txt
vercel.json -> npm run build -> npm run changelog:notify:on-deploy
```

`changelog:notify:on-deploy` отправляет пост только когда в коммите менялся
`src/data/changelog.json`. Preview-деплои не шлют сообщения.

GitHub Actions оставлен только как ручной fallback:

```txt
Actions -> Discord changelog -> Run workflow
```

Так не будет дублей: push не постит одновременно через GitHub Actions и Vercel.

## Discord-сообщение

`scripts/notify-changelog.mjs` отправляет один embed:

- заголовок релиза `vX.Y.Z`;
- короткое поле `Главное`;
- сгруппированные блоки `Новое`, `Улучшено`, `Исправлено`;
- ссылка на `/updates`;
- `allowed_mentions: { parse: [] }`, чтобы changelog не мог пинговать сервер.

## Секреты

### Vercel

Environment Variable для Production:

```txt
DISCORD_CHANGELOG_WEBHOOK_URL=https://discord.com/api/webhooks/...
```

Можно обновить из локального `discord-webhook.local.json`:

```bash
npm run discord:sync-vercel
```

Если переменная на Vercel **есть, но пустая** (`vercel env pull` покажет `""`), пост не уйдёт.
Скопировать тот же URL, что в GitHub secret:

```bash
# GitHub Actions → Sync Discord webhook to Vercel → Run workflow
# (нужны secrets: DISCORD_CHANGELOG_WEBHOOK_URL, VERCEL_TOKEN)
```

Или локально: `vercel link`, затем `npm run discord:sync-vercel`.

На Vercel билд без `.git` детектит changelog через **GitHub API** (`VERCEL_GIT_COMMIT_SHA`).

Если git/API недоступны (CLI deploy), срабатывает fallback: `package.json` version ≠ `CHANGELOG_NOTIFIED_VERSION` в Vercel Production. После успешного поста обновите `CHANGELOG_NOTIFIED_VERSION` на текущую версию (workflow **Sync Discord webhook to Vercel** выставляет webhook и базовый marker).

### GitHub fallback

```bash
npm run discord:sync-github
```

## Канал

Канал `#signal`:

```txt
guild_id: 1512107730427711498
channel_id: 1512122313670262985
```

Если webhook удалён или ведёт не туда:

1. Discord -> `#signal` -> настройки канала -> Интеграции -> Вебхуки -> создать.
2. Сохранить URL в `discord-webhook.local.json`.
3. `npm run discord:sync-vercel`.
4. Проверить без отправки: `npm run changelog:notify -- --dry-run`.
5. Проверить реальную отправку: `npm run changelog:notify`.
