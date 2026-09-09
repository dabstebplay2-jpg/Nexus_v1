# Деплой Nexus на Vercel + Render

## Архитектура

```
Браузер → Vercel (frontend) → Render (nexus-cloud-server) → RouterAI
```

| Компонент | Где | Репозиторий |
|-----------|-----|-------------|
| **frontend** | Vercel | `dabstebplay2-jpg/nexus-frontend` |
| **cloud API** | Render | `dabstebplay2-jpg/nexus-cloud-server` |

**Прод:**

- Фронт: https://nexus-zeta-ruby-12.vercel.app  
- Cloud: https://nexus-cloud-bxcc.onrender.com  

---

## Vercel

**Environment Variables:**

| Переменная | Значение |
|------------|----------|
| `VITE_CLOUD_URL` | `https://nexus-cloud-bxcc.onrender.com` |

```powershell
cd frontend
vercel deploy --prod
```

---

## Render

См. [RENDER_SETUP_RU.md](./RENDER_SETUP_RU.md) и [nexus-cloud-server/docs/DEPLOYMENT_RU.md](../nexus-cloud-server/docs/DEPLOYMENT_RU.md).

---

## Ветка `Dabsteb` → прод (чат UX, коннекторы)

Рабочая ветка фронта и монорепо: **`Dabsteb`**. После мержа в `main` Vercel пересобирает прод автоматически (если проект привязан к `main`).

```powershell
git checkout Dabsteb
git pull origin Dabsteb
# PR в main (рекомендуется)
gh pr create --base main --head Dabsteb --title "Chat UX: stop, statuses, banners" --body "Stop generation, stream statuses, tools hint, warm-up, limit banner."
# После merge — дождаться деплоя в Vercel Dashboard → Deployments
```

Ручной прод-деплой без merge (только если нужно срочно с ветки):

```powershell
cd frontend
vercel deploy --prod
```

---

## Проверка

1. https://nexus-zeta-ruby-12.vercel.app — регистрация  
2. DevTools → Network → `https://nexus-cloud-bxcc.onrender.com/v1/...`  
3. https://nexus-cloud-bxcc.onrender.com/v1/health → `"status":"ok"`  

---

## Локально

```powershell
# Cloud :8080
cd nexus-cloud-server && uvicorn app.main:app --port 8080

# Frontend :5173
cd frontend && npm run dev
```

`frontend/.env.local`: `VITE_CLOUD_URL=http://127.0.0.1:8080`
