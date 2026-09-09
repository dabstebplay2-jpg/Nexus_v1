# Подписки и пул ИИ Nexus (₽)

## Как сейчас

1. **Free** — бесплатные модели OpenRouter (лимит запросов: 15/мин, 100/день).
2. **Платный тариф (Hobby+)** — после **оплаченного** счёта `sub_TIER_xxx` (`status=paid` в БД).
3. Без подтверждённой оплаты `GET /billing/subscribe/check` возвращает **402** (если `NEXUS_BILLING_TEST_MODE=false`).
4. Тестовая кнопка «Подтвердить оплату» — только при `NEXUS_BILLING_TEST_MODE=true` и `VITE_BILLING_TEST_MODE=true` (локально).

**Лимит ИИ:** месячный пул на **30 дней** после оплаты (`billing_mode: monthly_quota`). Поля `daily_*` в API — устаревшие алиасы **общего** бюджета (пул + top-up), не дневная квота.

Пул считается от **фактической суммы счёта** в ₽: `amount_rub / курс_ЦБ × 92%` → `invoice.credits_usd`. При промокоде пул пропорционален **скидочной** сумме. Комиссия платформы — **8%**.

После окончания 30 дней пул подписки **не тратится** (нужно продление), баланс пополнения (top-up) остаётся доступным.

### Куда идут деньги

1. Пользователь платит **ЮKassa** → счёт магазина Nexus.
2. После подтверждения оплаты Nexus **создаёт один API-ключ Polza на email** (имя `nexus-{email}`) и сразу выставляет **месячный лимит** ≈ 92% от оплаченной суммы в ₽.
3. Владелец платформы пополняет **депозит Polza** (мастер-аккаунт) вручную.

**Ключ Polza:** выдаётся только после оплаты подписки, промокода с выдачей тарифа или админ-выдачи — не при логине и не при первом сообщении в чат. Повторная оплата обновляет лимит существующего ключа; при ремонте/оплате старые дубликаты на Polza удаляются автоматически.

Подробнее: [`nexus-cloud-server/docs/YOOKASSA_RU.md`](../nexus-cloud-server/docs/YOOKASSA_RU.md).

---

## Архитектура (прод)

```
[Браузер] → POST /api/billing/subscribe (Vercel /api → cloud :8080)
         → InvoiceDB (pending) + credits_usd
         → ЮKassa payment.create → redirect

[ЮKassa] → POST /v1/billing/yookassa/webhook
         → fulfill_subscription_invoice (идемпотентно)
         → activate_paid_tier + Polza key + лимит

[Браузер] → GET /billing/subscribe/check?invoice_id=...
         → poll + fulfill (параллельно webhook)
```

**Модули:**

| Файл | Роль |
|------|------|
| `nexus-cloud-server/app/routers/billing.py` | subscribe, topup, webhook, check |
| `nexus-cloud-server/app/services/yookassa.py` | ЮKassa API |
| `nexus-cloud-server/app/services/billing_fulfillment.py` | активация после оплаты |
| `nexus-cloud-server/app/services/quota_limits.py` | пул, период, enforcement |
| `frontend/src/components/TierPicker.jsx` | UI тарифов |
| `backend/app/routers/billing.py` | прокси для локальной разработки (:8000) |

---

## Два продукта

| Тип | Endpoint | После оплаты |
|-----|----------|----------------|
| **Подписка** | `POST /v1/billing/subscribe` | тариф + пул на 30 дней |
| **Пополнение** | `POST /v1/billing/topup` | `user.balance` (тратится после пула подписки) |

Автопродление — **не реализовано**; пользователь оформляет подписку заново.

---

## Промокоды

- `GET /v1/billing/promo` — публичные подсказки
- `POST /v1/billing/promo/redeem` — мгновенная выдача тарифа (акция)
- При оплате: `promo_code` в `POST /subscribe` — скидка на сумму и **на пул**

---

## Переменные окружения (cloud)

```env
YOOKASSA_SHOP_ID=...
YOOKASSA_SECRET_KEY=...
NEXUS_FRONTEND_URL=https://nexus-zeta-ruby-12.vercel.app
YOOKASSA_RETURN_PATH=/pricing
NEXUS_BILLING_TEST_MODE=false
NEXUS_TIER_POOL_FRACTION=0.92
```

Webhook в личном кабинете ЮKassa: `https://nexus-cloud-bxcc.onrender.com/v1/billing/yookassa/webhook`

---

## Коды ошибок ИИ

| Код | Значение |
|-----|----------|
| **429** | Месячный пул исчерпан или период подписки закончился |
| **402** | Оплата счёта не подтверждена (billing check) |
| **403** | Нет оплаченной подписки на платном тарифе |

---

## Чеклист перед приёмом платежей

- [ ] ИП/ООО и договор с ЮKassa
- [ ] HTTPS на API (Render)
- [ ] Webhook доступен из интернета
- [ ] Оферта и политика возвратов на сайте
- [ ] `CHANGELOG_NOTIFIED_VERSION` на Vercel после релиза
