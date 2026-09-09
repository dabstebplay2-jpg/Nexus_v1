import path from "node:path"
import { lstat, readdir, realpath, mkdir, rename, unlink, readFile } from "node:fs/promises"
import { NexusError } from "../shared/errors"

const ignored = new Set([
  ".git",
  ".nexus",
  "node_modules",
  "dist",
  "build",
  "coverage",
  ".venv",
  "venv",
  "__pycache__",
  "target",
  "bin",
  "obj",
])
export function secretPath(file: string) {
  return /(^|[\\/])(?:\.env(?:\..*)?|\.ssh|\.aws|\.npmrc|credentials[^\\/]*|id_rsa|id_ed25519)(?:$|[\\/])|\.(pem|p12|pfx|key)$/i.test(
    file,
  )
}

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
export async function files(workspace: string, maximum = 20000) {
  const found: string[] = []
  async function visit(directory: string) {
    const entries = await readdir(path.join(workspace, directory), { withFileTypes: true })
    for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name))) {
      if (entry.isSymbolicLink() || ignored.has(entry.name) || secretPath(entry.name)) continue
      const relative = path.join(directory, entry.name)
      if (entry.isDirectory()) {
        await visit(relative)
        continue
      }
      if (!entry.isFile()) continue
      found.push(relative)
      if (found.length > maximum)
        throw new NexusError("PROJECT_LIMIT", `Project exceeds ${maximum} files; select a smaller project root`)
    }
  }
  await visit("")
  return found
}
export async function hashFile(file: string) {
  return new Bun.CryptoHasher("sha256").update(await readFile(file)).digest("hex")
}
export async function fingerprint(workspace: string) {
  const hash = new Bun.CryptoHasher("sha256")
  for (const file of await files(workspace)) {
    if (Bun.file(path.join(workspace, file)).size > 32 * 1024 * 1024)
      throw new NexusError("PROJECT_LIMIT", `File too large to verify: ${file}`)
    hash.update(file).update(await hashFile(path.join(workspace, file)))
  }
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
