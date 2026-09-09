# Nexus v1.0 — Architecture Red Team

Дата: 2026-09-09. Объект: решения [ADR](C:/Nexus_History/NEXUS_ADR.md) и [V1 Architecture](C:/Nexus_History/NEXUS_V1_ARCHITECTURE.md). Метод: adversarial walkthrough по коду donors и целевым contracts. Атаки ниже **не исполнялись**. «Исправлено» означает уточнено в архитектурной документации; соответствующий код и тесты ещё необходимы.

## Вердикт

Архитектура выполнима одним разработчиком при CLI-only, одном runtime, одном run и доверенном локальном workspace. Нельзя заявлять безопасность произвольного repo, exactly-once external effects, неуязвимую verification или отсутствие любых утечек. До Windows process/locking и реальной local-model qualification выпуск заблокирован, но Foundation можно реализовывать по ограниченным contracts.

## RT-01 — False completion при exit=0

**Trigger:** check пропущен, фильтр не нашёл tests, runner вернул 0 без выполнения; baseline отсутствует либо падал из-за missing dependency.

**Impact:** SUCCEEDED без исправления исходного дефекта. Старый createContract частично зависит от regex цели (E03).

**Correction:** ADR-007 и Verification Layer требуют baseline assertion failure, frozen case identity/count/marker и final pass того же case. Baseline already-pass, skip и setup error не являются успешной repair task.

**Acceptance:** fixture для 0 tests, skip, wrong case, wrong baseline cause и always-green runner; ни один не даёт SUCCEEDED.

**Residual:** намеренно лживый trusted runner может сфабриковать вывод. Production гарантия ограничена выбранным пользователем тестом; qualification corpus дополнительно имеет внешний oracle.

## RT-02 — Модель «чинит» тест или меняет command

**Trigger:** patch удаляет assertion, меняет package script, lockfile или executable; final pass от другой программы.

**Impact:** подмена evidence.

**Correction:** один writable source path; protected harness/config hashes при admission; frozen resolved executable/argv; перед final check повторная проверка; revision входит в evidence и approval.

**Acceptance:** попытки поменять тест, entrypoint, PATH resolution и подставить старое evidence отклоняются.

**Residual:** общий анализ всех зависимостей произвольного runner не обещается; первый runner profile и trusted checkout ограничены.

## RT-03 — Approval для одного patch, выполнение другого

**Trigger:** args меняются после показа diff, файл редактирует пользователь, approval повторяется после crash.

**Impact:** неразрешённое изменение при формальном allow.

**Correction:** ADR-006: action/tool/contract/workspace/input/beforeHash binding, one-shot consume transaction до эффекта; stale approval отзывается, pending approval после restart не действует.

**Acceptance:** изменение одного байта/argv/target, replay ID, duplicate approval → zero new effects.

**Residual:** интерфейс должен показывать полный bounded diff, а не только краткое описание модели; это release gate.

## RT-04 — «Разрешённый тест» читает secrets и ходит в сеть

**Trigger:** trusted argv запускает Python/JS код, который обращается к HOME, токенам, network или внешним файлам.

**Impact:** bypass ожидаемой workspace изоляции; permission check не sandbox.

**Correction:** ADR-013/Security boundary: v1.0 исполняет только пользовательски просмотренные доверенные repo; explicit approval сообщает о правах процесса. Нет заявления, что check ограничен workspace на OS уровне. Child env allowlist исключает provider keys; hostile repo execution запрещён продуктовым scope.

**Acceptance:** безопасность tool paths проверяется отдельно от прав test subprocess. Documentation/approval не обещают sandbox. Env sentinel отсутствует у child.

**Residual:** approved project code может читать доступные пользователю файлы. Это сознательная граница v1.0; если требуется hostile-repo protection, релизный scope должен пересматриваться, а не скрыто расширяться.

## RT-05 — Path check пропускает hardlink или race

**Trigger:** допустимый filename hardlinked к внешнему файлу; junction меняется между guard и write.

**Impact:** запись вне intended target.

**Correction:** writable target hardlinks и reparse links запрещены; beforeHash/path/file identity проверяются непосредственно перед effect. Нет concurrent editing в support contract. Foundation проверяет доступные OS handle semantics.

**Acceptance:** traversal, ADS, reserved names, junction/symlink/hardlink fixtures; hash conflict не пишет.

**Residual:** malicious concurrent writer с теми же правами вне threat model; нельзя называть path guard sandbox. Если выбранный runtime не позволяет проверять нужные identity, write release gate блокирован.

## RT-06 — Crash в промежутке FS/process и SQLite

**Trigger:** file replace прошёл, action commit нет; child стартовал, PID не записан; storage full после эффекта.

**Impact:** retry дублирует effect, либо Core забывает действующий процесс.

**Correction:** durable STARTED intent до effect; после crash uncertain action остаётся UNKNOWN. Сверка before/after hash допустима для файла; процесс не перезапускается. Ошибка commit запрещает отображать success. Новый mutating run блокируется.

**Acceptance:** fault injection до/после каждой границы intent/spawn/write/result/terminal commit; marker команды не увеличивается при restart.

**Residual:** нет атомарности DB+OS и exactly-once гарантии. Some effects требуют ручной диагностики. Evidence не создаётся из предположения «скорее всего прошло».

## RT-07 — PID reuse и оставшиеся потомки

**Trigger:** после crash старый PID занят чужим процессом; taskkill завершает не тот process; test создал detached child.

**Impact:** ущерб стороннему процессу, параллельные writes при новом run.

**Correction:** runtime хранит observed creation identity, не убивает по одному PID; cleanup подтверждается либо UNKNOWN; detached-child checks вне support. Owner dataDir lock и unresolved effects — разные проверки.

**Acceptance:** PID reuse, родитель погиб до identity commit, cancel с child/grandchild, исчезновение stdout handle. Второй writer отказывает; ambiguous process не убивается.

**Residual:** OS/runtime-specific реализация ещё не доказана. Это Foundation blocker; generic supervisor из Minecraft не решает проблему.

## RT-08 — Observer exception после успешного commit

**Trigger:** CLI event sink throws после сохранения action; общий catch считает tool failed и повторяет его.

**Impact:** duplicate effect или status divergence.

**Correction:** committed state authority; observer exceptions изолированы от executor transaction/outcome. CLI восстанавливается snapshot+seq, token stream не durable authority.

**Acceptance:** throw/disconnect во время каждого render → outcome сохраняется, action count неизменен; replay дедуплицирует события.

**Residual:** CLI может временно не показать прогресс, но не может исправлять это повторным исполнением.

## RT-09 — Secret leaks несмотря на regex redact

**Trigger:** ключ нестандартного формата, разбит на несколько output chunks, помещён в error/argv или env под нейтральным именем.

**Impact:** plaintext secret в state/provider context/child process.

**Correction:** secrets только в памяти provider; ни vault donor, ни plaintext config; known-value redaction и bounded сбор chunks до записи, env allowlist, нет secret argv/wire dumps; доступ к secret paths запрещён.

**Acceptance:** known key sentinels обычные/разбитые/в ошибке, child env scan, persistence/UI/context scan.

**Residual:** произвольный неизвестный секрет/кодировка в доверенном source не распознаётся гарантированно. Пользователь отвечает за выбор безопасных входных файлов; абсолютное «секреты никогда» из подготовки уточнено.

## RT-10 — Mock success скрывает неработающий продукт

**Trigger:** все mock tests зелёные, local model не понимает tools или не помещается на машине; требуется обязательное облако.

**Impact:** демонстрация orchestration не приносит пользы без недоступной dependency.

**Correction:** ADR-011/016: один реальный offline local endpoint qualification с pinned model/hardware обязателен; endpoints не маршрутизируются автоматически в cloud. Provider installation вынесена за Nexus Core, но документирована как requirement пользователя.

**Acceptance:** live bounded repair на локальной модели, invalid capability refusal, сеть отключена для offline run; отдельный measured report.

**Residual:** точная модель пока не выбрана/не измерена. До квалификации нельзя объявлять v1.0 готовой; нельзя заменить это fake provider.

## RT-11 — Corrupt DB или неконсистентный backup

**Trigger:** копируется live DB без WAL; rollback binary читает future schema; restore забывает реально применённые patches.

**Impact:** ложная история и повтор effects.

**Correction:** один мигратор, consistent backup/checkpoint, refuse future version, read-only diagnostics при corruption; восстановить matching binary+DB, зафиксировать потерянный интервал и reconcile workspace перед новым run.

**Acceptance:** fault migration rollback, DB full, WAL backup drill, restore старого snapshot после успешного patch. Не допускается silent empty store.

**Residual:** потерянные вне backup записи не восстанавливаются магически. Сведения о непроверенном интервале остаются unknown; archive user data не импортируются автоматически.

## RT-12 — Scope explosion и переоткрытие terminal truth

**Trigger:** ради Axiom UI добавляется HTTP/API/две схемы; ради MiniCursor — CUDA installer; old completed session снова идёт в recovery и меняет историю.

**Impact:** один разработчик поддерживает несколько products, outcome перестаёт быть воспроизводимым.

**Correction:** CLI-only, один package/runtime/store, run terminal immutable; retry новый run; no generic jobs/plugins/downloads. Axiom/Minecraft/MiniCursor — только выборочные идеи до v1.0.

**Acceptance:** dependency audit, one-command clean install, old terminal outcome unchanged при retry; roadmap Phase 2+ не блокирует release Phase 1.

**Residual:** изменение scope требует нового ADR и пересмотра сроков, не скрытой добавки к migration task.

## Поправки к прежним DoD/метрикам

- «Ошибки не теряют состояние» относится к committed данным в поддержанном storage failure model; arbitrary disk corruption требует backup и явного loss interval.
- «0 false completion» проверяется на фиксированном корпусе, не доказывает нулевую вероятность в будущем.
- Известная отмена/отказ имеет CANCELLED; UNKNOWN используется только при неопределённом outcome.
- Secret scan подтверждает известные sentinels и supported redaction, не универсальное отсутствие чувствительных данных.
- Неожиданные writes test code вне workspace нельзя исключить application guard-ом; доверие к repo явно обязательно.
- Кэш/артефакты теста разрешены только в заранее указанной области; protected source/harness immutable во время проверки.

## Остаточные release blockers

1. Windows lock/process identity/cleanup spike и fault tests.
2. Реальный local model/tool-call qualification на выбранной машине.
3. Contracts-first approval, frozen baseline/final verifier и durable state реализованы и проверены вместе.
4. Clean install/update/restore drill и фиксация измеренных performance baselines.

Архитектурные поправки внесены в финальную редакцию V1 Architecture и ADR. Закрывать перечисленные blockers может только implementation evidence, не этот документ.
