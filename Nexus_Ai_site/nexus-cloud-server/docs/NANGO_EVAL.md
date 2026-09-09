# Оценка Nango для масштабирования каталога коннекторов

## Контекст

MVP Nexus Connectors реализован как **собственный OAuth + `ConnectorRegistry` + адаптеры** для четырёх интеграций (Google Workspace, GitHub, Vercel, Discord webhook). Каталог в `app/connectors/catalog.json` содержит десятки записей `coming_soon` для UI в стиле Perplexity.

## Когда Nango имеет смысл

| Критерий | Собственный стек (сейчас) | [Nango](https://www.nango.dev/) |
|----------|---------------------------|----------------------------------|
| 4–8 коннекторов с кастомными tools | ✅ Прозрачно, полный контроль | Избыточно |
| 30–100+ OAuth-интеграций | Дорого в поддержке (refresh, scopes, версии API) | ✅ Единый OAuth proxy, sync, webhooks |
| Self-host / compliance | Уже есть Fernet vault | Nango self-host на своём VPC |
| AI tool surface | Наши адаптеры + agent loop | Nango даёт прокси к API; tools всё равно писать у нас или через Composio |

## Рекомендация

1. **До ~10 активных коннекторов** — оставаться на `ConnectorProvider` абстракции; новые MVP-интеграции добавлять адаптерами.
2. **При переходе 15+ `coming_soon` → `available`** — пилот Nango (cloud или self-host):
   - Реализовать `NangoConnectorProvider` рядом с `OAuthConnectorProvider`.
   - Хранить `connection_id` Nango в `user_connections` вместо сырых токенов (или dual-write на миграции).
   - UI и `GET /v1/connectors` не менять — только backend store + oauth_providers.
3. **Composio** — рассматривать только если приоритет «готовые AI actions» важнее прозрачности и стоимости; для Nexus предпочтительнее Nango + свои tools из-за audit log и allowlist.

## План миграции (черновик)

1. Вынести интерфейс `ConnectorProvider` (`start_oauth`, `handle_callback`, `get_credentials`, `revoke`).
2. Подключить Nango для 2–3 «лёгких» API (Notion, Slack) без переписывания чата.
3. Сравнить latency tool-вызовов (Nango proxy vs прямой HTTP) и стоимость invocations.
4. Постепенно переносить OAuth-only коннекторы; оставить кастомные (Discord webhook, сложный Google) на native path.

## Риски Nango

- Дополнительный SaaS/инфра в цепочке (GDPR, DPA).
- Зависимость от их schema sync для нестандартных API.
- Всё равно нужны Nexus-адаптеры для OpenAI-style tools и audit.

## Итог

**MVP правильно сделан без Nango.** Следующий триггер для оценки в проде: команда тратит >30% времени на OAuth refresh/новые провайдеры, а не на бизнес-tools. До этого — расширять `catalog.json` и адаптеры точечно.
