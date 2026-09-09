import { describe, expect, test } from "bun:test"
import path from "node:path"
import type { AgentSession, Project } from "../src/domain/types"
import { createContract } from "../src/completion/policy"
import { modelSchema } from "../src/config/config"
import { safeJson } from "../src/shared/redact"
import { hashFile } from "../src/tools/workspace"
import { answer, brokenAdd, call, fixtureWith, goalCheck, model, plainScenario } from "./helpers"

/** Read the decision outcome as an opaque string so these tests assert behaviour, never compile-time shape. */
const outcome = (session: AgentSession) => String(session.decision?.outcome ?? "NONE")
const reason = (session: AgentSession) => String(session.decision?.reason ?? "")

/** A realistic check: running the suite leaves cache/report artifacts behind, like pytest/turbo/vitest do. */
const artifactScenario = `import { add } from "./add"
import { mkdirSync, writeFileSync } from "node:fs"
mkdirSync(".pytest_cache", { recursive: true })
writeFileSync(".pytest_cache/report.json", JSON.stringify({ ran: Date.now() }))
mkdirSync(".turbo", { recursive: true })
writeFileSync(".turbo/run.log", "verification run\\n")
if (add(2, 3) !== 5) process.exit(1)
`

/** A hostile check: it rewrites tracked project source, so its exit code proves nothing about the agent's work. */
const sourceMutatingScenario = `import { writeFileSync } from "node:fs"
writeFileSync("add.ts", "export const add = (a: number, b: number) => a + b\\n")
process.exit(0)
`

/** An unprovable check: it mutates its own harness on every run, so the trust anchor never holds still. */
const selfMutatingScenario = `import { add } from "./add"
import { appendFileSync } from "node:fs"
appendFileSync("scenario.ts", "\\n// executed\\n")
if (add(2, 3) !== 5) process.exit(1)
`

const fixAdd = async (workspace: string) =>
  call("edit", {
    path: "add.ts",
    oldText: "a - b",
    newText: "a + b",
    expectedHash: await hashFile(path.join(workspace, "add.ts")),
  })

describe("D1/D2 verification survives generated artifacts", () => {
  test("baseline FAIL → fix → PASS → artifacts on disk → COMPLETED", async () => {
    const f = await fixtureWith({ "add.ts": brokenAdd, "scenario.ts": artifactScenario }, async (_, turn) =>
      turn === 1 ? await fixAdd(f.workspace) : answer("Corrected the operator."),
    )
    try {
      const session = await f.api.create({
        workspace: f.workspace,
        goal: "Fix addition",
        model,
        goalCheck,
        budgets: { maxTurns: 6 },
      })
      const result = await f.api.run(session.id)
      // The check really did produce untracked artifacts; that must not change the verdict.
      expect(await Bun.file(path.join(f.workspace, ".pytest_cache/report.json")).exists()).toBe(true)
      expect(await Bun.file(path.join(f.workspace, ".turbo/run.log")).exists()).toBe(true)
      expect(f.api.inspect(session.id).evidence).toContainEqual(
        expect.objectContaining({ source: "verification", verdict: "pass" }),
      )
      expect(outcome(result)).toBe("COMPLETE")
      expect(result.status).toBe("COMPLETED")
    } finally {
      await f.cleanup()
    }
  })

  test("evidence stays fresh when only artifacts changed after the check ran", async () => {
    const f = await fixtureWith({ "add.ts": brokenAdd, "scenario.ts": artifactScenario }, async (_, turn) =>
      turn === 1 ? await fixAdd(f.workspace) : answer("Done."),
    )
    try {
      const session = await f.api.create({
        workspace: f.workspace,
        goal: "Fix addition",
        model,
        goalCheck,
        budgets: { maxTurns: 6 },
      })
      await f.api.run(session.id)
      // A late artifact (a background test runner flushing its cache) must not invalidate proven evidence.
      await Bun.write(path.join(f.workspace, ".pytest_cache/late.json"), "{}")
      const rerun = await f.api.run(session.id)
      expect(outcome(rerun)).toBe("COMPLETE")
      expect(rerun.status).toBe("COMPLETED")
    } finally {
      await f.cleanup()
    }
  })
})

describe("Security: real source changes are never silently accepted", () => {
  test("a check that rewrites tracked source yields UNKNOWN, not COMPLETE", async () => {
    const f = await fixtureWith({ "add.ts": brokenAdd, "scenario.ts": sourceMutatingScenario }, () =>
      answer("I believe this is fixed."),
    )
    try {
      const session = await f.api.create({
        workspace: f.workspace,
        goal: "Fix addition",
        model,
        goalCheck,
        budgets: { maxTurns: 6 },
      })
      const result = await f.api.run(session.id)
      expect(result.status).not.toBe("COMPLETED")
      expect(outcome(result)).toBe("UNKNOWN")
      // The user must be told which real file moved under the check.
      expect(JSON.stringify(f.api.inspect(session.id).evidence)).toContain("add.ts")
    } finally {
      await f.cleanup()
    }
  })
})

describe("D3 livelock protection", () => {
  test("an unprovable check stops quickly as UNKNOWN with an explanation", async () => {
    const f = await fixtureWith({ "add.ts": brokenAdd, "scenario.ts": selfMutatingScenario }, async (_, turn) =>
      turn === 1 ? await fixAdd(f.workspace) : answer("Fixed; please verify."),
    )
    try {
      const session = await f.api.create({
        workspace: f.workspace,
        goal: "Fix addition",
        model,
        goalCheck,
        budgets: { maxTurns: 12 },
      })
      const result = await f.api.run(session.id)
      expect(outcome(result)).toBe("UNKNOWN")
      // UNKNOWN is a conclusion, not exhaustion: it must not burn the turn budget to get there.
      expect(result.turns).toBeLessThanOrEqual(4)
      expect(reason(result)).not.toMatch(/budget/i)
      expect(reason(result).length).toBeGreaterThan(0)
    } finally {
      await f.cleanup()
    }
  })
})

describe("D4 token-based context accounting", () => {
  test("an 8k model can run a coding task with the full tool schemas", async () => {
    const small = modelSchema.parse({ model: "small-8k", capabilities: { contextLength: 8192 } })
    const f = await fixtureWith({ "add.ts": brokenAdd, "scenario.ts": plainScenario }, async (_, turn) =>
      turn === 1 ? await fixAdd(f.workspace) : answer("Corrected the operator."),
    )
    try {
      const session = await f.api.create({
        workspace: f.workspace,
        goal: "Fix addition",
        model: small,
        goalCheck,
        budgets: { maxTurns: 6 },
      })
      const result = await f.api.run(session.id)
      expect(result.errors).toEqual([])
      expect(result.status).toBe("COMPLETED")
      // The payload is ~6.8 KB of bytes but only ~2k tokens: measuring bytes against a token
      // window is what locks 8k models out, so the budget must be counted in tokens.
      const request = f.provider.requests[0]
      const bytes =
        Buffer.byteLength(safeJson(request?.messages ?? [])) + Buffer.byteLength(safeJson(request?.tools ?? []))
      expect(bytes).toBeGreaterThan(8192 - 4096)
    } finally {
      await f.cleanup()
    }
  })

  test("an 8k model can still answer informational goals", async () => {
    const small = modelSchema.parse({ model: "small-8k", capabilities: { contextLength: 8192 } })
    const f = await fixtureWith({ "add.ts": brokenAdd, "scenario.ts": plainScenario }, () =>
      answer("The module exposes add(a, b)."),
    )
    try {
      const session = await f.api.create({
        workspace: f.workspace,
        goal: "Explain the addition module",
        model: small,
        mode: "answer",
      })
      const result = await f.api.run(session.id)
      expect(result.errors).toEqual([])
      expect(result.status).toBe("COMPLETED")
    } finally {
      await f.cleanup()
    }
  })

  test("a 16k model can run a coding task with the full tool schemas", async () => {
    const medium = modelSchema.parse({ model: "medium-16k", capabilities: { contextLength: 16384 } })
    const f = await fixtureWith({ "add.ts": brokenAdd, "scenario.ts": plainScenario }, async (_, turn) =>
      turn === 1 ? await fixAdd(f.workspace) : answer("Corrected the operator."),
    )
    try {
      const session = await f.api.create({
        workspace: f.workspace,
        goal: "Fix addition",
        model: medium,
        goalCheck,
        budgets: { maxTurns: 6 },
      })
      const result = await f.api.run(session.id)
      expect(result.errors).toEqual([])
      expect(result.status).toBe("COMPLETED")
    } finally {
      await f.cleanup()
    }
  })
})

describe("D5 intent becomes a contract, not a regex match", () => {
  const project: Project = {
    kind: "Node/TypeScript",
    packageManager: "npm",
    roots: ["/workspace"],
    checks: [
      { id: "test", description: "npm run test", kind: "TEST_RESULT", argv: ["npm", "run", "test"], timeoutMs: 1000 },
    ],
  }
  const repair = [
    "Fix failing tests",
    "Fix failing test",
    "fix the failing test",
    "Fix the broken tests in this repo",
    "Debug my project",
    "Исправь ошибку в моем проекте",
    "Найди причину падения тестов, исправь ее и проверь результат",
    "the test suite is red, please make it green",
  ]
  test.each(repair)("%j produces a reproduce-then-prove contract", (goal) => {
    const contract = createContract(goal, project, "coding")
    const ids = contract.criteria.map((criterion) => criterion.id)
    expect(ids).toContain("reproduction")
    expect(ids).toContain("goal")
    expect(contract.criteria.find((criterion) => criterion.id === "reproduction")).toMatchObject({
      baseline: true,
      expectedVerdict: "fail",
      checkId: "test",
    })
  })
  const informational = ["Explain how the addition module works", "What does this repository do?"]
  test.each(informational)("%j does not claim a reproduction contract", (goal) => {
    const contract = createContract(goal, project, "coding")
    expect(contract.criteria.map((criterion) => criterion.id)).not.toContain("reproduction")
  })
})
