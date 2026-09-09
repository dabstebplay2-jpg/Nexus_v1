import path from "node:path"
import { mkdtemp, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { createNexus } from "../src/composition"
import { hashFile } from "../src/tools/workspace"
import { runProcess } from "../src/tools/process"
import { modelSchema } from "../src/config/config"
import type { ModelEvent, Provider } from "../src/domain/ports"
import type { Action, Evidence } from "../src/domain/types"

const results: {
  task: string
  task_success: boolean
  verification_success: boolean
  false_completion: boolean
  completed: boolean
  steps: number
  tool_calls: number
  errors: number
  loops: number
  duration: number
}[] = []
for (const task of [
  { fixture: "addition", repair: true },
  { fixture: "clamp", repair: true },
  { fixture: "addition", repair: false },
]) {
  const root = await mkdtemp(path.join(tmpdir(), "nexus-bench-"))
  const workspace = path.join(root, "project")
  await Bun.write(
    path.join(workspace, "subject.ts"),
    await Bun.file(path.join(import.meta.dir, "fixtures", task.fixture, "subject.ts")).text(),
  )
  const state = { turn: 0 }
  const provider: Provider = {
    async *stream(): AsyncIterable<ModelEvent> {
      state.turn++
      if (task.repair && state.turn === 1)
        yield { type: "tool", call: { id: crypto.randomUUID(), name: "read", arguments: { path: "subject.ts" } } }
      if (task.repair && state.turn === 2)
        yield {
          type: "tool",
          call: {
            id: crypto.randomUUID(),
            name: "edit",
            arguments: {
              path: "subject.ts",
              expectedHash: await hashFile(path.join(workspace, "subject.ts")),
              oldText: task.fixture === "addition" ? "a - b" : "Math.max(max, value)",
              newText: task.fixture === "addition" ? "a + b" : "Math.min(max, value)",
            },
          },
        }
      if (!task.repair || state.turn > 2) yield { type: "text", text: "The task is complete." }
      yield { type: "finish" }
    },
  }
  const api = await createNexus({ dataDir: path.join(root, "data"), provider, rules: { RUN_TESTS: "allow" } })
  const started = Date.now()
  try {
    const command = [process.execPath, path.join(import.meta.dir, "oracle.ts"), task.fixture]
    const session = await api.create({
      workspace,
      goal: `Fix ${task.fixture}`,
      model: modelSchema.parse({ model: "scripted-eval", capabilities: { contextLength: 64000 } }),
      goalCheck: {
        id: "goal",
        description: "Fixture behavior",
        kind: "GOAL_ASSERTION",
        argv: command,
        timeoutMs: 5000,
      },
      budgets: { maxTurns: 3 },
    })
    const result = await api.run(session.id)
    // The oracle is outside the agent workspace and runs independently after Core's decision.
    const oracle = await runProcess(command, workspace, AbortSignal.timeout(5000))
    const trace = api.inspect(session.id)
    const completed = result.status === "COMPLETED"
    results.push({
      task: `${task.fixture}-${task.repair ? "repair" : "false-done"}`,
      task_success: completed && oracle.exitCode === 0,
      verification_success: (trace.evidence as Evidence[]).some(
        (item) => item.source === "verification" && item.verdict === "pass",
      ),
      false_completion: completed && oracle.exitCode !== 0,
      completed,
      steps: result.turns,
      tool_calls: result.toolCount,
      errors: (trace.actions as Action[]).filter((item) => item.status === "FAILED").length,
      loops: trace.events.filter((item) => item.type === "loop_guard").length,
      duration: Date.now() - started,
    })
  } finally {
    api.close()
    Bun.gc(true)
    if (!root.startsWith(path.join(tmpdir(), "nexus-bench-"))) throw new Error("Unsafe fixture cleanup path")
    await rm(root, { recursive: true, force: true })
  }
}
const completed = results.filter((result) => result.completed).length
const report = {
  mode: "scripted reliability smoke test, not model intelligence evaluation",
  cases: results.length,
  completed,
  false_completion_rate: completed ? results.filter((result) => result.false_completion).length / completed : null,
  results,
}
await Bun.write(path.join(import.meta.dir, "results.json"), JSON.stringify(report, null, 2))
console.log(JSON.stringify(report, null, 2))
if (results.some((result) => result.false_completion) || results.filter((result) => result.task_success).length !== 2)
  process.exitCode = 1
