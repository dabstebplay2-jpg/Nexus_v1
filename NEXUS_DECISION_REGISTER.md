# Nexus Decision Register

Дата: 9 сентября 2026 года  
Статус: **вопросы для GPT-6 Principal Architect**. Ниже нет принятых архитектурных решений и нет приказа начинать миграцию.

## Правило принятия решений

Каждый ADR должен получить выбранный вариант, границы применимости, критерии проверки, владельца решения и план обратимости. Пока этого нет, рекомендация аудита остаётся рекомендацией. Нельзя считать выбор сделанным только потому, что один исторический проект выглядит зрелее другого.

## ADR-001 — Host Runtime

**Question:** какой runtime является обязательным для Nexus v1.0?

**Current evidence:** NexusCLI работает на Bun и использует `bun:sqlite`; Axiom работает на Node.js и использует `node:sqlite`.

**Options:** Bun; Node.js; runtime-specific adapters; отдельные executable packages с transport boundary.

**Why important:** решение влияет на SQLite driver, streams, process APIs, packaging, native dependencies, тесты и CI.

**Required decision:** выбрать primary runtime или формально разрешить два; определить поддерживаемые версии и доказательство совместимости.

## ADR-002 — Repository Structure

**Question:** как организовать Core, applications, adapters и исторические clients?

**Current evidence:** архив содержит независимые проекты, две копии Minecraft launcher и родительский OpenCode snapshot.

**Options:** monorepo; несколько репозиториев с versioned contracts; Core repository плюс external clients; staged extraction.

**Why important:** неверная структура смешает чужой reference code с продуктом и усложнит миграции, releases и ownership.

**Required decision:** определить канонический source tree, границы packages, ownership и правила для архивных baseline.

## ADR-003 — Core Boundary

**Question:** что является Nexus Core, а что остаётся application/domain adapter?

**Current evidence:** NexusCLI даёт AgentLoop и execution; Axiom — chat/storage/UI; Minecraft — runtime/process/update contracts; cloud содержит auth/billing/connectors.

**Options:** narrow execution Core; shared session/context Core; broad platform Core; separate local and cloud cores.

**Why important:** слишком широкий Core потянет Minecraft, billing, IDE и UI dependencies; слишком узкий не даст повторно использовать проверенные механизмы.

**Required decision:** перечислить обязательные Core capabilities и явные исключения с dependency direction.

## ADR-004 — Agent/Chat Separation

**Question:** как разделить обычный чат, coding task и autonomous agent execution?

**Current evidence:** Axiom ChatCore и NexusCLI AgentLoop имеют разные state machines и completion semantics.

**Options:** отдельные services; два modes поверх common primitives; единый loop с capability profiles.

**Why important:** пользовательский ответ не является доказательством side effect; общий loop может усложнить UI и persistence.

**Required decision:** определить entities, lifecycle, cancellation, permissions и completion criteria каждого режима.

## ADR-005 — Tool Protocol

**Question:** какой typed protocol используется для локальных, cloud и domain tools?

**Current evidence:** NexusCLI имеет typed registry/executor; старый Nexus имеет legacy text action extraction; cloud connector loop ограничен.

**Options:** NexusCLI-derived contract; MCP-compatible boundary; custom envelope; separate local/cloud protocols with shared metadata.

**Why important:** protocol определяет authorization, schemas, replay, timeout, audit и совместимость UI/providers.

**Required decision:** зафиксировать call/result/error/approval/capability schema и правила для legacy adapters.

## ADR-006 — Event Protocol

**Question:** как передавать token deltas, task activity, tool results, progress, approvals и process output?

**Current evidence:** Axiom использует NDJSON/chat events; NexusCLI не имеет доказанного общего live token stream; Minecraft хранит progress snapshots и UI callbacks.

**Options:** versioned event envelope; event bus плюс transport adapters; раздельные streams; polling для части jobs.

**Why important:** event ordering, replay, reconnect и durable/ephemeral semantics влияют на UI и recovery.

**Required decision:** определить event types, sequence/correlation IDs, persistence, acknowledgement и reconnect behavior.

## ADR-007 — Storage Strategy

**Question:** какое хранилище является каноническим для локального состояния?

**Current evidence:** Axiom и NexusCLI имеют разные SQLite paths; Minecraft использует JSON ledgers; cloud использует server database.

**Options:** one SQLite database; bounded SQLite stores; SQLite plus file/object storage; JSON only for import/cache.

**Why important:** storage choice определяет migrations, transactions, multi-process safety, backup, portability и schema ownership.

**Required decision:** выбрать canonical store, migration policy, backup/repair policy и импорт старых JSON/SQLite данных.

## ADR-008 — Memory Architecture

**Question:** какие типы memory поддерживаются в v1.0?

**Current evidence:** conversation history, task context, profiles, JSON memory and claimed vector memory существуют раздельно и имеют разную зрелость.

**Options:** only conversation/task context; profile plus context; pluggable retrieval; full vector/RAG system.

**Why important:** memory affects privacy, deletion, prompt size, reproducibility, cost and trust.

**Required decision:** определить types, retention, provenance, retrieval policy, deletion/export and whether vector search is in scope.

## ADR-009 — Context System

**Question:** как формировать context для Chat и Agent turns?

**Current evidence:** Axiom имеет context policy; NexusCLI — context manager и session history; cloud and legacy paths add different metadata.

**Options:** shared context builder; mode-specific builders; explicit context layers with budget allocator.

**Why important:** смешивание old messages, files, memory и tool results создаёт leakage и token-budget failures.

**Required decision:** определить precedence, provenance, truncation/summarization, user controls and context budget.

## ADR-010 — Secret Storage

**Question:** где и как хранить provider keys, OAuth refresh tokens и connector credentials?

**Current evidence:** Minecraft stores tokens in plaintext JSON; Axiom encrypted-file backend keeps key nearby; NexusCLI supports environment-variable indirection; cloud has its own credential boundary.

**Options:** OS keychain/DPAPI; external secret manager; encrypted file with separately protected key; environment-only for local development.

**Why important:** leaked tokens compromise accounts and invalidate local trust model.

**Required decision:** выбрать production backend, fallback behavior, rotation/revocation, redaction and migration of existing secrets.

## ADR-011 — Plugin System

**Question:** нужен ли plugin protocol в v1.0 и где проходит trust boundary?

**Current evidence:** legacy projects mention plugins/tools; future ideas include marketplace; no single verified plugin contract exists.

**Options:** no plugins in v1.0; in-process trusted packages; subprocess plugins; capability-limited external protocol.

**Why important:** plugin loading adds versioning, permissions, sandboxing, signing, compatibility and support burden.

**Required decision:** либо исключить plugins из v1.0, либо определить manifest, capabilities, lifecycle, signing and failure isolation.

## ADR-012 — Process Management

**Question:** какие процессы управляет Core и как переживается restart/crash?

**Current evidence:** Minecraft Launcher напрямую использует `Popen`; Java Manager обнаруживает runtime; NexusCLI имеет tool execution/recovery, но общий supervisor не доказан.

**Options:** one supervisor contract; supervisors by process class; foreground-only v1.0; persisted job/process registry.

**Why important:** PID, process tree, output capture, cancellation, cleanup and reconciliation are safety-critical for long tasks.

**Required decision:** определить supported process classes, identity model, persistence, kill policy and platform scope.

## ADR-013 — Security Model

**Question:** какой threat model и authorization model обязательны для v1.0?

**Current evidence:** NexusCLI has permissions/approvals; legacy security gate is incomplete; loopback checks are not public auth; Minecraft updater and token storage need hardening.

**Options:** local single-user trust model; capability-based local model; multi-user tenant model; layered local/cloud models.

**Why important:** tools, files, network, secrets, updates and plugins have different attack surfaces.

**Required decision:** threat actors, capabilities, approval rules, secret handling, network policy, audit requirements and release blockers.

## ADR-014 — Migration Strategy

**Question:** что и в какой последовательности переносить из архивных проектов?

**Current evidence:** NexusCLI AgentLoop and Axiom Chat lifecycle are strongest candidates; Minecraft and old Nexus contain useful adapters and historical data; no unified schema exists.

**Options:** greenfield Core with importers; incremental extraction; compatibility shell; freeze/archive all legacy clients.

**Why important:** direct copy preserves hidden coupling and security defects; greenfield without import loses proven behavior and user data.

**Required decision:** define source components, acceptance tests, data import guarantees, deprecation window and rollback plan.

## ADR-015 — Provider and Model Registry

**Question:** как различать model catalog, endpoint, runtime, credentials и capability?

**Current evidence:** Axiom, NexusCLI, MiniCursor and cloud each model providers differently.

**Options:** single registry; local/cloud registries; provider plugins; static config plus runtime discovery.

**Why important:** registry design controls failover, streaming/tool capabilities, secrets and user-visible model selection.

**Required decision:** entity model, capability schema, ownership of credentials, discovery and compatibility policy.

## ADR-016 — Testing and Evidence Standard

**Question:** какие доказательства нужны, чтобы компонент считался готовым?

**Current evidence:** selected tests pass in NexusCLI/Axiom/cloud/MiniCursor, but GUI, OAuth, Popen, updater and external models are mostly untested; some reports rely on static analysis.

**Options:** unit-first; contract tests across adapters; hermetic integration suite; release gates by risk tier.

**Why important:** passing historical tests is not evidence of integration or production readiness.

**Required decision:** define test tiers, required fixtures, external dependency mocks, security gates and definition of done.

## ADR-017 — Local/Cloud and Client Boundary

**Question:** что остаётся local-first, а что принадлежит cloud/site/IDE/browser?

**Current evidence:** `Nexus_Ai_site` includes accounts, billing, connectors, IDE and browser; Axiom/NexusCLI are local foundations.

**Options:** local Core with optional cloud adapters; cloud-first service; separate products with shared protocol.

**Why important:** boundary determines privacy, auth, deployment, offline behavior and dependency size.

**Required decision:** ownership of accounts, billing, sync, connector credentials, browser automation and offline mode.

## ADR-018 — Versioning and Release Identity

**Question:** как будут версионироваться Core, clients, adapters, schemas and persisted data?

**Current evidence:** archive has conflicting project versions, two Minecraft launcher versions and independent package manifests.

**Options:** one Nexus version; independently versioned packages; compatibility matrix; schema/API version decoupling.

**Why important:** without release identity, “newer” code may not be a compatible or reproducible baseline.

**Required decision:** semantic version rules, compatibility guarantees, migration markers, release provenance and archive policy.

## ADR-019 — Observability and Audit

**Question:** что должен сохранять Nexus для диагностики и доказательства результата?

**Current evidence:** NexusCLI records actions/evidence/inbox; Axiom persists partial generation; Minecraft records download snapshots; legacy security audit can be non-blocking.

**Options:** durable task ledger; structured logs plus traces; evidence bundles per task; client-only logs.

**Why important:** recovery, support and completion claims require reconstructable state without leaking secrets.

**Required decision:** audit event schema, retention, redaction, correlation IDs, export and operator/user visibility.
