# Nexus Cloud Server

**Это и есть бэкенд** для сайта на Vercel (чат, аккаунты, модели, тарифы).  
Не путать с репозиторием `nexus-backend` — там старая заглушка без `/v1` и без ИИ.

| | |
|--|--|
| GitHub | `dabstebplay2-jpg/nexus-cloud-server` |
| Прод (Render) | https://nexus-cloud-bxcc.onrender.com |
| Health | https://nexus-cloud-bxcc.onrender.com/v1/health |

Облачный API: регистрация, вход, тарифы, RouterAI, каталог моделей.

Полная схема деплоя: [docs/DEPLOYMENT_RU.md](docs/DEPLOYMENT_RU.md)

## Render (рекомендуется)

> **Python:** в корне есть `.python-version` (`3.12.11`). Без этого Render по умолчанию ставит 3.14 и сборка `pydantic` падает.

1. [Render Dashboard](https://dashboard.render.com) → **New** → **Web Service**
2. Репозиторий: **`dabstebplay2-jpg/nexus-cloud-server`**, ветка `main`
3. **Root Directory:** оставьте пустым (корень репозитория)
4. **Build:** `pip install -r requirements.txt`
5. **Start:** `uvicorn app.main:app --host 0.0.0.0 --port $PORT`
6. **Health Check:** `/v1/health`
7. **Environment** (секреты вручную):
   - `ROUTER_AI_MASTER_KEY` — мастер-ключ RouterAI
   - `NEXUS_CLOUD_SECRET_KEY` — случайная строка
   - `NEXUS_CORS_ORIGINS` — `https://nexus-zeta-ruby-12.vercel.app`
   - `NEXUS_REMOTE_ADMIN` — `true` (API админки на Render; UI остаётся на ПК)
   - `NEXUS_ADMIN_PASSWORD` — пароль админ-панели
8. **Прод на Render:** подключите **PostgreSQL** → `NEXUS_CLOUD_DATABASE_URL` = Internal URL ([инструкция](docs/PERSISTENT_DATABASE_RU.md)). SQLite на Render **не сохраняет** пользователей после деплоя.
9. **Локально:** `sqlite:///./nexus_cloud_v2.db` в `.env`

Или: **New → Blueprint** → этот репозиторий (файл `render.yaml`).

### Режим тестирования (опционально, не для продакшена)

```env
NEXUS_TESTING_MODE=true
```

Только для отладки: ULTRA всем, `/v1/testing/*`. В продакшене держите `false`.

## Vercel (фронт)

В проекте frontend задайте:

```env
VITE_CLOUD_URL=https://nexus-cloud-bxcc.onrender.com
```

Пересоберите деплой.

## Локально

```bash
cp .env.example .env
pip install -r requirements.txt
uvicorn app.main:app --reload --port 8080
```

Проверка: http://127.0.0.1:8080/v1/health  
Админка: `.\scripts\start_local_admin.ps1` → http://127.0.0.1:8790/local-admin/

### Локальная админка

В `.env`:

```env
NEXUS_LOCAL_ADMIN=true
NEXUS_ADMIN_PASSWORD=ваш-пароль
```

Запуск:

```powershell
.\scripts\start_local_admin.ps1
```

Откройте **http://127.0.0.1:8790/local-admin/** — в поле **Server API** укажите Render (`https://nexus-cloud-bxcc.onrender.com`), тот же пароль.

На **Render** (Environment):

```env
NEXUS_REMOTE_ADMIN=true
NEXUS_ADMIN_PASSWORD=тот-же-пароль-что-в-локальном-.env
```

Пересоберите сервис. Тогда админка на ПК видит **всех** пользователей с сайта; список обновляется каждые 3 с (Live).

На Render **не** включайте `NEXUS_LOCAL_ADMIN` — только `NEXUS_REMOTE_ADMIN`.

## Оплата (ЮKassa)

Инструкция: [docs/YOOKASSA_RU.md](docs/YOOKASSA_RU.md)

## API

- `POST /v1/auth/register`, `POST /v1/auth/login`
- `GET /v1/billing/catalog`, `POST /v1/billing/subscribe`, webhook `/v1/billing/yookassa/webhook`
- `GET /v1/ai/models`, `POST /v1/ai/chat/completions`
