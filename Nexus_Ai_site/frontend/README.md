# Nexus Frontend

Веб-клиент Nexus: чат, тарифы, Research, профиль.

| | |
|--|--|
| GitHub | [dabstebplay2-jpg/nexus-frontend](https://github.com/dabstebplay2-jpg/nexus-frontend) |
| Прод (Vercel) | https://nexus-zeta-ruby-12.vercel.app |
| Cloud API | https://nexus-cloud-bxcc.onrender.com |

## Vercel — переменные

```env
VITE_CLOUD_URL=https://nexus-cloud-bxcc.onrender.com
```

Для **авто-уведомлений в Discord** (#signal) при production-деплое (если в коммите менялся `changelog.json`):

```env
DISCORD_CHANGELOG_WEBHOOK_URL=https://discord.com/api/webhooks/...
```

Только **Production** в настройках Vercel. Подробнее: [docs/DISCORD_CHANGELOG_AUTO.md](docs/DISCORD_CHANGELOG_AUTO.md).

Не задавайте `VITE_TESTING_MODE` в продакшене.

## Локально

```powershell
npm ci
cp .env.example .env.local
npm run dev
```

`VITE_CLOUD_URL=http://127.0.0.1:8080` — если cloud запущен локально.

## Деплой

```powershell
vercel deploy --prod
```

Или push в `main` — автодеплой Vercel и пост в Discord (если обновлён `src/data/changelog.json` и задан `DISCORD_CHANGELOG_WEBHOOK_URL`).

Документация cloud: [nexus-cloud-server/docs/DEPLOYMENT_RU.md](https://github.com/dabstebplay2-jpg/nexus-cloud-server/blob/main/docs/DEPLOYMENT_RU.md)
