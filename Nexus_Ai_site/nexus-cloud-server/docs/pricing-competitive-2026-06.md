# Конкурентный обзор AI-подписок (июнь 2026)

Внутренний документ для позиционирования Nexus. **Не** использовать формулировки лимитов конкурентов на публичном лендинге как юридические обещания.

Дата среза: **3 июня 2026**. Исходный черновик: `deep-research-report.md` (с правками ниже).

## Errata к исходному отчёту

| Было в черновике | Исправление |
|------------------|-------------|
| ChatGPT Go = 160 msg / 3h (как Plus) | Go легче Plus; **160/3h** — ориентир для **Plus** / Thinking, не для Go |
| Perplexity Pro = 200 запросов/нед | Официально: **unlimited Pro Search** + **20 Deep Research/день**; недельные лимиты на «advanced» модели — отдельно (май 2026 — жалобы) |
| Cursor Pro+ = $60 credit | Официально **$70** included API usage ([Cursor docs](https://cursor.com/help/models-and-usage/usage-limits)) |
| Cursor Ultra = $200 credit | Официально **$400** included |
| Claude JSON sources 2023 | Актуальные лимиты Max: [Max plan help](https://support.claude.com/en/articles/11049741-what-is-the-max-plan) |
| SuperGrok = Unlimited | На практике rolling caps (~100 prompts/2h у X Premium+) |

## Ценовые якоря индустрии

| Уровень | USD/мес | Примеры |
|---------|---------|---------|
| Entry | $8–10 | ChatGPT Go, X Premium, Google AI Plus |
| Pro | $20 | ChatGPT Plus, Claude Pro, Perplexity Pro, Copilot Pro |
| Power 5× | $100 | ChatGPT Pro, Claude Max 5×, Google AI Ultra 5× |
| Power 20× | $200 | ChatGPT Pro $200, Claude Max 20×, Perplexity Max |

Тренд **мая 2026**: compute-based лимиты (Gemini), credit pools (Cursor), мультипликаторы 5×/20× вместо «N сообщений в день».

## Nexus (сбалансированная сетка, внедрено в config)

| Тариф | USD | ~Пул API (92%) | Якорь рынка |
|-------|-----|----------------|-------------|
| FREE | $0 | — | Локальный IDE |
| HOBBY | $10 | ~$9.30 | ChatGPT Go / AI Plus |
| STANDARD | $20 | ~$18.60 | ChatGPT Plus / Claude Pro |
| PRO | $100 | ~$93 | Claude Max 5× / ChatGPT Pro $100 |
| ULTRA | $200 | ~$186 | Claude Max 20× / ChatGPT Pro $200 |

Анти-абьюз: не более **25%** месячного пула за календарные сутки UTC.

## Краткая матрица (лимиты)

- **ChatGPT:** Free ~10/5h; Plus rolling + ~3000 Thinking/нед; Pro $100/$200 = 5×/20× Plus, fair use.
- **Claude:** Pro $20 — 5h + weekly buckets; Max $100/$200 = 5×/20× Pro.
- **Gemini:** с 17.05.2026 compute-based, refresh **5h** до weekly cap; Plus 2×, Pro 4×, Ultra 5×/20× Pro.
- **Perplexity:** Free ~5 Pro Search/день; Pro unlimited Pro Search + **20 DR/день**; Max $200.
- **Grok:** Free ~10/2h; SuperGrok $30; X Premium+ $40.
- **Cursor:** Pro $20 → **$20** API pool; Pro+ $60 → **$70**; Ultra $200 → **$400**.

## JSON (исправленный фрагмент)

```json
[
  {"service":"OpenAI ChatGPT","tier":"Go","price_usd_monthly":8,"limit_type":"rolling","limit_value":"higher than Free, below Plus (exact N not public)","source_url":"https://help.openai.com/en/articles/9793128-about-chatgpt-pro-plans","source_date":"2026-06-03"},
  {"service":"OpenAI ChatGPT","tier":"Plus","price_usd_monthly":20,"limit_type":"rolling 3h + weekly","limit_value":"~160/3h GPT-5.x; ~3000 Thinking/week","source_url":"https://help.openai.com/en/articles/9793128-about-chatgpt-pro-plans","source_date":"2026-06-03"},
  {"service":"Perplexity","tier":"Pro","price_usd_monthly":20,"limit_type":"daily + weekly","limit_value":"unlimited Pro Search; 20 Deep Research/day; advanced models may be weekly-capped","source_url":"https://www.perplexity.ai/pro","source_date":"2026-06-03"},
  {"service":"Cursor AI","tier":"Pro","price_usd_monthly":20,"limit_type":"monthly credits","limit_value":"$20 API agent usage + generous Auto","source_url":"https://cursor.com/help/models-and-usage/usage-limits","source_date":"2026-06-03"},
  {"service":"Cursor AI","tier":"Pro+","price_usd_monthly":60,"limit_type":"monthly credits","limit_value":"$70 API agent usage (~3x Pro)","source_url":"https://cursor.com/help/models-and-usage/usage-limits","source_date":"2026-06-03"},
  {"service":"Cursor AI","tier":"Ultra","price_usd_monthly":200,"limit_type":"monthly credits","limit_value":"$400 API agent usage (~20x Pro)","source_url":"https://cursor.com/help/models-and-usage/usage-limits","source_date":"2026-06-03"}
]
```

Полная матрица — в исходном `deep-research-report.md` с учётом errata выше.
