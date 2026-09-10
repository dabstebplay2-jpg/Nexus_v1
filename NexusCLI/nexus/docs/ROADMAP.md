# Roadmap and release limits

## Implemented foundation (0.1)

- Separate runnable package, strict TypeScript, composition root, public API and CLI.
- SQLite migrations, durable sessions/inbox/ledger/evidence/turns/epochs, transaction boundaries and local ownership.
- Explicit agent state machine, trusted completion contract, fingerprint freshness and test-harness integrity checks.
- Tools with schema validation, captured implementations, file hashes, workspace guard, bounded output and permission requests.
- OpenAI-compatible streaming/non-streaming provider; context sources, deterministic compaction, lexical retrieval and import edges.
- Node/Python/Rust/Go/.NET detection, Git baseline and recorded agent diff.
- UNKNOWN reconciliation, guarded process execution, cancellation, hard budgets and loop detection.
- Deterministic loop, real filesystem/SQLite/process/HTTP integration tests; small NexusBench with external oracle.

## Phase 0 foundation (0.2.2 -> 0.3)

- Incremental workspace index: metadata-keyed hash cache plus a Merkle tree, so a verifying turn re-reads only what changed. Completion fingerprint unchanged byte for byte.
- Storage v2: append-only transcript and event ledger with typed projections, bounded reads, and an in-place v1 -> v2 migration. Session growth is linear.
- Trust Manifest: harness and build configuration pinned per contract revision, with exclusive anchors that may not even be introduced and extensible anchors that may only grow.
- Sandbox ports (`SandboxProvider`, `ExecutionPolicy`, `NetworkPolicy`) wired through tool and verification execution, with capabilities recorded in evidence. No container backend yet.

## Next recommended stage

1. Run the existing scenario suite with a configured real local and remote model; collect provider compatibility and task-success traces. Current tests do not establish live model quality.
2. Expand NexusBench to varied real bug repositories and independent hidden regression suites. Report confidence intervals and false-completion denominator, not just a small-fixture percentage.
3. Add isolated execution behind the existing `SandboxProvider` port (Windows job objects/AppContainer or a container backend), native HTTP/runtime verifier drivers, resource accounting and fuller executable recovery inspection. Phase 0 shipped the ports and an honest unisolated local provider; nothing yet reports `enforced` isolation.
4. Improve project adapters for monorepos, nonstandard package-manager shims, partial test selection and toolchain-specific output parsers. Python/Rust/Go/.NET detection is tested here; those toolchains were not built end to end in this environment.
5. Introduce versioned public event schemas, token/cost accounting, nested instruction scoping and richer symbol retrieval. Session save is append-only as of Phase 0 and the ledger provides a durable cursor, so history projections are indexed rather than rewritten; a million-message workload is still not a target.
6. Add TUI after these reliability gates, consuming NexusAPI without importing runner internals.

## Deliberately not claimed

This is not a production-certified autonomous agent, a guarantee of zero false completion on arbitrary software, or an OS sandbox. There is no multi-agent orchestration, cloud, MCP/plugin ecosystem, browser, TUI, or native Anthropic/Gemini adapter. Reasoning/vision/structuredOutput capabilities are described but not used to implement extra modalities. Local tools settle sequentially. Summary generation is deterministic and bounded; retrieval is lexical. Automatic recovery of arbitrary process side effects is intentionally absent.

For arbitrary natural-language goals, a trusted goal scenario or a human assertion remains necessary. Existing tests can be weak; an exit code alone is not a proof of correctness. Large source trees above 200,000 files fail closed; choose a smaller workspace. Individual large files no longer fail closed: above 8 MiB they are hashed as a stream, which yields the same sha256, and the incremental index reads each one only when its metadata changes. Generated/dependency folders are excluded from source fingerprints. A hostile process with OS access can tamper with agent data, checks or files; isolation is outside this version's guarantees.
