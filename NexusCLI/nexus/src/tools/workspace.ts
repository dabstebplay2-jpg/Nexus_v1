import path from "node:path"
import { lstat, realpath, mkdir, rename, unlink, readFile } from "node:fs/promises"
import { NexusError } from "../shared/errors"
import { secretPath } from "../workspace/paths"
import { walkPaths, maximumFiles } from "../workspace/index/scan"
import { workspaceIndex } from "../workspace/index/fingerprint"

export { secretPath, ignoredDirectories } from "../workspace/paths"

/** Reject traversal, junctions/symlinks, device paths, NTFS streams and protected metadata. */
export async function guard(workspace: string, target: string, allowSecrets = false) {
  const root = await realpath(workspace)
  const file = path.resolve(root, target)
  const relative = path.relative(root, file)
  if (relative.startsWith(`..${path.sep}`) || relative === ".." || path.isAbsolute(relative) || relative.includes(":"))
    throw new NexusError("BOUNDARY", "Path is outside workspace or uses an alternate data stream")
  const parts = relative.split(path.sep).filter(Boolean)
  if (parts.some((part) => /[. ]$/.test(part) || /^(con|prn|aux|nul|com[0-9]|lpt[0-9])(?:\.|$)/i.test(part)))
    throw new NexusError("BOUNDARY", "Reserved or ambiguous path")
  if (parts.some((part) => [".git", ".nexus"].includes(part.toLowerCase())))
    throw new NexusError("BOUNDARY", "Agent metadata and Git internals are protected")
  if (!allowSecrets && secretPath(relative))
    throw new NexusError("SECRET", "Secret path requires explicit access; use a non-secret fixture")
  for (const index of parts.keys()) {
    const stat = await lstat(path.join(root, ...parts.slice(0, index + 1))).catch((error: unknown) => {
      if (error instanceof Error && "code" in error && error.code === "ENOENT") return undefined
      throw error
    })
    if (stat?.isSymbolicLink()) throw new NexusError("BOUNDARY", "Symlink/junction traversal is not permitted")
  }
  return file
}
/**
 * Project file paths in stable traversal order.
 *
 * The walk itself moved to `workspace/index/scan`, which collects metadata in the same pass so the
 * incremental index can decide which files still need a content read. Ordering and exclusions are
 * unchanged, because list/glob/search expose this order to the model.
 */
export async function files(workspace: string, maximum = maximumFiles) {
  return (await walkPaths(workspace, maximum)).paths
}
export async function hashFile(file: string) {
  return new Bun.CryptoHasher("sha256").update(await readFile(file)).digest("hex")
}
/** Whole-workspace content identity, served from the incremental index. */
export async function fingerprint(workspace: string) {
  const snapshot = await workspaceIndex(workspace).walk()
  const hash = new Bun.CryptoHasher("sha256")
  for (const file of snapshot.hashes.keys()) hash.update(file).update(snapshot.hashes.get(file)!)
  return hash.digest("hex")
}
export async function atomicWrite(file: string, text: string) {
  await mkdir(path.dirname(file), { recursive: true })
  const temporary = `${file}.nexus-${crypto.randomUUID()}.tmp`
  try {
    await Bun.write(temporary, text)
    await rename(temporary, file)
  } finally {
    await unlink(temporary).catch((error: unknown) => {
      if (!(error instanceof Error && "code" in error && error.code === "ENOENT")) throw error
    })
  }
}
