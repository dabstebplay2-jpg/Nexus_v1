# Nexus — актуальная схема деплоя (2026)

## Репозитории GitHub

| Репозиторий | Назначение | Не использовать |
|-------------|------------|-----------------|
| [dabstebplay2-jpg/nexus-cloud-server](https://github.com/dabstebplay2-jpg/nexus-cloud-server) | **Облачный API** (auth, billing, AI, RouterAI) | — |
| [dabstebplay2-jpg/nexus-frontend](https://github.com/dabstebplay2-jpg/nexus-frontend) | **Сайт** (Vercel) | — |
| `dabstebplay2-jpg/nexus-backend` | — | Старая заглушка `/api/login`, без ИИ |

Локальная папка `c:\nexus-ide` — монорепозиторий для разработки; в проде используются **два** отдельных GitHub-репо выше.

---

## Продакшен (сейчас)

| Сервис | URL |
|--------|-----|
| **Фронт (Vercel)** | https://nexus-zeta-ruby-12.vercel.app |
| **Cloud (Render)** | https://nexus-cloud-bxcc.onrender.com |
| **Health** | https://nexus-cloud-bxcc.onrender.com/v1/health |
| **Админ-API** | `NEXUS_REMOTE_ADMIN=true` на Render |

---

## Render — переменные окружения

```env
ROUTER_AI_MASTER_KEY=sk-...
NEXUS_CLOUD_SECRET_KEY=длинная-случайная-строка
NEXUS_CORS_ORIGINS=https://nexus-zeta-ruby-12.vercel.app
ROUTER_AI_ALLOW_PLATFORM_INFERENCE=false
NEXUS_BILLING_TEST_MODE=false
NEXUS_TESTING_MODE=false
# Вариант A — Upstash Redis (рекомендуется, если уже есть Upstash):
UPSTASH_REDIS_REST_URL=https://xxxx.upstash.io
UPSTASH_REDIS_REST_TOKEN=...
# См. docs/UPSTASH_REDIS_RU.md

# Вариант B — PostgreSQL на Render:
# NEXUS_CLOUD_DATABASE_URL=<Internal URL>
# См. docs/PERSISTENT_DATABASE_RU.md
NEXUS_REMOTE_ADMIN=true
NEXUS_ADMIN_PASSWORD=ваш-сильный-пароль
NEXUS_ADMIN_GRANT_KEY=отдельный-ключ-32-символа-для-scripts-grant_tier
```

После утечки секретов: [SECURITY_ROTATION_RU.md](SECURITY_ROTATION_RU.md).

После изменений: **Save** → **Manual Deploy**.

---

## Vercel (frontend)

```env
VITE_CLOUD_URL=https://nexus-cloud-bxcc.onrender.com
```

Без `/v1` в конце. После изменения — **Redeploy**.

---

## Локальная админка (все пользователи с сайта)

```powershell
cd nexus-cloud-server
.\scripts\start_local_admin.ps1
```

Откройте http://127.0.0.1:8790/local-admin/  
**Server API:** `https://nexus-cloud-bxcc.onrender.com`  
**Пароль:** тот же, что `NEXUS_ADMIN_PASSWORD` на Render.

Подробнее: [ADMIN_RENDER_RU.md](./ADMIN_RENDER_RU.md)

---

## Локальная разработка

```powershell
# Cloud
cd nexus-cloud-server
uvicorn app.main:app --reload --port 8080

# Frontend
cd frontend
npm run dev
# VITE_CLOUD_URL=http://127.0.0.1:8080 в .env.local
```
