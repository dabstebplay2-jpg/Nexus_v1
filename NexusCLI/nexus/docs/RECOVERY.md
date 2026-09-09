# Recovery

Durable action lifecycle:

```text
PLANNED -> permission -> STARTED -> SUCCEEDED / FAILED
                              \-> UNKNOWN (interruption or uncertain outcome)
UNKNOWN -> inspect -> VERIFIED / explicit user resolution
```

Actions are committed before effects begin. File write intent includes before/after hashes before the atomic rename. Successful action and Evidence are committed in one transaction. An interrupted read is failed and can be requested again. A process that never started is FAILED, not UNKNOWN; a started process interrupted by timeout/cancellation is conservative UNKNOWN.

On explicit resume, STARTED provider turns become UNKNOWN. Side-effect actions become UNKNOWN; no automatic provider/tool replay occurs. Recovery inspects package.json, known lockfiles and node_modules existence. These observations are retained in the action result, but installation success is not inferred from directory existence alone.

An interrupted write is reconciled automatically only when the current file matches the durable intended after-hash. It is marked VERIFIED without executing a second write. An uncertain shell/install remains blocked until the user inspects its actual state and records the outcome:

```text
nexus inspect-session SESSION_ID
nexus resolve-action SESSION_ID ACTION_ID VERIFIED "Inspected lockfile and installed package version"
nexus resume SESSION_ID
```

FAILED resolution means inspection established failure; it is not a request to replay. The resumed model chooses a subsequent action, subject to permissions and budgets. Recovery never rolls back user changes. A saved transcript with an assistant tool call but no tool result receives a repair message indicating interrupted execution, not a fabricated successful result.

Tests include a real child process that commits STARTED, writes a file and exits with code 23 without releasing ownership. Parent resume reclaims the dead PID, preserves the effect and returns BLOCKED without invoking the provider.

Limitations: there is no distributed ownership, automatic install repair, reboot reconciliation of subprocess identity, or recovery from arbitrary database corruption. PID reuse can conservatively block a stale owner. Use one data directory for all sessions sharing a workspace.
