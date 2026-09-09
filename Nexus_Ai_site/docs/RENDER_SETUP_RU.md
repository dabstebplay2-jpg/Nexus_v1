# Render + Vercel: полный хостинг

## Важно: правильный репозиторий

| ❌ Не использовать | ✅ Использовать |
|-------------------|----------------|
| `dabstebplay2-jpg/nexus-backend` | **`dabstebplay2-jpg/nexus-cloud-server`** |
| `/api/login` | `/v1/auth/login` |

---

## Продакшен (актуально)

| Компонент | URL |
|-----------|-----|
| Фронт | https://nexus-zeta-ruby-12.vercel.app |
| Cloud | https://nexus-cloud-bxcc.onrender.com |

---

## Render — nexus-cloud

1. [dashboard.render.com](https://dashboard.render.com) → сервис **nexus-cloud**
2. Репозиторий: **`dabstebplay2-jpg/nexus-cloud-server`**, ветка `main`
3. Root Directory: **пусто** (корень репо)
4. Build: `pip install -r requirements.txt`
5. Start: `uvicorn app.main:app --host 0.0.0.0 --port $PORT`
6. Health: `/v1/health`

**Environment:**

```env
NEXUS_CLOUD_SECRET_KEY=...
ROUTER_AI_MASTER_KEY=sk-...
ROUTER_AI_BASE_URL=https://routerai.ru/api/v1
ROUTER_AI_ALLOW_PLATFORM_INFERENCE=false
NEXUS_BILLING_TEST_MODE=false
NEXUS_TESTING_MODE=false
NEXUS_CORS_ORIGINS=https://nexus-zeta-ruby-12.vercel.app
NEXUS_CLOUD_DATABASE_URL=sqlite:///./nexus_cloud_v2.db
NEXUS_REMOTE_ADMIN=true
NEXUS_ADMIN_PASSWORD=ваш-пароль
```

**Коннекторы (Gmail, GitHub, Vercel):** отдельные OAuth-переменные — полный чеклист в [nexus-cloud-server/docs/CONNECTORS_SETUP_RU.md](../nexus-cloud-server/docs/CONNECTORS_SETUP_RU.md). Проверка после деплоя: `nexus-cloud-server/scripts/check-connectors-oauth.ps1` (нужен `NEXUS_JWT`).

---

## Vercel — frontend

Репозиторий: **`dabstebplay2-jpg/nexus-frontend`**

```env
VITE_CLOUD_URL=https://nexus-cloud-bxcc.onrender.com
```

Redeploy после изменений.

---

## Локальная админка

```powershell
cd nexus-cloud-server
.\scripts\start_local_admin.ps1
```

http://127.0.0.1:8790/local-admin/

См. также `nexus-cloud-server/docs/ADMIN_RENDER_RU.md` и `DEPLOYMENT_RU.md`.
