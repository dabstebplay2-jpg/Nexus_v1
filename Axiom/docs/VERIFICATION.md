# Проверка Axiom v0.1-alpha.2

Дата: 2026-09-05. Среда: Windows, Node.js 24.19.0, npm 11.17.0. Версия пакетов: 0.1.0-alpha.2. Итерация Foundation Hardening, без перехода к v0.2.

## Результаты команд

| Проверка                 | Результат                                                                    |
| ------------------------ | ---------------------------------------------------------------------------- |
| npm install              | Успешно; npm audit сообщил 0 vulnerabilities                                 |
| npm run lint             | Успешно, без ошибок/предупреждений линтера                                   |
| npm run typecheck        | Успешно; также выполняется внутри build                                      |
| npm test                 | 32 unit/integration/process test прошли                                      |
| npm run build            | Скомпилированы workspace-пакеты, Chat и server                               |
| npm run test:e2e         | 6 тестов Chromium против production-сервера                                  |
| npm run dev              | Package watch, API и Vite запущены                                           |
| node tests/dev-smoke.mjs | Успешно: версия API, Mock streaming и Stop через браузер                     |
| Dev watch                | Изменение shared/src пересобрало shared/dist, вызвало HMR Chat и restart API |
| Plain Node consumer      | Все четыре пакета импортируются с отключённым TypeScript stripping           |
| npm run release:source   | Source ZIP формируется по allow-list без `.axiom`, `.git`, `node_modules`    |

## Что реально проверено в браузере

1. Создание диалога, выбор Axiom Mock, избранное, полный streaming, Markdown/code blocks, чтение скопированного кода из clipboard, reload истории, edit, regenerate, Stop, rename, delete. В основном сценарии контролируются pageerror.
2. Настройки custom-подключения, ручной model ID, понятная ошибка недоступного провайдера при проверке и при генерации; мобильная ширина 390 px без горизонтального переполнения.
3. Текстовое вложение, передача Mock, остановка и восстановление файла из истории после reload.
4. Stop до завершения создания диалога: черновик сохранён, пользовательское сообщение не отправлено.
5. Непустой остановленный ответ остаётся на экране, запрос «Продолжи» создаёт второй ход, Mock получает два пользовательских сообщения. Передача именно частичного assistant content дополнительно проверяется capture-provider integration test.
6. Быстрые переключения избранного при задержанном первом PUT: второй PUT не стартует раньше, финальное состояние сохранено на сервере и восстановлено после reload.

Dev smoke выполнялся отдельно на 5173. Его временный диалог удалён после проверки. Скриншот `.axiom/verification/alpha2-dev.png` просмотрен; это артефакт проверки, не пользовательская история.

## Unit / integration / process

- History policy: complete, непустой aborted, пустой aborted, error и generating.
- Context budget: fallback, последние целые ходы, system reserve, tool exchange без разрезания по бюджету, orphan filtering, UTF-8/files/images/reasoning estimation, отказ до destructive edit.
- Settings queue: медленный A и новейший C, ошибка последнего снимка и retry, ошибка устаревшего снимка, новый снимок на границе завершения drain и cleanup.
- SQLite: пустая схема, независимая legacy fixture с parts/config/settings, повторный запуск, rollback DDL/version/data при ошибке, повреждённый JSON без удаления, неизвестные версии, recovery через messages_status и cascade delete.
- Core: одно активное generation, Stop, partial persistence, edit/regenerate, ошибки провайдера, отказ записи без зависшей блокировки, закрытие iterator, pre-aborted generation без изменений истории.
- Реальный дочерний API-процесс принудительно завершён во время Mock streaming; новый процесс с той же БД восстановил непустой ответ как aborted.
- OpenAI-compatible: HTTP payload/Authorization, discovery, split UTF-8, SSE comments/CRLF, broken stream, HTTP 401, user abort и idle timeout.
- TimeoutClock: активный stream выдерживает 600 секунд виртуального времени с heartbeat; connection, idle и absolute имеют разные причины. Тест не ждал десять реальных минут. Реальный HTTP-тест дополнительно переживает connection deadline при продолжающихся данных.
- SecretStorage: шифрование/повторное открытие/удаление; отдельная фабрика backend; отказ без silent fallback при неизвестном backend.

## Рабочая БД

До обновления создана согласованная SQLite backup: `.axiom/backups/pre-alpha2-1788595432830.sqlite`. В основной БД было 0 диалогов и 0 сообщений; она обновлена до versions [1, 2]. Поэтому сохранность заполненной alpha.1 БД подтверждается отдельной fixture, а не утверждением о миграции несуществовавших пользовательских диалогов. EXPLAIN рабочей базы подтвердил `SEARCH messages USING INDEX messages_status (status=?)`.

## Результаты проверки review

Подтверждены: фильтрация aborted из контекста, отсутствие бюджетирования, абсолютные 120 секунд streaming, параллельные PUT settings, scan всех JSON сообщений при startup, номинальная таблица migrations, exports на src.

Уточнения: позднее получение HTTP-ответа settings само по себе не меняет БД; реальная проблема была в отсутствии гарантии порядка применения запросов. Теперь PUT сериализованы. Core уже не зависел от React/Express/SQLite/провайдеров — граница сохранена и усилена правилами lint. SecretStorage и AES backend уже были разделены, threat model частично задокументирована — добавлены registry/выбор backend и отдельная SECURITY.md, без заявления о реализованном Windows vault. Исходные manifests имели 0.1.0; новое согласованное SemVer-значение — 0.1.0-alpha.2.

## Непроверенное и ограничения

Реальные OpenAI/Anthropic/Gemini/LM Studio/Ollama, длительный платный reasoning-запрос, нативный OS Secret Storage и потеря питания компьютера не проверялись. Внешний HTTP контракт не равен совместимости с каждым поставщиком. Token estimator приближённый; нет memory/summary/RAG, пагинации чтения длинной истории, глобальной сериализации settings между разными вкладками и гарантии доставки очереди после закрытия страницы. AES master.key рядом с secrets не защищает при компрометации всей папки. Сервер остаётся локальным и однопользовательским.

Оценка: фундамент пригоден для локальной alpha-линии v0.1 и дальнейшей стабилизации. Это не заявление о готовности к публичному многопользовательскому production. Следующий этап автоматически не начинался.
