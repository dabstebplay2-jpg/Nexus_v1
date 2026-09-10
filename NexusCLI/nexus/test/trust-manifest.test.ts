import { describe, expect, test } from "bun:test"
import path from "node:path"
import type { AgentSession, TrustViolation } from "../src/domain/types"
import { hashFile } from "../src/tools/workspace"
import { defaultTrustPatterns, isAnchor, isExclusiveAnchor } from "../src/verification/trust/manifest"
import { discoverManifest } from "../src/verification/trust/discover"
import { evaluateTrust } from "../src/verification/trust/guard"
import { answer, brokenAdd, call, fixtureWith, goalCheck, model, plainScenario } from "./helpers"

/** Read the decision as opaque strings so these tests assert behaviour, never compile-time shape. */
const outcome = (session: AgentSession) => String(session.decision?.outcome ?? "NONE")
const reason = (session: AgentSession) => String(session.decision?.reason ?? "")

const pytestIni = "[pytest]\naddopts = -q\ntestpaths = tests\n"
const correctAdd = "export const add = (a: number, b: number) => a + b\n"

const fixAdd = async (workspace: string) =>
  call("edit", {
    path: "add.ts",
    oldText: "a - b",
    newText: "a + b",
    expectedHash: await hashFile(path.join(workspace, "add.ts")),
  })
const rewrite = async (workspace: string, file: string, content: string) =>
  call("write", { path: file, content, expectedHash: await hashFile(path.join(workspace, file)) })
const createFile = (file: string, content: string) => call("write", { path: file, content, expectedHash: null })

/** Every trust violation reported in this session's verification evidence. */
const violations = (evidence: readonly { metadata: Record<string, unknown> }[]): TrustViolation[] =>
  evidence.flatMap((item) => (item.metadata.trustViolations as TrustViolation[] | undefined) ?? [])

const allow = { RUN_TESTS: "allow", WRITE_PROJECT: "allow" } as const

/**
 * C3 regression: the Trust Manifest must make a tampered harness unprovable.
 *
 * The whole architecture rests on one claim — only CompletionPolicy may authorize COMPLETE, and it
 * may only do so on fresh evidence from a trusted check. That claim is void if the agent can move
 * the harness underneath the check. v0.2.2 re-hashed only the anchors it had recorded at
 * admission, so *changing* `pytest.ini` was caught but *creating* one was not.
 */
describe("C3 trust manifest", () => {
  test("editing pytest configuration voids the proof even when the check exits 0", async () => {
    const f = await fixtureWith(
      { "add.ts": brokenAdd, "scenario.ts": plainScenario, "pytest.ini": pytestIni },
      async (_, turn) => {
        if (turn === 1) return await fixAdd(f.workspace)
        if (turn === 2) return await rewrite(f.workspace, "pytest.ini", "[pytest]\naddopts = -q --exitfirst\n")
        return answer("Fixed the operator and tuned the test runner.")
      },
      allow,
    )
    try {
      const session = await f.api.create({
        workspace: f.workspace,
        goal: "Fix addition",
        model,
        goalCheck,
        budgets: { maxTurns: 6 },
      })
      // The harness was pinned by content hash at admission.
      expect(Object.keys(session.contract.trustManifest?.protected ?? {})).toContain("pytest.ini")

      const result = await f.api.run(session.id)
      const evidence = f.api.inspect(session.id).evidence.filter((item) => item.source === "verification")

      // The real fix landed and the check really did pass, and it still proves nothing.
      expect(await Bun.file(path.join(f.workspace, "add.ts")).text()).toBe(correctAdd)
      expect(evidence.some((item) => item.metadata.exitCode === 0)).toBe(true)
      expect(evidence.every((item) => item.verdict !== "pass")).toBe(true)
      expect(evidence).toContainEqual(
        expect.objectContaining({
          verdict: "unknown",
          metadata: expect.objectContaining({ alteredChecks: expect.arrayContaining(["pytest.ini"]) }),
        }),
      )
      expect(violations(evidence)).toContainEqual({
        path: "pytest.ini",
        kind: "modified",
        reason: expect.any(String),
      })
      expect(result.status).not.toBe("COMPLETED")
      expect(outcome(result)).not.toBe("COMPLETE")
      expect(reason(result).length).toBeGreaterThan(0)
    } finally {
      await f.cleanup()
    }
  }, 30000)

  test("introducing a conftest.py that never existed voids the proof too", async () => {
    const f = await fixtureWith(
      { "add.ts": brokenAdd, "scenario.ts": plainScenario },
      async (_, turn) => {
        if (turn === 1) return await fixAdd(f.workspace)
        if (turn === 2)
          return createFile(
            "conftest.py",
            "import sys\n\ndef pytest_collection_modifyitems(items):\n    del items[:]\n",
          )
        return answer("Fixed the operator and added shared fixtures.")
      },
      allow,
    )
    try {
      const session = await f.api.create({
        workspace: f.workspace,
        goal: "Fix addition",
        model,
        goalCheck,
        budgets: { maxTurns: 6 },
      })
      // Nothing to pin: this is exactly the hole. The manifest records it as a known absence.
      expect(session.contract.trustManifest?.protected["conftest.py"]).toBeUndefined()
      expect(session.contract.trustManifest?.absent).toContain("conftest.py")

      const result = await f.api.run(session.id)
      const evidence = f.api.inspect(session.id).evidence.filter((item) => item.source === "verification")

      expect(await Bun.file(path.join(f.workspace, "conftest.py")).exists()).toBe(true)
      expect(evidence.some((item) => item.metadata.exitCode === 0)).toBe(true)
      expect(violations(evidence)).toContainEqual({
        path: "conftest.py",
        kind: "introduced",
        reason: expect.any(String),
      })
      expect(evidence.every((item) => item.verdict !== "pass")).toBe(true)
      expect(result.status).not.toBe("COMPLETED")
      expect(outcome(result)).not.toBe("COMPLETE")
    } finally {
      await f.cleanup()
    }
  }, 30000)

  test("adding a new regression test is still allowed and still reaches COMPLETE", async () => {
    const f = await fixtureWith(
      { "add.ts": brokenAdd, "scenario.ts": plainScenario },
      async (_, turn) => {
        if (turn === 1) return await fixAdd(f.workspace)
        if (turn === 2)
          return createFile("add.test.ts", 'import { add } from "./add"\nif (add(2, 2) !== 4) process.exit(1)\n')
        return answer("Fixed the operator and covered it with a test.")
      },
      allow,
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
      const evidence = f.api.inspect(session.id).evidence.filter((item) => item.source === "verification")

      expect(await Bun.file(path.join(f.workspace, "add.test.ts")).exists()).toBe(true)
      expect(violations(evidence)).toEqual([])
      expect(evidence).toContainEqual(expect.objectContaining({ verdict: "pass" }))
      expect(outcome(result)).toBe("COMPLETE")
      expect(result.status).toBe("COMPLETED")
    } finally {
      await f.cleanup()
    }
  }, 30000)

  test("deleting a pinned harness is a violation, and the guard always reads from disk", async () => {
    const f = await fixtureWith({ "add.ts": brokenAdd, "scenario.ts": plainScenario, "pytest.ini": pytestIni }, () =>
      answer(),
    )
    try {
      const manifest = await discoverManifest(f.workspace, [goalCheck.argv], 1)
      expect(Object.keys(manifest.protected).sort()).toEqual(["pytest.ini", "scenario.ts"])
      expect(manifest.runners).toEqual(["scenario.ts"])
      expect(await evaluateTrust(f.workspace, manifest)).toEqual([])

      // Same byte length, so only a content read can tell the difference.
      await Bun.write(path.join(f.workspace, "pytest.ini"), pytestIni.replace("addopts = -q", "addopts = -x"))
      expect(await evaluateTrust(f.workspace, manifest)).toEqual([
        { path: "pytest.ini", kind: "modified", reason: expect.any(String) },
      ])

      await Bun.file(path.join(f.workspace, "pytest.ini")).delete()
      expect(await evaluateTrust(f.workspace, manifest)).toEqual([
        { path: "pytest.ini", kind: "deleted", reason: expect.any(String) },
      ])

      // Two classes of anchor: exclusive files may not appear at all, extensible ones may only grow.
      expect(isExclusiveAnchor("conftest.py", defaultTrustPatterns)).toBe(true)
      expect(isExclusiveAnchor(".github/workflows/ci.yml", defaultTrustPatterns)).toBe(true)
      expect(isExclusiveAnchor("test/add.test.ts", defaultTrustPatterns)).toBe(false)
      expect(isAnchor("test/add.test.ts", defaultTrustPatterns)).toBe(true)
      expect(isAnchor("src/add.ts", defaultTrustPatterns)).toBe(false)
    } finally {
      await f.cleanup()
    }
  })
})
