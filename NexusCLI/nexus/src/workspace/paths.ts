import path from "node:path"

/**
 * Shared path vocabulary for everything that walks a workspace.
 *
 * These predicates used to live inside `tools/workspace.ts`. They moved here so the incremental
 * index and the tool layer can agree on "which files are project source" without importing each
 * other, which would close a dependency cycle.
 */
export const ignoredDirectories = new Set([
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
/** Workspace-relative identity is always compared with forward slashes, on every platform. */
export function normalise(file: string) {
  return file.split(path.sep).join("/")
}
