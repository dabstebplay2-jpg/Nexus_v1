# Telegram-бот Nexus

Бот — **второй канал** к тому же аккаунту: тот же тариф, пул ИИ и баланс пополнения. Регистрация и оплата — только на сайте.

## 1. BotFather

1. Откройте [@BotFather](https://t.me/BotFather) → `/newbot`.
2. Сохраните **токен** (`TELEGRAM_BOT_TOKEN`).
3. Задайте username бота → `TELEGRAM_BOT_USERNAME` (без `@`).

Опционально: `/setcommands` — login, balance, profile, tariffs, model, image.

**Login Widget на сайте:** в BotFather выполните `/setdomain` → `nexus-zeta-ruby-12.vercel.app`

## 2. Переменные на Render

| Переменная | Описание |
|------------|----------|
| `TELEGRAM_BOT_TOKEN` | Токен от BotFather |
| `TELEGRAM_WEBHOOK_SECRET` | Случайная строка (проверка заголовка webhook) |
| `TELEGRAM_BOT_USERNAME` | Username бота для deep-link `t.me/...` |
| `UPSTASH_REDIS_REST_URL` | Уже нужен для токенов привязки (TTL 15 мин) |
| `UPSTASH_REDIS_REST_TOKEN` | Пара к Redis |

После деплоя с новым кодом:

```bash
cd nexus-cloud-server
pip install -r requirements.txt
python scripts/telegram_set_webhook.py set
python scripts/telegram_set_webhook.py info
```

Webhook URL: `https://nexus-cloud-bxcc.onrender.com/v1/telegram/webhook`

Удалить webhook: `python scripts/telegram_set_webhook.py delete`

## 3. Поток пользователя

### Сайт → Telegram (привязка)
1. Регистрация и оплата на [сайте](https://nexus-zeta-ruby-12.vercel.app).
2. **Настройки → Аккаунт → Подключить Telegram** — ссылка `t.me/Bot?start=TOKEN`.
3. В боте `/start TOKEN` — привязка `telegram_id` к `user_id`.

### Telegram → сайт (регистрация/вход)
1. Напишите боту `/start` — создаётся FREE-аккаунт.
2. Кнопка **«Открыть Nexus»** — вход на сайт (exchange code, ~2 мин).
3. Или на сайте: **Войти → Telegram Login Widget**.

### Чат в боте
Текст → ответ ИИ; `/balance`, `/profile`, `/tariffs`, `/model`, `/image`, `/login`.

Аккаунт только из Telegram: добавьте email в **Настройки → Аккаунт** перед оплатой.

## 4. API

- `POST /v1/telegram/link-token` (JWT) → `{ url, expires_in, bot_username }`
- `POST /v1/telegram/webhook` — только Telegram (secret header)
- `POST /v1/auth/telegram/login` — Login Widget (HMAC)
- `POST /v1/auth/telegram/exchange` — magic-link из бота
- `POST /v1/auth/email/bind-request` / `bind-verify` — email для TG-only аккаунтов

Профиль: `telegram_linked`, `telegram_username`, `needs_real_email`.

## 5. Админка: отвязка Telegram

Если пользователь ошибочно создал отдельный TG-аккаунт через `/login` в боте:

1. [Админ-панель](https://nexus-cloud-bxcc.onrender.com/local-admin/) → **Пользователи**
2. Найти shadow (`tg123@tg.nexus`) или по @username
3. **Отвязать Telegram** — освобождает TG для привязки к email-аккаунту
4. Или **Удалить навсегда** — полное удаление с каскадом

Документация: `docs/ADMIN_RENDER_RU.md`

## 6. Отладка

| Симптом | Что проверить |
|---------|----------------|
| Бот молчит | `getWebhookInfo`, логи Render, `TELEGRAM_BOT_TOKEN` |
| 403 webhook | `TELEGRAM_WEBHOOK_SECRET` совпадает с `setWebhook secret_token` |
| «Ссылка истекла» | Новая ссылка в настройках (15 мин) |
| 429 в боте | Лимит 20 сообщений/мин на `telegram_id` |
| ИИ 403/429 | Тот же биллинг, что на сайте — тариф, пул, пополнение |

Локально без webhook: polling не настроен в MVP — тестируйте через Render или ngrok на `/v1/telegram/webhook`.

## 7. Smoke-тест

1. Сайт: Hobby+ → Настройки → Подключить Telegram.
2. Telegram: открыть ссылку → Start.
3. Сообщение «привет» → ответ.
4. `/balance` ≈ настройки на сайте.
5. `/image закат` → фото в чате.
