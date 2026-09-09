# Коннекторы Nexus — настройка OAuth

Коннекторы (Gmail, GitHub, Vercel, Discord) работают через **nexus-cloud-server**. Фронт только вызывает API `GET/POST /v1/connectors/*`.

**Не путать** с входом Google (`GOOGLE_CLIENT_*`) — для коннектора Gmail нужны отдельные переменные `GOOGLE_CONNECTOR_*` или те же client id с другим redirect URI.

## Переменные на Render (сервис nexus-cloud)

| Переменная | Назначение |
|------------|------------|
| `GOOGLE_CONNECTOR_CLIENT_ID` | OAuth Client ID (Gmail + Calendar readonly) |
| `GOOGLE_CONNECTOR_CLIENT_SECRET` | Секрет |
| `GOOGLE_CONNECTOR_REDIRECT_URI` | `https://<cloud-host>/v1/connectors/google_workspace/callback` |
| `GITHUB_CLIENT_ID` | GitHub OAuth App |
| `GITHUB_CLIENT_SECRET` | Секрет |
| `GITHUB_REDIRECT_URI` | `https://<cloud-host>/v1/connectors/github/callback` |
| `VERCEL_CLIENT_ID` | Vercel Integration OAuth |
| `VERCEL_CLIENT_SECRET` | Секрет |
| `VERCEL_REDIRECT_URI` | `https://<cloud-host>/v1/connectors/vercel/callback` |
| `NEXUS_FRONTEND_URL` | URL сайта (Vercel), для редиректа после OAuth |
| `NEXUS_CLOUD_SECRET_KEY` | Обязателен для шифрования токенов коннекторов |

Прод-пример cloud host: `https://nexus-cloud-bxcc.onrender.com`

После изменения env — **Manual Deploy** на Render.

## Google Cloud (коннектор Gmail)

1. [Credentials](https://console.cloud.google.com/apis/credentials) → OAuth 2.0 Client.
2. **Authorized redirect URIs:**  
   `https://nexus-cloud-bxcc.onrender.com/v1/connectors/google_workspace/callback`
3. Включить APIs: Gmail API, Google Calendar API.
4. Scopes (запрашиваются сервером): `gmail.readonly`, `calendar.readonly`.

## GitHub

1. Settings → Developer settings → OAuth Apps → New.
2. **Authorization callback URL:**  
   `https://nexus-cloud-bxcc.onrender.com/v1/connectors/github/callback`
3. Scopes: `repo`, `read:user`.

## Vercel

1. [Vercel Integrations](https://vercel.com/docs/integrations) → создать OAuth integration.
2. Redirect URI:  
   `https://nexus-cloud-bxcc.onrender.com/v1/connectors/vercel/callback`

## Discord

OAuth не нужен. Пользователь вставляет **Webhook URL** в настройках (канал → Интеграции → Вебхуки).

## Проверка

```bash
# Авторизованный запрос (Bearer token)
curl -s -H "Authorization: Bearer <JWT>" https://nexus-cloud-bxcc.onrender.com/v1/connectors | jq '.oauth_status'
```

Ожидается `"mvp_oauth_ready": true` и `providers` с `true` для google/github/vercel.

## Локальная разработка

В `nexus-cloud-server/.env` (см. `.env.example`):

```env
GOOGLE_CONNECTOR_REDIRECT_URI=http://127.0.0.1:8080/v1/connectors/google_workspace/callback
GITHUB_REDIRECT_URI=http://127.0.0.1:8080/v1/connectors/github/callback
VERCEL_REDIRECT_URI=http://127.0.0.1:8080/v1/connectors/vercel/callback
NEXUS_FRONTEND_URL=http://localhost:5173
```

Фронт: `npm run dev` (5173). Cloud: `uvicorn app.main:app --port 8080`.

## Чат

1. Тариф **Hobby+** для подключения MVP-коннекторов.
2. После OAuth включить **«В чате»** на карточке.
3. Выбрать модель с пометкой **Tools** в селекторе моделей.

См. также [GOOGLE_AUTH.md](./GOOGLE_AUTH.md) (вход на сайт).
