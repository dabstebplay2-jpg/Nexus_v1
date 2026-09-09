# Nexus Minecraft — углублённый архитектурный анализ

Дата: 9 сентября 2026 года. Объект: `Nexus_Minecraft`.

## Итог

`Nexus_Minecraft/Nexus_Minecraft` — более новая и функционально широкая копия desktop-лаунчера: версия `1.1.4.2`, PySide6 UI, отдельные Minecraft-инстансы, Fabric/Forge/NeoForge/Quilt, Modrinth, аккаунты, обновления, Java discovery и сайт. `Nexus_Minecraft/Nexus_minecraft_launcher` — меньший предыдущий срез версии `0.7.13`, который полезен как стабильный baseline и исторический источник, но уже отстаёт по процессу запуска, настройкам, OAuth и UI.

Основной копией следует сделать **`Nexus_Minecraft/Nexus_Minecraft`**. Вторую копию не следует одновременно развивать: её нужно оставить архивным reference до миграции данных и проверки релизной сборки. Код в ходе анализа не изменялся.

Статус зрелости: **рабочий Windows MVP/предрелизный desktop-продукт**, а не переносимый платформенный runtime. Основной пользовательский путь выглядит связанным, но отсутствуют достаточные изолированные тесты для core-модулей, persistent process supervision, безопасное token storage и обязательная проверка checksum для каждого обновления.

## Архитектура и поток выполнения

Технологический стек:

- Python 3.12+;
- PySide6/Qt для desktop UI;
- `minecraft-launcher-lib` для списка версий, установки Minecraft, loader-ов и генерации команды;
- `requests`/`urllib.request` для Modrinth, OAuth, GitHub Releases и сайта;
- JSON-файлы в `data/` для инстансов, настроек, загрузок и аккаунтов;
- PyInstaller и Inno Setup для Windows EXE/installer;
- статический website и отдельный неиспользуемый React/Vite scaffold `website-next`.

Точка входа — `Nexus_Minecraft/Nexus_Minecraft/main.py`. Он поднимает логирование и глобальные exception hooks, готовит языковые/сетевые настройки, создаёт `QApplication`, применяет тему и открывает `app/window.py:MainWindow`. `MainWindow` маршрутизирует страницы и связывает UI с singleton/facade-объектами core.

```text
main.py
  └─ app/window.py (MainWindow, страницы, updater actions)
       ├─ ui/pages/instances_page.py
       │    ├─ InstanceManager
       │    ├─ VersionManager
       │    ├─ LoaderManager
       │    └─ Launcher
       │          ├─ minecraft-launcher-lib
       │          ├─ Java Manager
       │          ├─ AccountManager / Ely / Microsoft
       │          ├─ LauncherSettings
       │          └─ subprocess.Popen + process watcher
       ├─ ui/pages/mods_page.py → mods/mod_installer.py → Modrinth + DownloadManager
       ├─ ui/pages/downloads_page.py → DownloadManager
       ├─ ui/pages/accounts_page.py → AccountManager + auth services
       ├─ ui/pages/settings_page.py → LauncherSettings + Updater
       └─ storage/paths.py + storage/json_store.py
```

Параллельные QThread/worker-пути в UI обновляют прогресс и не должны напрямую становиться частью будущего Nexus Core. Сейчас часть операций создаёт собственные `DownloadManager`, `Launcher`, `AccountManager`; это удобно для MVP, но усложняет единое состояние и отмену.

## Сравнение двух копий

| Область | `Nexus_Minecraft` | `Nexus_minecraft_launcher` |
|---|---|---|
| Версия и история | `1.1.4.2`, commits до 21.06.2026; примерно 79 Python-файлов | `0.7.13`, последний commit 18.06.2026; примерно 67 Python-файлов |
| UI | Более полный: темы, responsive sidebar/topbar, skin preview, Discord status, resolution settings, расширенные страницы | Более ранний UI с меньшим количеством исправлений и интеграций |
| Launcher | Проверка диска/записи, loader version, Java compatibility, Ely authlib/skins, resolution, redacted command, process watcher | Базовый запуск, меньше проверок и интеграций |
| InstanceManager | Сохраняет `loader_version`, поддерживает import/export и безопаснее обновляет новые поля | Импорт/экспорт проще; `loader_version` в create/import отсутствует |
| LoaderManager | Loader-specific version selection, retries и дополнительные проверки; NeoForge minimum 1.20.2 | Старый API без явного loader version и с более ранним NeoForge minimum |
| Auth | Microsoft + Ely public-client/PKCE paths; OAuth config из env или settings | Microsoft + Ely с обязательным Ely secret в старой конфигурации |
| Settings | Отдельный большой `LauncherSettings`, clamp RAM/resolution, themes, Discord и Java-related options | Существенно меньше настроек |
| Updater | Ожидает завершения родительского процесса через PID перед запуском Setup; checksum умеет проверять | После скачивания использовал фиксированную задержку перед запуском |
| Полезная роль | Основной development/release candidate | Regression baseline, простая fallback-копия и источник ранней схемы данных |

Выбор основной копии: **новая `Nexus_Minecraft`**. Она содержит все сильные части старой плюс исправления, а различия в `main.py`, updater, auth и launcher явно показывают развитие. Перед публикацией нужно зафиксировать чистый commit и прогнать CI; текущая архивная рабочая копия содержит незакоммиченные изменения website/build-файлов, поэтому версия в `app_info.py` сама по себе не равна доказанной стабильной сборке.

## Подробный разбор модулей

### DownloadManager

`core/download_manager.py` — persistent task ledger в `data/downloads.json`. Он хранит `id`, kind, title, subtitle, status, progress, byte counters, speed, timestamps, metadata и error; предоставляет `start_task`, `update_task`, `finish_task`, `fail_task`, очистку и отображение времени. Запись делается через уникальный временный файл и `os.replace`, общий process-wide `RLock` защищает несколько экземпляров в одном процессе, а чтение/замена повторяются при Windows `PermissionError`.

Сильные стороны: атомарная замена файла, retry на Windows, явные terminal states, metadata и пригодный UI history. Это заметно лучше простого `history.json` MiniCursor.

Ограничения: lock не защищает несколько процессов; `load()` при повреждённом JSON молча возвращает пустой список; нет schema version, cancellation/resume, checksum, durable event log и связи task с конкретным instance/job. Менеджер сам не скачивает файл — сетевые worker-ы и `minecraft-launcher-lib` делают фактическую работу, а менеджер только отражает состояние. Это журнал состояния, не универсальный Download Core.

Решение: перенести в Nexus Core абстракции `Job`, progress events, retry/cancel и atomic persistence; оставить Minecraft-specific типы `minecraft-install`, `loader-install`, `mod-download`, `shader-download`, `java-download` в адаптере. В новой схеме нужен SQLite/Store, а JSON оставить импортным backend-ом или cache.

### VersionManager

`core/version_manager.py` тонкий фасад над `minecraft_launcher_lib.utils.get_version_list()`. `_retry` делает до трёх попыток с линейно растущей задержкой. Есть фильтры release/snapshot. Версии не сохраняются в disk cache, не имеют TTL, не нормализуются в доменную запись и не запрашиваются с отменяемым signal.

Сильная сторона — маленький тестируемый boundary к внешнему API и отсутствие Minecraft metadata в UI. Ограничение — это не полноценный каталог версий: отсутствуют offline cache, pagination, stale data policy, schema validation и выбор loader compatibility. Существующий `LoaderManager` дополняет его проверкой loader-ов и поиском установленной launch version.

Для Nexus Core можно взять интерфейс `CatalogProvider`, retry/backoff и cache policy. Список Mojang и loader versions оставить Minecraft adapter-у.

### InstanceManager

`core/instance_manager.py` создаёт отдельные каталоги `data/instances/<slug>/.minecraft`, пишет `instance.json`, ведёт общий `instances.json`, поддерживает rename/update, last played, delete, export и import. Имена валидируются, slug конфликтует через suffix `-2`, импорт проверяет абсолютные/`..` пути до распаковки. Новая копия переносит `loader_version`; старая этого поля не имела.

Сильные стороны: изоляция инстансов, понятная модель, import/export, проверка archive traversal, отдельный game directory и RAM per instance. Это самый полезный Minecraft domain module.

Ограничения: JSON без мигратора и schema version; записи содержат абсолютные пути, поэтому перенос на другой компьютер требует repair; `delete_instance(delete_files=True)` необратим; `load_json` при повреждении теряет различие между corrupt и empty; два процесса могут потерять изменения. Не видно durable lock на instance и состояния `installing/ready/broken/running`.

Для Core можно взять generic `Workspace/Project` lifecycle, identity, import/export contract и state transitions. Minecraft-specific остаются `minecraft_version`, loader, `.minecraft`, RAM и modpack layout.

### Java Manager

`core/java_manager.py` обнаруживает Java из PATH, `JAVA_HOME`, Program Files, Minecraft runtime и известных vendor directories; запускает `java -version`, извлекает major version с cache, выбирает совместимую/самую новую, читает `javaVersion.majorVersion` из version JSON с `inheritsFrom` fallback и проверяет minimum. Для отсутствующей Java формирует ссылку Adoptium и команду winget.

Сильные стороны: практичный Windows discovery, cache, legacy version parsing, поддержка Minecraft runtime и явная ошибка несовместимости.

Ограничения: Windows-first пути, subprocess timeout без отдельного cancellation, fallback Java 17 может быть неверным для новых версий, download URL только открывается — автоматической установки нет. Cache не различает «не найдено» и неудачную проверку достаточно явно. Это environment detector, а не общий runtime manager.

В Nexus Core стоит вынести интерфейс `RuntimeResolver` (`discover`, `validate`, `required_version`, `launch_path`) и процессные проверки. Конкретные Java vendors, Minecraft JSON и winget/Adoptium остаются в Minecraft adapter.

### Launcher и Process Launcher

`core/launcher.py:Launcher.launch_instance()` — монолитный orchestration method. Он проверяет свободный диск и запись, loader compatibility, устанавливает Minecraft через `minecraft_launcher_lib`, ставит loader, определяет required Java, получает account launch profile, готовит skin/authlib, resolution и JVM args, генерирует command, редактирует токены в логах, вызывает `subprocess.Popen` и запускает watcher.

Готово для MVP: реальный запуск, progress callbacks, timeout-friendly error, disk/write checks, loader integration, Java compatibility, token redaction, process watcher и `last_played`.

Главные ограничения: одна функция соединяет network install, auth, filesystem, process и UI callbacks; `Popen` не получает persisted job/process record, stdout/stderr не подключены к Logs page как структурированный stream, нет общей `stop/kill/terminate`, нет process tree cleanup, exit code не возвращается через Core event, `active process` не восстанавливается после перезапуска. `launcher_settings` и UI thread сами управляют частью состояния.

В Nexus Core перенести только `ProcessSpec`, `ProcessHandle`, lifecycle events, timeout, cancellation, stdout/stderr capture, exit status и redaction. Minecraft-specific оставить: command generation, JVM arguments, loader launch version, skin/authlib, game directory and Java rules. Launcher следует переписать в последовательный pipeline с отдельными `InstallService`, `RuntimeResolver`, `AuthProvider`, `ProcessSupervisor`.

### Auth system

`auth/account_manager.py` поддерживает offline profiles, active account, Microsoft и Ely.by, нормализует launch profile и хранит access/refresh tokens в `data/accounts/tokens/<id>.json`. Accounts metadata и tokens разделены файлами, но токены не шифруются и не используют присутствующий в requirements `keyring`.

`microsoft_auth.py` использует `minecraft_launcher_lib` secure login data, state/code verifier и refresh. `ely_auth.py` строит PKCE URL, использует state/code verifier, scopes `offline_access` и `minecraft_server_session`, обновляет токены и может подготовить Ely authlib. `oauth_callback_server.py` — one-shot localhost HTTP callback.

Сильные стороны: несколько identity providers, offline fallback, refresh path, PKCE/state у Ely и токен не печатается в команде запуска.

Ограничения: secrets at rest plaintext, callback server собирает URL из Host header и не является полноценным hardened OAuth receiver, state lifecycle зависит от service instance, нет единого expiry/revocation model, logout/revoke semantics ограничены, account metadata JSON lacks migration. В старой копии `ely_is_configured()` требует client secret; новая public-client схема лучше для desktop, поэтому это ещё одна причина выбрать новую копию.

В Core можно вынести `Identity`, `AuthProvider`, token expiry/refresh, state/PKCE validation, login/logout events и secret storage interface. Minecraft-specific остаются Microsoft/Xbox/Minecraft session exchange, Ely authlib, skins/capes и launch profile mapping. Storage backend должен быть DPAPI/Windows Credential Manager/keyring, а не открытый JSON.

### Update system

`core/updater.py` читает GitHub Releases API, fallback `website/release.json`, нормализует semver-like tags, выбирает Setup EXE/portable asset, скачивает во временный файл, считает SHA-256, ищет checksum asset, пишет update notes и создаёт helper script. Новая копия ждёт завершения родительского PID через `tasklist`; старая использовала фиксированную задержку.

Сильные стороны: два источника metadata, retries, asset preference, temp download, hash calculation, installer/portable distinction и deferred installer launch.

Критический недостаток: `verify_download_checksum()` при отсутствии checksum asset возвращает `local hash only`, то есть update может быть запущен без внешнего доказательства целостности. Нет подписи релиза, pinned publisher key, rollback, staged update, update state machine и atomic replacement of the running binary beyond installer behavior. Website metadata и GitHub repo могут рассинхронизироваться; release.json — fallback, не cryptographic trust root.

В Core можно взять generic `ReleaseInfo`, source fallback, resumable download job, checksum/signature verification contract и deferred installer lifecycle. GitHub asset naming, Inno Setup, Windows tasklist и `release.json` остаются Minecraft Launcher product code. Для production update checksum/signature must be mandatory.

## Состояние и зрелость

Проверенные признаки зрелости по коду и имеющимся CI:

- `Nexus_Minecraft/Nexus_Minecraft/.github/workflows/ci.yml` запускает Python 3.12, compile check, `unittest discover` и `tools/deep_qa.py`;
- присутствуют security regression tests для modpack paths, HTTPS host allowlist, SHA-512 и удаления файла при hash mismatch;
- `project_integrity` проверяет website release metadata, CI и UI regression guards;
- `Nexus_minecraft_launcher` имеет более старый commit history и меньше модулей;
- в текущем окружении зависимости PySide6, `minecraft_launcher_lib`, requests и keyring не установлены, поэтому live GUI/launcher tests здесь не запускались; вывод основан на исходниках, тестах и CI-конфигурации.

Тесты хорошо покрывают статические контракты сайта, modpack security и отдельные UI regressions. Они почти не покрывают DownloadManager, VersionManager, InstanceManager, Java discovery, Popen lifecycle, OAuth exchange и updater checksum policy. Поэтому проект зрелее обычного scaffold, но слабее production launcher с точки зрения stateful core.

## Что переносить в Nexus Core

| Компонент | Решение | Условия |
|---|---|---|
| Atomic JSON write / retry ideas | Перенести идею | В Core основной backend — SQLite/transactional Store; JSON только adapter |
| Download task state machine | Перенести | Добавить cancellation, retry budget, checksum, durable events, multi-process ownership |
| Version catalog boundary | Перенести интерфейс | Minecraft/Mojang implementation оставить adapter-у |
| Instance lifecycle | Частично | Generic workspace/project identity; Minecraft fields остаются domain plugin |
| Java discovery | Перенести интерфейс | Реализация platform/Minecraft-specific |
| Process supervision | **Да, при переписывании** | Persist handle, capture output, cancel/kill, restart/reconcile |
| Auth lifecycle | Частично | Core identity/token contracts; provider-specific exchanges outside |
| Updater | Частично | Generic signed release manager; Windows installer implementation outside |
| Modpack path and hash checks | Нет в универсальный Core | Оставить Minecraft security adapter; reuse security primitives |
| PySide6 UI pages | Нет | Это Minecraft client; Nexus Core exposes events/API instead |

## Что оставить только Minecraft-specific

Minecraft version manifest, Fabric/Forge/NeoForge/Quilt, Modrinth API and `.mrpack`, `.minecraft` directory layout, Java major rules from Minecraft manifests, JVM command generation, Microsoft/Xbox/Minecraft session conversion, Ely authlib/skins/capes, shader/resource-pack/mod compatibility, Discord Rich Presence for game state, Inno Setup and website release naming.

## Что требует переписывания

1. `Launcher` разделить на install pipeline, runtime resolver, auth profile resolver and process supervisor.
2. Replace `DownloadManager` JSON ledger with transactional job store and explicit state machine; retain JSON import only for existing users.
3. Add schema versions and migrations for instances, settings, accounts and downloads; repair absolute paths on import.
4. Move tokens to DPAPI/Credential Manager/keyring and model expiry/revocation explicitly.
5. Make updater reject unsigned/unchecksummed assets, verify publisher/signature, support rollback and record update state.
6. Add real process control: PID/creation identity, stdout/stderr, cancel, kill tree, exit reason and crash reconciliation.
7. Add unit tests around the seven requested subsystems, with mocked external APIs and filesystem temp fixtures; keep UI tests separate.
8. Make VersionManager cache releases and expose stale/offline behavior; add cancellation and schema validation.
9. Decide whether website-next is a future site or remove it from the build graph; README says it is currently not used in deployment.

## Final decision

Use `Nexus_Minecraft/Nexus_Minecraft` as the canonical Minecraft launcher source. Keep `Nexus_minecraft_launcher` as read-only historical baseline until data migration and release parity are verified. Extract generic contracts from DownloadManager, InstanceManager, Java Manager, Auth and Process/Update services into Nexus Core, but keep Minecraft protocol, loaders, game layout and provider integrations behind adapters. Do not copy the monolithic launcher, plaintext token storage or permissive updater policy into Nexus Core.
