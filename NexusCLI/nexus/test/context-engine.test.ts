import { expect, test } from "bun:test"
import type { ContextLayer, ContextReport } from "../src/domain/types"
import { allocate, compactionStage, compactionThresholds, detailScales, layerShares, stageEntry } from "../src/context/layers"
import type { LayerBlock } from "../src/context/layers"
import { buildReport, formatTokens, renderReport } from "../src/context/report"
import { budgetUtilisation, contextBudget, contextMode } from "../src/context/budget"
import { preferredTools, redirectAdvice, routingGuidance, shellRedirect, toolClass } from "../src/tools/router"
import { planningRequirement, taskComplexity } from "../src/planner/policy"
import { resolveIntent } from "../src/intelligence/intent"
import { answer, fixture, model } from "./helpers"

const block = (id: string, layer: ContextLayer, tokens: number, pinned = false): LayerBlock => ({
  id,
  layer,
  category: id,
  tokens,
  pinned,
})

test("compaction stages follow the declared thresholds", () => {
  expect(compactionStage(0)).toBe("normal")
  expect(compactionStage(compactionThresholds.soft - 0.01)).toBe("normal")
  expect(compactionStage(compactionThresholds.soft)).toBe("soft")
  expect(compactionStage(compactionThresholds.hard)).toBe("hard")
  expect(compactionStage(compactionThresholds.emergency)).toBe("emergency")
  expect(compactionStage(Number.NaN)).toBe("normal")
  // A prompt below the soft threshold must still be rendered at full detail.
  expect(detailScales[stageEntry("normal")]).toBe(1)
  expect(detailScales.slice(stageEntry("emergency"))).toEqual([0.15])
  expect(layerShares("emergency").L3_PROJECT).toBe(0)
  expect(layerShares("normal").L4_ARCHIVE).toBe(0)
})

test("every compaction stage is reachable on a real budget", () => {
  // `contextBudget` defines limit as (window * 0.9 - output) / pressure, so a window-scale ratio
  // saturates at 0.9. The stage therefore has to be measured against the admissible limit, or the
  // emergency stage would be unreachable code. Guard that for every first-class window size.
  for (const window of [8192, 16384, 32768]) {
    const budget = contextBudget(window, 1024)
    expect(budgetUtilisation(0, budget)).toBe(0)
    expect(budgetUtilisation(budget.limit, budget)).toBeCloseTo(1, 5)
    expect(compactionStage(budgetUtilisation(budget.target, budget))).toBe("soft")
    expect(compactionStage(budgetUtilisation(budget.limit, budget))).toBe("emergency")
    // The provider-level guard sits above the compaction stages, never below them.
    expect(contextMode(budget.target, budget)).toBe("normal")
    expect(contextMode(budget.limit, budget)).not.toBe("normal")
    expect(contextMode(Math.ceil(budget.limit * 1.01), budget)).toBe("compress")
  }
})

test("allocation never drops pinned context and never sends the archive", () => {
  const result = allocate([block("system", "L0_CRITICAL", 100, true), block("project", "L3_PROJECT", 100)], 120)
  expect(result.included.map(item => item.id)).toEqual(["system"])
  expect(result.excluded.map(item => item.id)).toEqual(["project"])
  expect(result.overflow).toBe(0)

  const archived = allocate([block("archive", "L4_ARCHIVE", 1)], 100000)
  expect(archived.included).toEqual([])
  expect(archived.excluded.map(item => item.id)).toEqual(["archive"])

  // Pinned context that does not fit is reported, not silently discarded.
  expect(allocate([block("system", "L0_CRITICAL", 300, true)], 100).overflow).toBe(200)
})

test("allocation is deterministic and shrinks project knowledge under pressure", () => {
  const blocks = [
    block("system", "L0_CRITICAL", 100, true),
    block("project-a", "L3_PROJECT", 50),
    block("project-b", "L3_PROJECT", 50),
  ]
  const relaxed = allocate(blocks, 1000, "normal")
  expect(relaxed.included.map(item => item.id)).toEqual(["system", "project-a", "project-b"])
  expect(allocate(blocks, 1000, "normal")).toEqual(relaxed)
  expect(allocate(blocks, 1000, "emergency").included.map(item => item.id)).toEqual(["system"])
})

test("shell commands are redirected only when every stage has a guarded equivalent", () => {
  expect(shellRedirect("ls -la src")?.tool).toBe("list")
  expect(shellRedirect("cat package.json")?.tool).toBe("read")
  expect(shellRedirect("FOO=1 cat package.json")?.tool).toBe("read")
  expect(shellRedirect("rg refreshToken src")?.tool).toBe("search")
  expect(shellRedirect("find . -name Something")?.tool).toBe("glob")
  expect(shellRedirect("bun test")?.tool).toBe("verify")
  expect(shellRedirect("npm run typecheck")?.tool).toBe("verify")
  // Conservative: real process work, redirection, substitution and unknown stages are left alone.
  expect(shellRedirect("rm -rf build")).toBeUndefined()
  expect(shellRedirect("cat a.txt > b.txt")).toBeUndefined()
  expect(shellRedirect("ls src | wc -l")).toBeUndefined()
  expect(shellRedirect("git log --grep=refresh")).toBeUndefined()
  expect(shellRedirect("cd packages && cat package.json")).toBeUndefined()
  expect(shellRedirect("")).toBeUndefined()
  expect(redirectAdvice("cat package.json")).toContain("read")
  expect(redirectAdvice("rm -rf build")).toBeUndefined()
  expect(toolClass("bash")).toBe("shell")
  expect(toolClass("not_a_tool")).toBe("unknown")
})

test("routing guidance matches the tools actually exposed", () => {
  const coding = routingGuidance(undefined, "coding")
  expect(coding).toContain("list/glob/search")
  expect(coding).toContain("bash is for real process work only")
  const readOnly = routingGuidance(undefined, "coding", ["list", "read", "search"])
  expect(readOnly).not.toContain("bash is for real process work only")
  expect(readOnly).toContain("read-only surface")
  expect(routingGuidance(undefined, "answer")).toContain("written response")
  const analysis = resolveIntent("Explain what add.ts does")
  expect(routingGuidance(analysis, "answer")).toContain(analysis.workflow[0] ?? "")
  expect(preferredTools(undefined).indexOf("bash")).toBe(preferredTools(undefined).length - 1)
})

test("planning is required by complexity, and never authorizes completion", () => {
  const small = "what does add.ts do?"
  const large =
    "Audit the authentication subsystem: review src/auth/session.ts, src/auth/token.ts and src/auth/guard.ts, then list every risk, and also check the tests."
  expect(taskComplexity(small)).toBe("small")
  expect(taskComplexity(large)).toBe("large")
  expect(planningRequirement({ intent: resolveIntent(small), goal: small }).required).toBe(false)
  expect(planningRequirement({ intent: resolveIntent(small), goal: small }).guidance).toContain("No explicit plan is needed")
  const required = planningRequirement({ intent: resolveIntent(large), goal: large })
  expect(required.required).toBe(true)
  expect(required.complexity).toBe("large")
  expect(required.guidance).toContain("update_plan")
  // The planner may never become a second path to completion.
  expect(required.guidance).toContain("completion is authorized by the completion policy")
})

test("the report is a token breakdown, not prompt content", () => {
  const report = buildReport({
    epoch: 0,
    window: 32000,
    limit: 24000,
    output: 4096,
    used: 12400,
    stage: "normal",
    mode: "normal",
    detail: 1,
    categories: [
      { key: "instructions", layer: "L0_CRITICAL", tokens: 2100, pinned: true, included: true },
      { key: "conversation", layer: "L1_WORKING", tokens: 5200, pinned: false, included: true },
      { key: "memory", layer: "L2_TASK_MEMORY", tokens: 2000, pinned: true, included: true },
      { key: "ProjectKnowledge (L3)", layer: "L3_PROJECT", tokens: 1400, pinned: false, included: false },
      { key: "archive", layer: "L4_ARCHIVE", tokens: 0, pinned: false, included: false },
    ],
    history: { messages: 41, live: 8, archived: 37, summaries: 4 },
    compression: { beforeTokens: 20000, afterTokens: 12400 },
  })
  expect(report.categories[0]?.key).toBe("conversation")
  expect(report.free).toBe(11600)
  expect(report.compression.saved).toBe(7600)
  expect(report.included).toContain("instructions")
  expect(report.excluded).toEqual(["ProjectKnowledge (L3)", "archive"])
  expect(formatTokens(12400)).toBe("12.4k")
  const rendered = renderReport(report)
  expect(rendered).toContain("Context 12.4k / 32.0k")
  expect(rendered).toContain("compressed history: 37 events")
  expect(rendered).toContain("excluded:")
})

test("a real run records an observable context report", async () => {
  const f = await fixture(() => answer("Reviewed add.ts."))
  try {
    const session = await f.api.create({ workspace: f.workspace, goal: "Explain what add.ts does", model })
    await f.api.run(session.id)
    const events = f.api.inspect(session.id).events.filter(event => event.type === "context_report")
    expect(events.length).toBeGreaterThan(0)
    const report = events.at(-1)?.data as ContextReport
    expect(report.used).toBeGreaterThan(0)
    expect(report.window).toBe(model.capabilities.contextLength)
    expect(report.stage).toBe("normal")
    expect(report.detail).toBe(1)
    expect(report.included).toContain("instructions")
    expect(report.included).toContain("tools")
    expect(report.included).toContain("ProjectKnowledge (L3)")
    expect(report.excluded).toContain("archive")
    expect(report.categories.every(category => category.tokens >= 0)).toBe(true)
    const system = f.provider.requests.at(0)?.messages.find(message => message.role === "system")?.content ?? ""
    expect(system).toContain("RoutingContext (L0)")
    expect(system).toContain("PlanningContext (L0)")
    expect(system).toContain("ProjectKnowledge (L3)")
    expect(system).toContain("TaskMemory (L2)")
  } finally {
    await f.cleanup()
  }
})
