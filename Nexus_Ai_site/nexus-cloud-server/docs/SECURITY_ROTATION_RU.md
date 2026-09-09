# Ротация секретов после аудита (фаза 0)

Выполните вручную на [Render Dashboard](https://dashboard.render.com) → сервис **nexus-cloud** → **Environment**.

## Обязательно

1. **ROUTER_AI_MASTER_KEY** — RouterAI → Настройки → Мастер-ключи → создать новый → вставить в Render → удалить старый ключ в RouterAI.
2. **NEXUS_CLOUD_SECRET_KEY** — сгенерировать длинную случайную строку (≥ 32 символа), не использовать `change-me` / `SUPER_SECRET_*`.
3. **NEXUS_ADMIN_PASSWORD** — сильный пароль (≥ 16 символов), тот же в локальном `.env` для админки.

## Проверка флагов (должно быть)

| Переменная | Значение |
|------------|----------|
| `NEXUS_TESTING_MODE` | `false` |
| `NEXUS_BILLING_TEST_MODE` | `false` |
| `ROUTER_AI_ALLOW_PLATFORM_INFERENCE` | `false` |
| `NEXUS_CORS_ORIGINS` | URL вашего Vercel-фронта (без `*`) |

## База данных

- **PostgreSQL:** `NEXUS_CLOUD_DATABASE_URL` = Internal URL из Render Postgres.
- **Или Upstash:** `UPSTASH_REDIS_REST_URL` + `UPSTASH_REDIS_REST_TOKEN` (см. [UPSTASH_REDIS_RU.md](UPSTASH_REDIS_RU.md)).

Не оставляйте `sqlite:///./nexus_cloud_v2.db` на Render — данные сбрасываются при деплое.

## Внутренняя выдача тарифа

Задайте отдельный ключ (не мастер RouterAI):

```env
NEXUS_ADMIN_GRANT_KEY=<случайная-строка-32+>
```

Скрипт: `python scripts/grant_tier.py user@example.com ULTRA` (использует `X-Grant-Key`).

После изменений: **Save** → **Manual Deploy**.
