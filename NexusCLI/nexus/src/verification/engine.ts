import { z } from "zod"
import type { AgentSession, VerificationRun } from "../domain/types"
import type { Store } from "../domain/ports"
import type { ToolExecutor } from "../tools/executor"
import { defineTool } from "../tools/registry"
import { runProcess } from "../tools/process"
import { fingerprint } from "../tools/workspace"
import { abort, NexusError } from "../shared/errors"
import { changedAssets } from "./integrity"

/** Trusted check definitions are frozen at admission; model-created commands cannot mint verification evidence. */
export class VerificationEngine {
  constructor(
    private readonly store: Store,
    private readonly executor: ToolExecutor,
  ) {}
  async run(session: AgentSession, signal: AbortSignal, waiting: () => void, only?: string[]) {
    const before = await fingerprint(session.workspace)
    const run: VerificationRun = {
      id: crypto.randomUUID(),
      sessionId: session.id,
      startedAt: Date.now(),
      evidenceIds: [],
      fingerprint: before,
    }
    this.store.put("verification_runs", run)
    for (const check of session.contract.checks.filter((check) => !only || only.includes(check.id))) {
      abort(signal)
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
            const after = await fingerprint(session.workspace)
            const alteredChecks = await changedAssets(session.workspace, session.contract.protectedFiles ?? {})
            return {
              output: output.stdout + output.stderr,
              kind: check.kind,
              verdict: after !== before || alteredChecks.length ? "unknown" : output.exitCode === 0 ? "pass" : "fail",
              metadata: { argv: check.argv, exitCode: output.exitCode, sourceChanged: after !== before, alteredChecks },
            }
          },
        }),
        signal,
        waiting,
        { fingerprint: before, checkId: check.id },
      )
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
