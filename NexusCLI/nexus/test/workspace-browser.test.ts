import { expect, test } from "bun:test"
import path from "node:path"
import { symlink } from "node:fs/promises"
import { workspaceDirectory, workspaceFile } from "../apps/server/workspace"
import { answer, fixtureWith } from "./helpers"

test("workspace browsing shares the agent path boundary and excludes secrets and junctions", async () => {
  const f = await fixtureWith({ "src/main.ts": "export const value = 1\n", ".env": "PRIVATE=hidden", "image.bin": "\0data" }, () => answer())
  try {
    await symlink(path.join(f.root, "data"), path.join(f.workspace, "junction"), "junction")
    const directory = await workspaceDirectory(f.workspace)
    expect(directory.entries.map((entry) => entry.name)).toEqual(["src", "image.bin"])
    expect((await workspaceFile(f.workspace, "src/main.ts")).content).toContain("value = 1")
    for (const target of ["../data/nexus.db", ".env", "junction/nexus.db", ".git/config", "NUL", "src/main.ts:stream"])
      await expect(workspaceFile(f.workspace, target)).rejects.toThrow()
    await expect(workspaceFile(f.workspace, "image.bin")).rejects.toThrow("Binary")
    await expect(workspaceFile(f.workspace, "src")).rejects.toThrow("regular file")
    await Bun.write(path.join(f.workspace, "large.txt"), "x".repeat(512001))
    await expect(workspaceFile(f.workspace, "large.txt")).rejects.toThrow("500 KB")
  } finally { await f.cleanup() }
})
