# Upstash Redis — постоянное хранение пользователей

## Как работает

При заданных `UPSTASH_REDIS_REST_URL` и `UPSTASH_REDIS_REST_TOKEN`:

1. На Render SQLite работает **в памяти** (кэш).
2. При **каждом сохранении** в БД снимок (пользователи, транзакции, счета) пишется в Upstash.
3. При **старте** сервера данные **загружаются** из Upstash.

Ключ в Redis: `nexus:v1:db_snapshot`

## Render — переменные

В сервисе **nexus-cloud** → **Environment**:

```env
UPSTASH_REDIS_REST_URL=https://proper-wildcat-141935.upstash.io
UPSTASH_REDIS_REST_TOKEN=<токен из Upstash Console → REST API>
```

**Save** → **Manual Deploy**.

## Проверка

`GET /v1/health`:

```json
"database": "upstash-redis",
"database_persistent": true,
"redis_persistence": true
```

## Локально (опционально)

Те же переменные в `nexus-cloud-server/.env` — общая база с продом (осторожно с тестами).

## Безопасность

Токен REST API — как пароль. Не коммитьте в Git. При утечке — **Reset** в Upstash Console.
