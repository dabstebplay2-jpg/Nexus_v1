# ЮKassa — подключение оплаты подписок

## 1. Личный кабинет ЮKassa

1. [yookassa.ru](https://yookassa.ru) → регистрация магазина (ИП/ООО).
2. **Интеграция → Ключи API** — скопируйте `shopId` и **секретный ключ**.
3. **Интеграция → HTTP-уведомления**:
   - URL: `https://nexus-cloud-bxcc.onrender.com/v1/billing/yookassa/webhook`
   - События: `payment.succeeded` (и при необходимости `payment.waiting_for_capture`)
4. Тестовый магазин — для проверки без реальных денег (отдельные ключи).

## 2. Переменные на Render

```env
YOOKASSA_SHOP_ID=123456
YOOKASSA_SECRET_KEY=live_...
NEXUS_FRONTEND_URL=https://nexus-zeta-ruby-12.vercel.app
YOOKASSA_RETURN_PATH=/pricing
NEXUS_BILLING_TEST_MODE=false
```

| Переменная | Назначение |
|------------|------------|
| `YOOKASSA_SHOP_ID` | ID магазина |
| `YOOKASSA_SECRET_KEY` | Секретный ключ API |
| `NEXUS_FRONTEND_URL` | Куда вернуть пользователя после оплаты |
| `YOOKASSA_RETURN_PATH` | Путь на фронте (по умолчанию `/pricing`) |

Локально в [`.env`](../.env):

```env
YOOKASSA_SHOP_ID=...
YOOKASSA_SECRET_KEY=...
NEXUS_FRONTEND_URL=http://localhost:5173
```

## 3. Как это работает

1. Пользователь на сайте → **Оформить тариф**.
2. API `POST /v1/billing/subscribe` создаёт счёт и платёж в ЮKassa.
3. Браузер переходит на `confirmation_url` ЮKassa (карта, СБП и т.д.).
4. После оплаты — возврат на `{NEXUS_FRONTEND_URL}/pricing?payment=success&invoice_id=...`.
5. Фронт вызывает `GET /v1/billing/subscribe/check` → активация тарифа и RouterAI.
6. Параллельно webhook `POST /v1/billing/yookassa/webhook` подтверждает оплату на сервере.

## 4. Чеки 54-ФЗ

В коде передаётся блок `receipt` с email покупателя. В кабинете ЮKassa включите онлайн-кассу или подключите ОФД по их инструкции.

## 5. Автоплатежи (рекуррент)

Сейчас реализована **разовая оплата** за период 30 дней. Продление — повторное оформление тарифа или отдельная задача с `save_payment_method` / автоплатежами ЮKassa.

## 6. Деньги ЮKassa и RouterAI

Оплата подписки **не уходит на routerai.ru** и **не попадает на личный кошелёк пользователя** на RouterAI.

| Этап | Что происходит |
|------|----------------|
| Оплата 743 ₽ Hobby | Деньги на счёте магазина ЮKassa / ЮMoney |
| Webhook `payment.succeeded` | `fulfill_subscription_invoice` → тариф + `invoice.credits_usd` |
| RouterAI | Лимит на суб-ключе пользователя ≈ `743 / курс × 0.92` USD (8% — комиссия платформы) |
| Депозит inference | Списание с **депозита владельца** на routerai.ru (пополнение вручную) |

Логи после оплаты:

- `[ПОДПИСКА: ОПЛАТА]` — счёт помечен paid
- `[ПОДПИСКА: ПУЛ]` — сумма ₽ → лимит USD на ключ

Админка:

- `GET /v1/local-admin/platform/funding` — ЮKassa за месяц, пулы, депозит, рекомендация пополнения
- `PATCH /v1/local-admin/platform/routerai-deposit` — обновить учётный депозит после пополнения routerai.ru
- `GET /v1/local-admin/routerai/pool-status` — пулы + предупреждения
- Render Cron `scripts/cron_routerai_funding_check.py` (ежечасно) + `DISCORD_OPS_WEBHOOK_URL`

См. также: [ROUTERAI_ENTERPRISE_OUTREACH.md](ROUTERAI_ENTERPRISE_OUTREACH.md), [YOOKASSA_SPLIT_PAYMENTS.md](YOOKASSA_SPLIT_PAYMENTS.md).

## 7. Отладка

- Без ключей ЮKassa и с `NEXUS_BILLING_TEST_MODE=true` — кнопка «Подтвердить оплату (тест)».
- Логи Render: `[ПОДПИСКА: ОПЛАТА]` и `[ПОДПИСКА: ПУЛ]` после успешного webhook.
- Проверка ключа пользователя: `POST /v1/local-admin/users/{id}/refresh-routerai`.
