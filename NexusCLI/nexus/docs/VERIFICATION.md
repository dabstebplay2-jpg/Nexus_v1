# Verification and Completion

Completion Contract is constructed at session admission from detected project checks and an optional explicit user goal command. It has a revision and trusted check definitions. Steering invalidates prior requirement-specific evidence and the old goal command; the updated requirement needs new confirmation.

Node adapters inspect scripts and lockfiles for npm, pnpm, yarn, Bun. Python uses pytest/uv; Rust cargo test/build; Go go test/build; .NET dotnet test/build. These are suggestions for project execution, not proof that every project follows those conventions. Choose an appropriate package root in a monorepo.

Every command check is run as argv, timed and recorded in ActionLedger. Verification creates TEST_RESULT, BUILD_RESULT, LINT_RESULT, TYPECHECK_RESULT or a caller-selected evidence kind, including GOAL_ASSERTION/RUNTIME_CHECK. A custom trusted script can start a service, call an endpoint and validate behavior; dedicated server-lifecycle and HTTP verifier plugins are not implemented yet.

Evidence binds source, check ID, contract revision and workspace fingerprint. Fingerprints cover ordinary source files, exclude dependency/output folders and standard secrets, and fail closed above configured file/size limits. If a check changes source while running, its result is unknown. Earlier results cannot prove a modified workspace. Existing test files, manifests and explicit goal scripts are hashed at admission; modified/deleted harness files cannot produce passing evidence until an explicit user review through trust-checks.

CompletionPolicy rejects unresolved runtime errors and STARTED/UNKNOWN side effects. It requires current passing verification for each required check and a completed plan. Arbitrary bash output, a zero exit code from an untrusted command, or model-created GOAL_ASSERTION cannot satisfy the contract.

For the exact supported failing-tests request, baseline failing evidence and later passing evidence from the same trusted test are mandatory. Recognition is intentionally narrow: a compound request such as “fix tests and implement login” does not collapse into a tests-only goal. Failure exit code establishes that the test command failed, not a semantic proof of its root cause; the trusted harness must be meaningful.

General goals require --goal-command or explicit personal scenario confirmation. Human confirmation remains labeled source=user; it is never presented as an automated runtime check. If a model lacks tools, --answer supports informational conversations only.

Important limits: workspace hashes do not describe external databases, network state, hidden environment or dependencies excluded from scanning. Passing tests prove only their assertions. Existing checks may themselves be inadequate; new model-created tests are not independent proof of arbitrary semantics. A trusted external harness, as used by NexusBench, provides stronger isolation than tests writable by the agent.
