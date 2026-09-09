# Nexus v1.0 — First Vertical Slice

Дата: 9 сентября 2026 года  
Назначение: определить один законченный пользовательский сценарий для проверки Nexus v1.0.  
Граница: это описание первого рабочего пути, а не проектирование всей системы и не новая архитектура.

## 1. Пользовательский сценарий

Пользователь открывает локальный Nexus в рабочей папке проекта и пишет:

> «Проанализируй текущий проект, найди причину ошибки в тесте `tests/test_auth.py::test_refresh`, исправь только необходимый файл и запусти этот тест повторно».

Для vertical slice используется один заранее выбранный небольшой репозиторий с воспроизводимой ошибкой. Задача имеет ограниченный scope:

- Nexus работает локально для одного пользователя;
- разрешённая рабочая область известна до запуска;
- модель может читать файлы, предложить изменение и после подтверждения записать изменение;
- проверка выполняется одной заранее разрешённой тестовой командой;
- изменение не должно выходить за пределы рабочей области;
- пользователь получает evidence того, что было прочитано, изменено и проверено.

Сценарий не означает, что Nexus умеет исправлять произвольные ошибки. Он проверяет один поддержанный путь для одной ограниченной задачи.

## 2. Полный путь

```text
User Input
    ↓
Session Creation
    ↓
Context Loading
    ↓
Model Request
    ↓
Planning
    ↓
Tool Call
    ↓
Permission
    ↓
Execution
    ↓
Verification
    ↓
Evidence
    ↓
Result
```

### User Input

Пользователь вводит одну задачу в основном локальном клиенте. Nexus показывает созданный task/run identifier и границы рабочей папки.

Input не должен содержать секретов. Если запрос неоднозначен или не соответствует поддержанному сценарию, Nexus останавливается с понятным вопросом/ошибкой, а не начинает произвольное исследование.

### Session Creation

Nexus создаёт session и один task/run с начальными параметрами:

- user request;
- workspace identity;
- provider/model identity без секретного значения;
- creation time;
- initial status.

Session и task/run не должны быть только состоянием UI. После перезапуска их начальное состояние должно находиться в каноническом локальном storage.

### Context Loading

В context попадает только необходимый материал:

- правила разрешённой рабочей области;
- имя и состояние указанного теста;
- релевантные файлы проекта, найденные ограниченным чтением;
- история текущей session;
- доступные tool capabilities и ограничения.

Не загружаются cloud memory, чужие sessions, скрытые credentials, весь архив проекта без необходимости и не подтверждённая vector memory.

### Model Request

Один поддерживаемый model provider получает typed request с:

- пользовательской целью;
- ограничениями workspace и tools;
- релевантным context;
- требованием вернуть понятный plan/tool intent.

Provider не получает API keys, refresh tokens или лишние logs. Ошибка, timeout или cancellation provider сохраняются как состояние task, а не превращаются в success.

### Planning

Модель предлагает короткий план:

1. прочитать нужные файлы;
2. определить причину падения указанного теста;
3. подготовить минимальное изменение;
4. запустить разрешённую проверку.

План является намерением, а не разрешением. Произвольные команды, выход за workspace и дополнительные side effects не считаются частью плана без отдельного решения пользователя.

### Tool Call

Agent создаёт typed tool calls только для необходимых действий:

- read file/list relevant project files;
- prepare a bounded file patch;
- run the exact allowed test command.

Каждый call имеет task/run/action identifier, аргументы, target и ожидаемый result shape. Текст модели сам по себе не является выполненным tool call.

### Permission

Для записи файла и запуска тестовой команды Nexus показывает пользователю:

- какой файл будет изменён;
- какой bounded diff предлагается;
- какая команда будет запущена;
- в какой workspace это произойдёт.

Пользователь подтверждает действие. Read-only inspection может быть разрешён политикой сценария; write и execution требуют явного approval. Отказ фиксируется и завершает соответствующий action без side effect.

### Execution

После approval Nexus:

1. проверяет, что target остаётся внутри разрешённой рабочей области;
2. применяет только подтверждённый минимальный patch;
3. записывает action state и результат записи;
4. запускает только указанную тестовую команду с timeout и ограниченным output;
5. сохраняет exit status и redacted output.

Если запись или команда прервана, состояние становится failed или unknown в зависимости от доказательств. Nexus не сообщает success только потому, что subprocess был создан.

### Verification

Проверка состоит из двух частей:

- указанный тест действительно завершился с ожидаемым success status;
- итоговый diff соответствует утверждённому изменению и не содержит неожиданных файлов.

Если тест всё ещё падает, task не считается завершённой. Если процесс исчез без exit status, результат unknown. Если изменился другой файл или workspace boundary нарушена, действие считается failed и требует разбирательства.

### Evidence

Nexus сохраняет минимальный evidence bundle:

- исходный request;
- session/task/run/action identifiers;
- список прочитанных релевантных файлов без секретного содержимого;
- approval decision;
- redacted patch summary или diff metadata;
- точную проверенную команду;
- exit status и относящийся к тесту output;
- verification result;
- timestamps и terminal state.

Evidence не должен содержать API keys, OAuth tokens, лишние credentials или полный чувствительный контекст.

### Result

Пользователь получает один из трёх честных результатов:

- **Succeeded:** подтверждённый patch применён, тест прошёл, diff соответствует задаче;
- **Failed:** действие или verification завершились ошибкой, причина и evidence показаны;
- **Unknown:** нельзя доказать итог из-за crash, timeout, потерянного process state или повреждённого storage.

Текст модели не может заменить этот terminal state.

## 3. Необходимые компоненты Nexus v1.0

### Core

Нужен минимальный orchestration path, который связывает session, task/run, context, typed actions, permissions, execution, verification и result. Core не должен включать Minecraft, cloud billing, browser, IDE или training concerns.

### Agent

Нужен один AgentLoop для последовательности plan → approved tool call → execution → verification. Он должен поддерживать лимиты, cancellation/error states и не объявлять completion без evidence.

Multi-agent coordination и параллельное планирование в slice не используются.

### Tools

Нужны только ограниченные инструменты чтения файлов, подготовки/применения bounded patch и запуска одной разрешённой тестовой команды. У каждого tool есть schema, target boundary, permission result, timeout и redacted output.

### Storage

Нужно одно каноническое локальное состояние для session, task/run, action, permission, verification и evidence. Storage должен сохранять terminal state и не выдавать повреждённый/потерянный state за пустой успешный результат.

### UI

Нужен один основной локальный клиент, предпочтительно CLI для первого slice. Он должен показывать request, plan, approval, progress/error, diff summary, verification и final result. Отдельный Web UI не является условием прохождения slice.

### Model Provider

Нужен один реально поддерживаемый provider contract для text response и structured tool intent. Для автоматических тестов нужен deterministic mock provider; live provider не должен быть обязательным для каждого CI run.

## 4. Что специально НЕ используется

В этом vertical slice намеренно не участвуют:

- Axiom Web UI как обязательный второй клиент;
- несколько model providers и provider failover;
- MiniCursor/llama.cpp/CUDA и QLoRA training;
- cloud accounts, billing, teams, connectors и public API;
- multi-agent orchestration;
- plugins и marketplace;
- browser automation и полноценная IDE;
- Nexus Studio;
- Minecraft Launcher, Java discovery, loaders, Modrinth, game accounts и updater;
- Old Nexus runtime и legacy text-to-action protocol;
- Maker visual editor;
- vector RAG, cross-session profile memory и автоматическое обучение memory;
- arbitrary shell commands, unrestricted filesystem/network access и неявные действия из текста модели;
- background jobs, distributed services и поддержка нескольких host runtimes;
- update/migration всей исторической базы проектов.

Это не утверждение, что данные направления не нужны никогда. Они просто не требуются, чтобы доказать первый законченный рабочий путь.

## 5. Definition of Done

Vertical slice считается завершённым только когда в чистом тестовом workspace воспроизводимо выполнены все условия:

1. Пользователь создаёт задачу одним запросом через основной локальный клиент.
2. Session и task/run получают persisted identifiers и восстанавливаемое начальное состояние.
3. Context содержит только разрешённые и релевантные данные; секреты не попадают в model request.
4. Model provider возвращает plan/tool intent в согласованном формате или честную ошибку.
5. Read, patch и test tools вызываются typed способом с action identifiers.
6. Write и test execution останавливаются до approval и показывают target, diff summary и command.
7. Изменение ограничено разрешённым workspace и подтверждённым файлом.
8. Тестовая команда запускается с timeout; exit status и redacted output сохраняются.
9. Verification проверяет и тестовый результат, и соответствие итогового diff.
10. При успешном пути пользователь видит `Succeeded` только после подтверждённой verification.
11. При отказе, timeout, crash или отсутствии exit status система выдаёт `Failed` или `Unknown`, но никогда не маскирует это под success.
12. Evidence можно просмотреть после завершения, и оно не содержит secrets или лишний чувствительный контекст.
13. Перезапуск после terminal state не создаёт второй task и не меняет результат задним числом.
14. Deterministic mock-provider tests проходят без сети; внешний provider проверяется отдельным интеграционным сценарием.
15. Один разработчик может установить, запустить, диагностировать и повторить этот сценарий по документации.

## 6. Red Team checks для slice

Перед признанием slice готовым намеренно проверить:

- модель предлагает изменить файл вне workspace;
- пользователь отклоняет patch;
- test process завершается timeout или без exit status;
- storage повреждён между action и verification;
- provider возвращает невалидный tool intent;
- tool output содержит секрет;
- повтор после UNKNOWN мог бы применить patch дважды;
- тест прошёл, но diff изменил неожиданный файл;
- процесс перезапускается после завершённого task;
- клиент теряет связь во время approval или execution.

Любой такой случай должен приводить к безопасному error/unknown state и диагностируемому evidence, а не к расширению slice новыми функциями.

## Граница результата

Если этот путь работает, доказано только следующее: Nexus может безопасно выполнить одну ограниченную локальную coding-задачу с проверяемым результатом. Это не доказывает готовность cloud, browser, IDE, Minecraft, multi-agent, RAG, training или полной экосистемы Nexus.
