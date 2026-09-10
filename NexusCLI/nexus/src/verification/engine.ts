import { z } from "zod"
import type { AgentSession, VerificationRun } from "../domain/types"
import type { Store } from "../domain/ports"
import type { ToolExecutor } from "../tools/executor"
import { defineTool } from "../tools/registry"
import { runProcess } from "../tools/process"
import { abort, NexusError } from "../shared/errors"
import { changedAssets } from "./integrity"
import { compare, inventory, inventoryFingerprint, isGenerated } from "./delta"

/** Trusted check definitions are frozen at admission; model-created commands cannot mint verification evidence. */
export class VerificationEngine {
  constructor(
    private readonly store: Store,
    private readonly executor: ToolExecutor,
  ) {}
  async run(session: AgentSession, signal: AbortSignal, waiting: () => void, only?: string[]) {
    const run: VerificationRun = {
      id: crypto.randomUUID(),
      sessionId: session.id,
      startedAt: Date.now(),
      evidenceIds: [],
      fingerprint: "",
    }
    this.store.put("verification_runs", run)
    for (const check of session.contract.checks.filter((check) => !only || only.includes(check.id))) {
      abort(signal)
      const generated = session.contract.generatedPaths ?? []
      // A check that has already been seen rewriting project source stays untrusted for this
      // contract revision. Re-running it can look clean simply because the mutation is idempotent,
      // so trust is restored only by human review through trustChecks, which bumps the revision.
      const quarantined = this.store
        .list("evidence", session.id)
        .some(
          (item) =>
            item.contractRevision === session.contract.revision &&
            item.source === "verification" &&
            item.metadata.checkId === check.id &&
            item.verdict === "unknown" &&
            item.metadata.sourceChanged === true,
        )
      const before = await inventory(session.workspace, generated)
      const baseline = inventoryFingerprint(before)
      run.fingerprint ||= baseline
      const learned: string[] = []
      const result = await this.executor.execute(
        session,
        run.id,
        { id: crypto.randomUUID(), name: `check_${check.id}`, arguments: {} },
        defineTool({
          name: `check_${check.id}`,
          description: `${check.description}: ${JSON.stringify(check.argv)} (executes project code)`,
          input: z.object({}),
          risk: "high",
          sideEffect: true,
          idempotency: "unsafe",
          permissions: ["RUN_TESTS"],
          execute: async (_, ctx) => {
            const output = await runProcess(
              check.argv,
              session.workspace,
              AbortSignal.any([ctx.signal, AbortSignal.timeout(check.timeoutMs)]),
            )
            const delta = compare(before, await inventory(session.workspace, generated), generated)
            const alteredChecks = await changedAssets(session.workspace, session.contract.protectedFiles ?? {})
            // Never learn a trust anchor as generated output.
            learned.push(...delta.learned.filter((file) => !(session.contract.protectedFiles ?? {})[file]))
            const unattributable = [...new Set([...delta.sourceChanges, ...alteredChecks])].sort()
            const untrusted = quarantined || unattributable.length > 0
            return {
              output: output.stdout + output.stderr,
              kind: check.kind,
              verdict: untrusted ? "unknown" : output.exitCode === 0 && (check.expectedStdout === undefined || output.stdout.trim() === check.expectedStdout.trim()) ? "pass" : "fail",
              metadata: {
                argv: check.argv,
                exitCode: output.exitCode,
                stdout: output.stdout,
                stderr: output.stderr,
                expectedStdout: check.expectedStdout,
                attribution: delta.git ? "git" : "inventory",
                sourceChanged: unattributable.length > 0,
                sourceChanges: unattributable,
                alteredChecks,
                quarantined,
                generatedPaths: delta.learned,
                ...(untrusted
                  ? {
                      unknownReason: unattributable.length
                        ? `The check changed project source while running (${unattributable.join(", ")}), so its exit code cannot be attributed to the agent's work`
                        : "This check was already seen changing project source during this contract revision; review it with trust-checks before its result can count as proof",
                    }
                  : {}),
              },
            }
          },
        }),
        signal,
        waiting,
        { fingerprint: baseline, checkId: check.id },
      )
      // Remember observed artifacts so later runs and completion decisions ignore them.
      const additions = learned.filter((file) => !isGenerated(file, session.contract.generatedPaths ?? []))
      if (additions.length) {
        session.contract.generatedPaths = [...(session.contract.generatedPaths ?? []), ...additions].sort()
        this.store.save(session)
      }
      if (result.evidence) run.evidenceIds.push(result.evidence.id)
      this.store.put("verification_runs", run)
      if (result.action.status === "UNKNOWN")
        throw new NexusError("UNKNOWN_EFFECT", "Verification process has uncertain effects; inspect before proceeding")
    }
    run.finishedAt = Date.now()
    this.store.put("verification_runs", run)
    return run
  }
}
