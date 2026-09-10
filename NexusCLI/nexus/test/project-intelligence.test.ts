import { expect, test } from "bun:test"
import path from "node:path"
import { detect } from "../src/project/detect"
import { knowledgeSummary, projectKnowledge } from "../src/project/knowledge"
import { answer, fixture } from "./helpers"

const manifest = JSON.stringify({
  name: "demo",
  type: "module",
  main: "src/index.ts",
  scripts: { test: "bun test", build: "bun build src/index.ts" },
  dependencies: { react: "19.0.0" },
  devDependencies: { typescript: "5.8.2" },
})

async function project(workspace: string) {
  await Bun.write(path.join(workspace, "package.json"), manifest)
  await Bun.write(path.join(workspace, "tsconfig.json"), '{"compilerOptions":{"strict":true}}')
  await Bun.write(path.join(workspace, "AGENTS.md"), "# rules\n")
  await Bun.write(path.join(workspace, "src/index.ts"), "export const value = 1\n")
  await Bun.write(path.join(workspace, "src/service.ts"), "export const service = () => 2\n")
  await Bun.write(path.join(workspace, "test/index.test.ts"), "export const spec = 1\n")
  return detect(workspace)
}

test("derives a project map from the existing incremental scan", async () => {
  const f = await fixture(() => answer())
  try {
    const detected = await project(f.workspace)
    const knowledge = await projectKnowledge(f.workspace, detected, 1)
    expect(knowledge.partial).toBe(false)
    expect(knowledge.stack).toContain("typescript")
    expect(knowledge.stack).toContain("react")
    expect(knowledge.sourceRoots).toContain("src")
    expect(knowledge.entryPoints).toContain("src/index.ts")
    expect(knowledge.testPaths).toContain("test")
    expect(knowledge.configFiles).toContain("package.json")
    expect(knowledge.importantFiles).toContain("AGENTS.md")
    expect(knowledge.dependencies.runtime).toContain("react")
    expect(knowledge.dependencies.development).toContain("typescript")
    expect(knowledge.conventions).toContain("TypeScript strict mode")
    expect(knowledge.commands.some(command => command.id === "script:test")).toBe(true)
    expect(knowledge.signature.length).toBeGreaterThan(0)
  } finally {
    await f.cleanup()
  }
})

test("reuses the map when the tree is unchanged and stays deterministic", async () => {
  const f = await fixture(() => answer())
  try {
    const detected = await project(f.workspace)
    const first = await projectKnowledge(f.workspace, detected, 1)
    // Past the TTL: the tree is rescanned, the signature matches, so the map is reused unchanged.
    const second = await projectKnowledge(f.workspace, detected, 1 + 60_000)
    expect(second.signature).toBe(first.signature)
    expect(second.generatedAt).toBe(first.generatedAt)
    expect(knowledgeSummary(second)).toBe(knowledgeSummary(first))
    // A new source file changes the signature, so the map is rebuilt.
    await Bun.write(path.join(f.workspace, "src/extra.ts"), "export const extra = 3\n")
    const third = await projectKnowledge(f.workspace, detected, 1 + 120_000)
    expect(third.signature).not.toBe(first.signature)
    expect(third.fileCount).toBe(first.fileCount + 1)
  } finally {
    await f.cleanup()
  }
})

test("summary shrinks with the detail scale and degrades instead of throwing", async () => {
  const f = await fixture(() => answer())
  try {
    const detected = await project(f.workspace)
    const knowledge = await projectKnowledge(f.workspace, detected, 1)
    expect(knowledgeSummary(knowledge, 0.2).length).toBeLessThan(knowledgeSummary(knowledge).length)
    // An unreadable workspace must never break the context build.
    const missing = await projectKnowledge(path.join(f.workspace, "absent-directory"), detected, 1)
    expect(missing.partial).toBe(true)
    expect(missing.conventions[0]).toContain("project map unavailable")
    expect(knowledgeSummary(missing).length).toBeGreaterThan(0)
  } finally {
    await f.cleanup()
  }
})
