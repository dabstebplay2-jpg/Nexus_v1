# Почему пропадают аккаунты и как исправить

## Причина

На **Render** (и Vercel) файл SQLite `nexus_cloud_v2.db` лежит во **временной** файловой системе контейнера.

При каждом:

- Manual Deploy  
- автодеплое после `git push`  
- «пробуждении» сервиса после сна (Free tier)  

диск **обнуляется** → все пользователи исчезают → нужно регистрироваться заново.

Это **не баг входа**, а отсутствие постоянного хранилища.

---

## Решение: PostgreSQL на Render (рекомендуется)

### Шаг 1 — создать базу

1. [dashboard.render.com](https://dashboard.render.com) → **New +** → **PostgreSQL**  
2. Имя, например `nexus-cloud-db`, план **Free** (или платный)  
3. **Create Database**  
4. Откройте базу → скопируйте **Internal Database URL**  
   (вид `postgresql://user:pass@dpg-xxx-a/nexus_cloud`)

### Шаг 2 — привязать к сервису nexus-cloud

1. Сервис **nexus-cloud** (Web) → **Environment**  
2. Переменная **`NEXUS_CLOUD_DATABASE_URL`** = вставьте **Internal Database URL**  
   (можно `postgres://...` — сервер сам заменит на `postgresql://`)  
3. **Удалите** или замените старое значение `sqlite:///./nexus_cloud_v2.db`  
4. **Save Changes** → **Manual Deploy**

### Шаг 3 — проверка

Откройте:

https://nexus-cloud-bxcc.onrender.com/v1/health

Должно быть:

```json
"database": "postgresql",
"database_persistent": true
```

Если `"database": "sqlite"` и `"database_persistent": false` — Postgres ещё не подключён.

### Шаг 4 — один раз заново

Пользователи, созданные **до** Postgres, уже потеряны. После подключения БД **новые** регистрации сохраняются навсегда (пока жива база Render).

---

## Локальная разработка

В `.env` оставьте SQLite:

```env
NEXUS_CLOUD_DATABASE_URL=sqlite:///./nexus_cloud_v2.db
```

Локальный файл `nexus_cloud_v2.db` в папке `nexus-cloud-server` **сохраняется** на вашем ПК.

---

## Альтернатива: Neon / Supabase

1. Создайте проект PostgreSQL на [neon.tech](https://neon.tech) или Supabase  
2. Скопируйте connection string  
3. В Render → `NEXUS_CLOUD_DATABASE_URL` = эта строка  
4. Manual Deploy  

---

## Persistent Disk + SQLite (не рекомендуем)

Только на **платном** Render: диск `/data` +  
`NEXUS_CLOUD_DATABASE_URL=sqlite:////data/nexus_cloud_v2.db`  

Проще и надёжнее — **PostgreSQL**.
