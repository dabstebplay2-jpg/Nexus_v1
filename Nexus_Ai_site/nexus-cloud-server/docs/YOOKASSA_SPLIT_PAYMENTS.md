# ТЗ: ЮKassa «Сплитование платежей» (если RouterAI станет продавцом)

Документ для интеграции **после** договорённости с RouterAI и подключения Nexus как **платформы** в ЮKassa.

## Цель

При оплате подписки 743 ₽ автоматически:

- ~92% → магазин RouterAI в ЮKassa (`transfers[].account_id`)
- ~8% → комиссия платформы Nexus (`platform_fee_amount`)

Документация: [Сплитование платежей](https://yookassa.ru/developers/solutions-for-platforms/split-payments/basics)

## Предусловия (бизнес)

1. Nexus зарегистрирован в ЮKassa как **маркетплейс / агрегатор**, не обычный магазин.
2. RouterAI подключён как **продавец** (отдельный `shopId` / `account_id` в transfers).
3. Согласованы доли: `pool_fraction` (0.92) на AI, остаток 8% — платформа.
4. Чеки 54-ФЗ: кто формирует чек на AI-часть (обычно продавец).

## Изменения в коде

### 1. [`app/services/yookassa.py`](app/services/yookassa.py)

В `create_payment` для подписок добавить:

```python
transfers = [
    {
        "account_id": settings.YOOKASSA_ROUTERAI_SELLER_ID,
        "amount": {"value": f"{ai_rub:.2f}", "currency": "RUB"},
        "platform_fee_amount": {"value": f"{platform_fee_rub:.2f}", "currency": "RUB"},
    }
]
```

- `ai_rub = round(amount_rub * TIER_POOL_FRACTION, 2)`
- `platform_fee_rub = amount_rub - ai_rub` (или фиксированный % комиссии)

Флаг `YOOKASSA_SPLIT_ENABLED=true` — иначе текущий single-shop flow.

### 2. Env

```env
YOOKASSA_SPLIT_ENABLED=false
YOOKASSA_ROUTERAI_SELLER_ID=   # account_id продавца RouterAI в ЮKassa
YOOKASSA_PLATFORM_FEE_PERCENT=7
```

### 3. [`billing_fulfillment.py`](app/services/billing_fulfillment.py)

Без изменений логики пула: лимит ключа по `invoice.credits_usd` как сейчас. Сплит — только движение ₽ между магазинами ЮKassa.

### 4. Webhook

Обрабатывать `payment.succeeded` как сейчас; в metadata сохранять `split: true` и суммы transfers для аудита.

### 5. Админка / ledger

В `platform_funding_obligations` добавить поля `split_ai_rub`, `split_platform_rub` для сверки.

## Ограничения

- Деньги на р/с RouterAI **не равны** мгновенному кредиту API-депозита — зачисление на inference по их внутренним правилам.
- Возвраты: partial refund по transfers ([документация ЮKassa](https://yookassa.ru/developers/solutions-for-platforms/split-payments/payments)).
- Тестовый магазин ЮKassa + тестовый продавец для sandbox.

## Оценка

- Переговоры RouterAI + ЮKassa: 2–6 недель
- Разработка: 3–5 дней после получения `account_id` и тестовых ключей marketplace API

## Чеклист перед включением в проде

- [ ] Договор marketplace с ЮKassa
- [ ] RouterAI как connected seller
- [ ] Sandbox: платёж 743 ₽ → transfers в кабинете
- [ ] Webhook + fulfill + лимит ключа
- [ ] Оферта / privacy: указать что AI-услуга оказывается через RouterAI
