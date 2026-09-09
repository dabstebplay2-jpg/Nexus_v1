# Админ-панель Nexus на Render

## URL

| Среда | Адрес |
|-------|--------|
| **Production** | https://nexus-cloud-bxcc.onrender.com/local-admin/ |
| **Локально** | `.\scripts\start_local_admin.ps1` → http://127.0.0.1:8790/local-admin/ |

Пароль: переменная `NEXUS_ADMIN_PASSWORD` на Render (или в `.env` локально).

## Включение на Render

1. https://dashboard.render.com → сервис **nexus-cloud** → **Environment**
2. Добавьте:

| Key | Value |
|-----|--------|
| `NEXUS_REMOTE_ADMIN` | `true` |
| `NEXUS_ADMIN_PASSWORD` | ваш надёжный пароль (мин. 12 символов в production) |

3. **Save Changes** → **Manual Deploy** (deploy latest `main`)

Сборка на Render: `cd admin_ui && npm ci && npm run build` + `pip install`.

## Возможности (v2)

- **Обзор** — KPI, графики регистраций, тарифов, выручки (Recharts)
- **Пользователи** — поиск по email / @telegram, выдача и отзыв тарифов, баланс, пароль
- **Отвязка Telegram / Google** — без удаления аккаунта
- **Удаление аккаунта** — полный каскад (чаты, артефакты, тикеты, транзакции)
- **Транзакции, счета, поддержка, RouterAI, аудит, логи**
- **Ctrl+K** — быстрый поиск пользователя

## API (для скриптов)

Заголовок: `X-Admin-Password: <пароль>`

```powershell
Invoke-RestMethod -Uri "https://nexus-cloud-bxcc.onrender.com/v1/local-admin/status" `
  -Headers @{ "X-Admin-Password" = "ваш-пароль" }
```

Новые эндпоинты:

- `POST /v1/local-admin/users/{id}/unlink-telegram`
- `POST /v1/local-admin/users/{id}/unlink-google`
- `GET /v1/local-admin/analytics/summary`
- `GET /v1/local-admin/analytics/registrations?days=30`

## Локальная разработка UI

```bash
cd nexus-cloud-server/admin_ui
npm install
npm run dev    # Vite :5174, proxy → :8790
npm run build  # dist/ для FastAPI
```

## Важно

- На Render **не** нужен `NEXUS_LOCAL_ADMIN=true` — достаточно `NEXUS_REMOTE_ADMIN`.
- `NEXUS_LOCAL_ADMIN=true` локально включает ещё прокси `/v1/admin-cloud-proxy` для удалённого API.
- Старый vanilla UI сохранён в `admin_ui/legacy/` (fallback, если нет `dist/`).

## Типичные задачи

### Отвязать Telegram от shadow-аккаунта

1. Пользователи → найти `tg*@tg.nexus` или @username
2. Открыть карточку → **Отвязать Telegram** или **Удалить навсегда**

### Выдать тариф

Пользователи → карточка → кнопки `HOBBY` / `PRO` / … или `FREE` для отзыва.
