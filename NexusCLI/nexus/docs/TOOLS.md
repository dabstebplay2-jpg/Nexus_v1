# Tools and Permissions

Tool definition has name, version, input/output schema, risk, sideEffect, idempotency, timeout, required capabilities and execute. Zod validates both boundaries. ToolRegistry captures implementation identity and advertised JSON schema per provider turn; replacement after capture causes STALE_TOOL, not execution of new code.

Built-ins: read, write, edit, list, glob, search, retrieve, bash, git_status, git_diff, output, update_plan, verify. `search` is bounded literal search, avoiding regex denial of service. `retrieve` ranks paths lexically, then extracts import edges from selected candidates. This is not a language-server symbol index.

read returns a content hash and range metadata. write requires expectedHash=null for a new file or the current hash for an existing file. edit requires a unique exact match plus expectedHash. Writes use a temporary sibling and rename. The ledger stores redacted before/after contents; `nexus diff` renders precise sequential agent edits relative to the user's pre-edit content. Shell changes cannot be attributed with equivalent precision.

Model-visible output is bounded with head/tail, total length, truncation indicator, action ID and evidence ID. Full redacted output remains in SQLite and is retrievable through output offsets. Read limits are 2 MiB per file; search reads at most 1 MiB per candidate. Process output storage is capped at 4 MiB and a runaway writer is terminated. Limits bound both context and storage abuse.

Capabilities: READ, WRITE_PROJECT, WRITE_OUTSIDE_PROJECT, RUN_PROCESS, RUN_TESTS, NETWORK, INSTALL_PACKAGE, DELETE, GIT_MUTATE, SECRET_ACCESS, SYSTEM_MUTATION. Default read/write project allow; processes/checks/network/install/git ask; outside/secret/system/delete deny. Explicit rules may be injected at composition. Permission UI approves the exact displayed action. Missing UI never silently approves.

Workspace Guard rejects traversal, symlink/junction components, .git/.nexus, typical secret paths, Windows devices, ambiguous trailing dots/spaces and NTFS streams. The shell denylist is a conservative filter, not a security boundary. Arbitrary approved shell and project scripts have OS privileges; approval means trusting the entire script, including nested commands. An OS sandbox is required for adversarial code. Ordinary hash conflicts are detected, but filesystem checks cannot eliminate malicious external TOCTOU races.

On Windows, common npm/pnpm/yarn shims are resolved to their Node entrypoint without creating another shell. Nonstandard shims need a native executable/Node entrypoint. Windows bash tool deliberately uses PowerShell; on Unix it uses sh. Process cancellation terminates the process tree on Windows and the process group on Unix. Secret-looking environment variables are removed from child environment; common secret patterns are redacted from stored outputs. This is best-effort redaction, not a guarantee against arbitrary encoded secrets.
