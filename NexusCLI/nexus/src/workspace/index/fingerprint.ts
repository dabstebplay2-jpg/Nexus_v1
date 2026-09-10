import path from "node:path"
import { readFile } from "node:fs/promises"
import { normalise } from "../paths"
import { FileHashCache, probe } from "./cache"
import { MerkleTree } from "./merkle"
import { concurrency, mapLimited, maximumFiles, scan, type ScannedFile } from "./scan"

export type IndexStats = {
  files: number
  directories: number
  /** Files whose contents had to be read this pass. The whole point of the index is to keep this small. */
  reads: number
  hits: number
  hashedBytes: number
  recomputed: number
  anchors: number
}
export type IndexSnapshot = {
  /** Workspace-relative POSIX path -> sha256 of contents, in traversal order. */
  hashes: Map<string, string>
  /** Merkle root over directory hashes. A cheap "did anything at all move?" probe. */
  treeHash: string
  changed: string[]
  removed: string[]
  stats: IndexStats
}

/** Files above this size are hashed in chunks. sha256 is streaming-identical, so digests match. */
const streamThreshold = 8 * 1024 * 1024
async function hashContents(file: string, size: number) {
  const hasher = new Bun.CryptoHasher("sha256")
  if (size <= streamThreshold) return hasher.update(await readFile(file)).digest("hex")
  for await (const chunk of Bun.file(file).stream()) hasher.update(chunk)
  return hasher.digest("hex")
}

/**
 * Incremental content index for one workspace.
 *
 * Before Phase 0 every fingerprint re-read and re-hashed the entire project, so a verifying turn
 * cost `O(files)` of disk I/O and a session cost `O(files x turns)`. This index keeps the walk
 * (metadata probes are cheap and are the only way to notice an in-place write) but reads file
 * *contents* only when the metadata key changed.
 *
 * Two invariants protect the proof chain:
 *   1. `fingerprint()` keeps the pre-Phase-0 algorithm exactly, so evidence written by earlier
 *      versions stays comparable.
 *   2. Paths passed as `anchors` are always re-read, never served from metadata. Trust anchors
 *      therefore never depend on `mtime` being honest.
 */
export class WorkspaceIndex {
  private readonly cache = new FileHashCache()
  private readonly tree = new MerkleTree()
  private previous = new Map<string, string>()
  constructor(readonly workspace: string) {}

  /** Hash exactly these workspace-relative paths. Used when Git is the authority on what is source. */
  async resolve(paths: readonly string[], anchors: ReadonlySet<string> = new Set()) {
    const probed = await mapLimited(paths, concurrency, async (candidate) => {
      const metadata = await probe(path.join(this.workspace, candidate))
      return metadata ? ({ path: candidate, metadata } as ScannedFile) : undefined
    })
    return this.absorb(
      probed.filter((entry): entry is ScannedFile => entry !== undefined),
      anchors,
      0,
    )
  }
  /** Walk the workspace and hash every project file. Used when Git is unavailable. */
  async walk(anchors: ReadonlySet<string> = new Set(), maximum = maximumFiles) {
    const scanned = await scan(this.workspace, maximum)
    return this.absorb(scanned.files, anchors, scanned.directories)
  }
  /**
   * The identity a completion decision is anchored to.
   *
   * Deliberately unchanged from v0.2.2: sha256 over sorted `path + hash` pairs. Measured at 6 ms
   * for 10k files, against 45-2000 ms saved on the I/O it replaces, so there is no reason to risk
   * invalidating stored evidence for it.
   */
  fingerprint(hashes: ReadonlyMap<string, string>) {
    const hasher = new Bun.CryptoHasher("sha256")
    for (const file of [...hashes.keys()].sort()) hasher.update(file).update(hashes.get(file)!)
    return hasher.digest("hex")
  }
  directoryHash(directory: string) {
    return this.tree.directoryHash(normalise(directory))
  }
  counters() {
    return this.cache.counters()
  }
  clear() {
    this.cache.clear()
    this.tree.clear()
    this.previous = new Map()
  }
  private async absorb(
    entries: readonly ScannedFile[],
    anchors: ReadonlySet<string>,
    directories: number,
  ): Promise<IndexSnapshot> {
    this.cache.resetCounters()
    const state = { hashedBytes: 0, anchors: 0 }
    const hashed = await mapLimited(entries, concurrency, async (entry) => {
      const key = normalise(entry.path)
      const anchor = anchors.has(key)
      if (anchor) state.anchors++
      const hash = await this.cache.resolve(
        key,
        entry.metadata,
        async () => {
          state.hashedBytes += entry.metadata.size
          return hashContents(path.join(this.workspace, entry.path), entry.metadata.size)
        },
        anchor,
      )
      return [key, hash] as const
    })
    const hashes = new Map(hashed)
    const changed: string[] = []
    for (const [file, hash] of hashes) if (this.previous.get(file) !== hash) changed.push(file)
    const removed = [...this.previous.keys()].filter((file) => !hashes.has(file))
    for (const file of removed) this.tree.delete(file)
    for (const file of changed) this.tree.set(file, hashes.get(file)!)
    this.cache.retain(new Set(hashes.keys()))
    this.previous = new Map(hashes)
    const counters = this.cache.counters()
    return {
      hashes,
      treeHash: this.tree.root(),
      changed: changed.sort(),
      removed: removed.sort(),
      stats: {
        files: hashes.size,
        directories,
        reads: counters.reads,
        hits: counters.hits,
        hashedBytes: state.hashedBytes,
        recomputed: this.tree.recomputed,
        anchors: state.anchors,
      },
    }
  }
}

/**
 * One index per workspace, so every existing call site benefits without threading a new dependency
 * through AgentLoop, VerificationEngine and the composition root. The cache is purely an
 * optimization: correctness comes from the metadata key, so a cold or evicted index is only slower.
 */
const indexes = new Map<string, WorkspaceIndex>()
const retained = 8
export function workspaceIndex(workspace: string) {
  const existing = indexes.get(workspace)
  if (existing) {
    indexes.delete(workspace)
    indexes.set(workspace, existing)
    return existing
  }
  const created = new WorkspaceIndex(workspace)
  indexes.set(workspace, created)
  while (indexes.size > retained) {
    const oldest = indexes.keys().next().value
    if (oldest === undefined) break
    indexes.delete(oldest)
  }
  return created
}
export function releaseWorkspaceIndex(workspace: string) {
  indexes.delete(workspace)
}
