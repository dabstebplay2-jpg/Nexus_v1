# Solo-хостинг с нуля (GitHub + Render + Vercel)

Если старые аккаунты/репозитории пропали — этот чеклист поднимает всё заново из монорепо `Nexus`.

## Что получится

| Компонент | Где | Папка в репо |
|-----------|-----|--------------|
| Сайт | Vercel | `frontend/` |
| Cloud API | Render | `nexus-cloud-server/` |
| Код | один GitHub-репозиторий | корень |

---

## 1. GitHub — новый репозиторий

```powershell
cd C:\Nexus
gh auth login          # если ещё не залогинен
gh repo create Nexus --public --description "Nexus monorepo"
git remote set-url origin https://github.com/ВАШ_ЛОГИН/Nexus.git
git push -u origin Dabsteb
git push origin main
```

На GitHub → **Settings → General → Default branch** → `main` (для Render).

---

## 2. Render — облачный API

1. [dashboard.render.com](https://dashboard.render.com) → регистрация / новый аккаунт  
2. **New +** → **Blueprint**  
3. Подключить GitHub → репозиторий **Nexus**, ветка **`main`**  
4. Render прочитает корневой [`render.yaml`](../render.yaml) и создаст:
   - Web-сервис `nexus-cloud`
   - Cron `nexus-polza-balance`

### 2a. PostgreSQL (обязательно для продакшена)

Без Postgres пользователи **сбрасываются** при каждом деплое.

1. **New +** → **PostgreSQL** → имя `nexus-cloud-db`  
2. Скопировать **Internal Database URL**  
3. Сервис `nexus-cloud` → **Environment** → `NEXUS_CLOUD_DATABASE_URL` = Internal URL  
4. **Save** → **Manual Deploy**

### 2b. Секреты на Render (минимум)

После первого деплоя скопируйте URL сервиса, например `https://nexus-cloud-xxxx.onrender.com`.

| Переменная | Значение |
|------------|----------|
| `NEXUS_CLOUD_SECRET_KEY` | случайная строка 32+ символов |
| `NEXUS_ADMIN_PASSWORD` | пароль админки |
| `NEXUS_ADMIN_GRANT_KEY` | случайный ключ для scripts |
| `NEXUS_REMOTE_ADMIN` | `true` |
| `NEXUS_CORS_ORIGINS` | URL фронта Vercel (через запятую, если несколько) |
| `POLZA_BACKEND_API_KEY` | ключ с polza.ai |
| `POLZA_MCP_TOKEN` | MCP-токен Polza |
| `POLZA_OAUTH_CALLBACK_URL` | `https://ВАШ-RENDER.onrender.com/v1/auth/polza/callback` |
| `OPENROUTER_API_KEY` | для FREE tier (openrouter.ai) |
| `OPENROUTER_HTTP_REFERER` | URL фронта Vercel |
| `YOOKASSA_SHOP_ID` + `YOOKASSA_SECRET_KEY` | оплата подписок ([`docs/YOOKASSA_RU.md`](../nexus-cloud-server/docs/YOOKASSA_RU.md)) |
| `UPSTASH_REDIS_REST_URL` + `TOKEN` | *или* Postgres выше |

Полный список: [`nexus-cloud-server/.env.example`](../nexus-cloud-server/.env.example)

Проверка:

```text
https://ВАШ-RENDER.onrender.com/v1/health
→ "database_persistent": true
```

---

## 3. Vercel — фронт

1. [vercel.com](https://vercel.com) → новый аккаунт / Import Git  
2. Репозиторий **Nexus**, Root Directory: **`frontend`** (или импорт с корневым `vercel.json`)  
3. Environment:

```env
VITE_CLOUD_URL=https://ВАШ-RENDER.onrender.com
```

4. Deploy → скопировать URL, например `https://nexus-xxx.vercel.app`  
5. Вернуться на Render → обновить `NEXUS_CORS_ORIGINS` и `OPENROUTER_HTTP_REFERER` на этот URL → redeploy

### OAuth / коннекторы

Все redirect URI в Polza, Google, GitHub, Vercel Console нужно **пересоздать** под новые домены.

| Сценарий | Документ |
|----------|----------|
| Вход через Google на сайте | [`nexus-cloud-server/docs/GOOGLE_AUTH.md`](../nexus-cloud-server/docs/GOOGLE_AUTH.md) |
| Gmail / GitHub / Vercel коннекторы | [`nexus-cloud-server/docs/CONNECTORS_SETUP_RU.md`](../nexus-cloud-server/docs/CONNECTORS_SETUP_RU.md) |

Шаблон env для Google (прод): [`nexus-cloud-server/deploy/google-oauth-production.env.example`](../nexus-cloud-server/deploy/google-oauth-production.env.example)

---

## 4. Локальная синхронизация env (опционально)

```powershell
cd nexus-cloud-server
copy .env.example .env
# заполнить секреты локально
# RENDER_API_KEY=rnd_...  — из Render Account Settings → API Keys
python scripts/push_render_env.py
```

---

## 5. Ротация секретов

Все ключи, что были в старом Render/GitHub/Vercel, считайте **скомпрометированными**:

- Polza backend / MCP  
- OpenRouter  
- ЮKassa, Resend, Discord webhooks  
- `NEXUS_CLOUD_SECRET_KEY`, admin-пароли  

См. [`nexus-cloud-server/docs/SECURITY_ROTATION_RU.md`](../nexus-cloud-server/docs/SECURITY_ROTATION_RU.md)

---

## Быстрая диагностика

| Симптом | Причина |
|---------|---------|
| CORS error в браузере | `NEXUS_CORS_ORIGINS` не совпадает с URL Vercel |
| 503 FREE AI | нет `OPENROUTER_API_KEY` на Render |
| Пользователи пропадают | нет Postgres / Upstash |
| Polza OAuth fail | неверный `POLZA_OAUTH_CALLBACK_URL` |

Локально: `nexus.bat start` → http://localhost:5173
