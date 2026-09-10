import { normalise } from "../workspace/paths"
import { workspaceIndex } from "../workspace/index/fingerprint"
import { runProcess } from "../tools/process"

/**
 * WorkspaceDelta answers one question: did anything that a check *depends on* change while
 * that check was running? A check that only writes new caches, reports or logs is still
 * trustworthy. A check that rewrites tracked source has invalidated its own inputs.
 *
 * There is deliberately no ignore-list. "Source" is decided by evidence:
 *   1. Git, when present, is the authority: ignored files are not source.
 *   2. Paths a trusted check was previously observed to create are not source.
 *   3. Anything a check creates from nothing is not source; only mutating or deleting
 *      pre-existing content can invalidate a result.
 *
 * Content hashing is served by the incremental workspace index, so an unchanged file is proved
 * unchanged from metadata instead of being re-read. `anchors` opts specific paths out of that
 * optimization: trust anchors are always re-read so the proof chain never trusts `mtime`.
 */
export type Inventory = { paths: Map<string, string>; git: boolean; treeHash?: string; reads?: number }
export type Delta = {
  created: string[]
  modified: string[]
  deleted: string[]
  /** Changes that make the check's exit code unattributable. Non-empty means the verdict is UNKNOWN. */
  sourceChanges: string[]
  /** Newly observed generated paths and directory prefixes, to be remembered on the contract. */
  learned: string[]
  git: boolean
}

/** Tracked plus untracked-but-not-ignored paths. Git-ignored output never enters the source set. */
async function gitSourcePaths(workspace: string) {
  const result = await runProcess(
    ["git", "--no-optional-locks", "ls-files", "-c", "-o", "--exclude-standard", "-z"],
    workspace,
    AbortSignal.timeout(15000),
  ).catch(() => undefined)
  if (!result || result.exitCode !== 0) return undefined
  // Agent metadata is never project source. `files()` and the workspace guard already treat
  // `.git` and `.nexus` as off-limits; without this the trust-manifest mirror would enter the
  // fingerprint it exists to protect.
  return result.stdout
    .split("\0")
    .filter(Boolean)
    .map(normalise)
    .filter((file) => !file.startsWith(".git/") && !file.startsWith(".nexus/"))
}

export function isGenerated(file: string, generated: readonly string[]) {
  const target = normalise(file)
  return generated.some((entry) => (entry.endsWith("/") ? target.startsWith(entry) : target === entry))
}

/** Snapshot the paths a check depends on, with content hashes. */
export async function inventory(
  workspace: string,
  generated: readonly string[] = [],
  anchors: ReadonlySet<string> = new Set(),
): Promise<Inventory> {
  const index = workspaceIndex(workspace)
  const tracked = await gitSourcePaths(workspace)
  // One universe per workspace keeps the index cache stable across calls that pass different
  // generated-path lists. Generated output is filtered out of the result, exactly as before, so
  // the fingerprint is unchanged; it is merely hashed once and then metadata-checked.
  const snapshot = tracked ? await index.resolve(tracked, anchors) : await index.walk(anchors)
  const paths = new Map<string, string>()
  for (const file of snapshot.hashes.keys())
    if (!isGenerated(file, generated)) paths.set(file, snapshot.hashes.get(file)!)
  return { paths, git: tracked !== undefined, treeHash: snapshot.treeHash, reads: snapshot.stats.reads }
}

/** A stable identity for the source a decision was based on; generated output cannot stale it. */
export function inventoryFingerprint(snapshot: Inventory) {
  const hash = new Bun.CryptoHasher("sha256")
  for (const file of [...snapshot.paths.keys()].sort()) hash.update(file).update(snapshot.paths.get(file)!)
  return hash.digest("hex")
}

/** The shallowest directory that did not exist before the check, else the file itself. */
function attribute(file: string, before: Inventory) {
  const parts = file.split("/")
  for (const index of parts.keys()) {
    if (index === parts.length - 1) break
    const prefix = `${parts.slice(0, index + 1).join("/")}/`
    if (![...before.paths.keys()].some((existing) => existing.startsWith(prefix))) return prefix
  }
  return file
}

export function compare(before: Inventory, after: Inventory, generated: readonly string[] = []): Delta {
  const created = [...after.paths.keys()].filter((file) => !before.paths.has(file))
  const modified = [...after.paths.keys()].filter(
    (file) => before.paths.has(file) && before.paths.get(file) !== after.paths.get(file),
  )
  const deleted = [...before.paths.keys()].filter((file) => !after.paths.has(file))
  return {
    created,
    modified,
    deleted,
    // Only pre-existing content that moved can invalidate the check that ran over it.
    sourceChanges: [...modified, ...deleted].filter((file) => !isGenerated(file, generated)).sort(),
    learned: [...new Set(created.map((file) => attribute(file, before)))].sort(),
    git: before.git && after.git,
  }
}
