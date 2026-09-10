import { describe, expect, test } from "bun:test"
import path from "node:path"
import { mkdtemp, mkdir, rm, writeFile, utimes, lstat } from "node:fs/promises"
import { tmpdir } from "node:os"
import { WorkspaceIndex, workspaceIndex, releaseWorkspaceIndex } from "../src/workspace/index/fingerprint"
import { MerkleTree } from "../src/workspace/index/merkle"
import { sameFile } from "../src/workspace/index/cache"
import { inventory, inventoryFingerprint } from "../src/verification/delta"
import { files, hashFile } from "../src/tools/workspace"

/** 10 000 files across 100 directories. Content length is fixed so a same-size edit is possible. */
async function bigWorkspace(count = 10000) {
  const root = await mkdtemp(path.join(tmpdir(), "nexus-test-index-"))
  const workspace = path.join(root, "project")
  const perDirectory = count / 100
  for (let directory = 0; directory < 100; directory++) {
    await mkdir(path.join(workspace, `pkg${directory}`), { recursive: true })
    await Promise.all(
      Array.from({ length: perDirectory }, (_, file) =>
        writeFile(path.join(workspace, `pkg${directory}`, `mod${file}.ts`), `export const value = ${file % 10}\n`),
      ),
    )
  }
  return {
    root,
    workspace,
    cleanup: async () => {
      releaseWorkspaceIndex(workspace)
      if (!root.startsWith(path.join(tmpdir(), "nexus-test-index-"))) throw new Error("Unsafe fixture cleanup path")
      await rm(root, { recursive: true, force: true, maxRetries: 8, retryDelay: 50 })
    },
  }
}

describe("C1 incremental workspace index", () => {
  test("a 10 000 file workspace rehashes only what changed, and one edit never rehashes the project", async () => {
    const f = await bigWorkspace()
    try {
      expect(await files(f.workspace)).toHaveLength(10000)
      const index = new WorkspaceIndex(f.workspace)

      const cold = await index.walk()
      expect(cold.stats.files).toBe(10000)
      expect(cold.stats.reads).toBe(10000)

      // Nothing changed: proved unchanged from metadata, with zero content reads.
      const unchanged = await index.walk()
      expect(unchanged.stats.reads).toBe(0)
      expect(unchanged.stats.hits).toBe(10000)
      expect(unchanged.changed).toEqual([])
      expect(unchanged.treeHash).toBe(cold.treeHash)

      // One file changed: exactly one content read, and only its ancestor chain is rehashed.
      await writeFile(path.join(f.workspace, "pkg7", "mod3.ts"), "export const value = 777\n")
      const edited = await index.walk()
      expect(edited.stats.reads).toBe(1)
      expect(edited.changed).toEqual(["pkg7/mod3.ts"])
      expect(edited.treeHash).not.toBe(cold.treeHash)
      // root + pkg7 only, out of 101 directories.
      expect(edited.stats.recomputed).toBe(2)
      expect(index.directoryHash("pkg7")).not.toBe(index.directoryHash("pkg8"))

      // Deletion is incremental too.
      await rm(path.join(f.workspace, "pkg7", "mod4.ts"))
      const deleted = await index.walk()
      expect(deleted.stats.reads).toBe(0)
      expect(deleted.removed).toEqual(["pkg7/mod4.ts"])
      expect(deleted.stats.files).toBe(9999)
    } finally {
      await f.cleanup()
    }
  }, 180000)

  test("a same-size edit with a restored mtime is still detected, and trust anchors are never cached", async () => {
    const f = await bigWorkspace(1000)
    try {
      const index = new WorkspaceIndex(f.workspace)
      await index.walk()
      const target = path.join(f.workspace, "pkg0", "mod0.ts")
      const original = await lstat(target)

      // `touch -r` style forgery: identical byte length, identical mtime. ctime and ino still move.
      await writeFile(target, "export const value = 9\n")
      await utimes(target, original.atime, original.mtime)
      const forged = await lstat(target)
      expect(forged.size).toBe(original.size)
      // `utimes` truncates to whole milliseconds, so compare at the resolution it can restore.
      expect(Math.floor(forged.mtimeMs)).toBe(Math.floor(original.mtimeMs))

      // Pin mtime to the forged value so the only remaining difference is ctime: this proves the
      // ctime/ino half of the key is load-bearing, not that mtime happened to wobble.
      expect(
        sameFile(
          {
            size: original.size,
            mtimeMs: forged.mtimeMs,
            ctimeMs: original.ctimeMs,
            ino: Number(original.ino),
            dev: Number(original.dev),
          },
          {
            size: forged.size,
            mtimeMs: forged.mtimeMs,
            ctimeMs: forged.ctimeMs,
            ino: Number(forged.ino),
            dev: Number(forged.dev),
          },
        ),
      ).toBe(false)

      const detected = await index.walk()
      expect(detected.changed).toEqual(["pkg0/mod0.ts"])
      expect(detected.stats.reads).toBe(1)

      // An anchor is re-read on every pass, whatever its metadata says.
      const anchors = new Set(["pkg1/mod0.ts", "pkg1/mod1.ts"])
      const guarded = await index.walk(anchors)
      expect(guarded.stats.anchors).toBe(2)
      expect(guarded.stats.reads).toBe(2)
    } finally {
      await f.cleanup()
    }
  }, 120000)

  test("the completion fingerprint is unchanged by the index and stable across passes", async () => {
    const f = await bigWorkspace(1000)
    try {
      const first = inventoryFingerprint(await inventory(f.workspace))
      const second = inventoryFingerprint(await inventory(f.workspace))
      expect(second).toBe(first)
      // The pre-Phase-0 algorithm, recomputed independently: sha256 over sorted path + hash.
      const snapshot = await inventory(f.workspace)
      const oracle = new Bun.CryptoHasher("sha256")
      for (const file of [...snapshot.paths.keys()].sort()) oracle.update(file).update(snapshot.paths.get(file)!)
      expect(first).toBe(oracle.digest("hex"))

      await writeFile(path.join(f.workspace, "pkg3", "mod2.ts"), "export const value = 42\n")
      expect(inventoryFingerprint(await inventory(f.workspace))).not.toBe(first)
      // Generated output cannot stale the fingerprint.
      await writeFile(path.join(f.workspace, "artifact.log"), "generated\n")
      const ignoring = inventoryFingerprint(await inventory(f.workspace, ["artifact.log"]))
      await writeFile(path.join(f.workspace, "artifact.log"), "generated again\n")
      expect(inventoryFingerprint(await inventory(f.workspace, ["artifact.log"]))).toBe(ignoring)
    } finally {
      await f.cleanup()
    }
  }, 120000)

  test("one index is reused per workspace and released explicitly", async () => {
    const f = await bigWorkspace(200)
    try {
      expect(workspaceIndex(f.workspace)).toBe(workspaceIndex(f.workspace))
      releaseWorkspaceIndex(f.workspace)
      expect(workspaceIndex(f.workspace)).not.toBe(new WorkspaceIndex(f.workspace))
    } finally {
      await f.cleanup()
    }
  }, 60000)

  test("a file above the streaming threshold hashes identically to a one-shot read", async () => {
    const f = await bigWorkspace(4)
    try {
      // v0.2.2 failed closed above 32 MiB; the index streams instead, so the digest must still
      // match a single-buffer sha256 exactly — the fingerprint is the identity of a proof.
      const large = path.join(f.workspace, "pkg0", "large.bin")
      await writeFile(large, Buffer.alloc(9 * 1024 * 1024, "nexus"))
      const index = new WorkspaceIndex(f.workspace)
      const snapshot = await index.walk()
      expect(snapshot.hashes.get("pkg0/large.bin")).toBe(await hashFile(large))
    } finally {
      await f.cleanup()
    }
  })

  test("merkle invalidation is local: a deep edit repairs one chain, not the tree", () => {
    const tree = new MerkleTree()
    for (let directory = 0; directory < 50; directory++)
      for (let file = 0; file < 20; file++) tree.set(`a/b/pkg${directory}/mod${file}.ts`, `hash-${directory}-${file}`)
    const root = tree.root()
    expect(tree.size).toBe(53)

    tree.set("a/b/pkg10/mod5.ts", "changed")
    const after = tree.root()
    expect(after).not.toBe(root)
    // root, a, a/b, a/b/pkg10 — depth of the chain, independent of the 50 sibling directories.
    expect(tree.recomputed).toBe(4)

    tree.set("a/b/pkg10/mod5.ts", "changed")
    expect(tree.root()).toBe(after)
    expect(tree.recomputed).toBe(0)

    for (let file = 0; file < 20; file++) tree.delete(`a/b/pkg10/mod${file}.ts`)
    tree.root()
    expect(tree.size).toBe(52)
  })
})
