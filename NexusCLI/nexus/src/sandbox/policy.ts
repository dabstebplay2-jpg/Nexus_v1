import path from "node:path"
import type { Capability } from "../domain/types"
import type { ExecutionPolicy, NetworkPolicy, PathScope } from "./ports"

/** Names never passed to a child process, whatever the allowlist says. */
export const deniedEnvironment = ["API_KEY", "TOKEN", "PASSWORD", "SECRET", "CREDENTIAL"]

/**
 * The default policy for work inside one project: read and write the workspace, nothing else.
 *
 * `NETWORK` and `INSTALL_PACKAGE` are the only capabilities that widen the network policy, and
 * only because the permission layer already had to authorize them explicitly.
 */
export function workspacePolicy(
  workspace: string,
  capabilities: readonly Capability[] = [],
  overrides: Partial<ExecutionPolicy> = {},
): ExecutionPolicy {
  const root = path.resolve(workspace)
  const network: NetworkPolicy = capabilities.some((item) => item === "NETWORK" || item === "INSTALL_PACKAGE")
    ? { mode: "unrestricted" }
    : { mode: "none" }
  return {
    scope: {
      read: [root],
      write: [root],
      // Agent metadata and Git internals are protected from tools; a process must not reach them either.
      deny: [path.join(root, ".git"), path.join(root, ".nexus")],
    },
    network,
    timeoutMs: 120000,
    maxOutputBytes: 4 * 1024 * 1024,
    environment: { allow: [], deny: deniedEnvironment },
    capabilities: [...capabilities],
    ...overrides,
  }
}

/** True when `target` is inside a scope root and outside every denied path. */
export function withinScope(scope: PathScope, target: string, write = false) {
  const resolved = path.resolve(target)
  // `relative === ".."` means the target is the parent of `root`, i.e. outside it. Missing that
  // case is how a deny entry for `<workspace>/.git` accidentally denies the workspace itself.
  const contains = (root: string) => {
    const relative = path.relative(path.resolve(root), resolved)
    return relative === "" || (relative !== ".." && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative))
  }
  if (scope.deny.some(contains)) return false
  return (write ? scope.write : [...scope.read, ...scope.write]).some(contains)
}

/** Environment for a child process: the allowlist minus anything that looks like a credential. */
export function scopedEnvironment(policy: ExecutionPolicy, source: NodeJS.ProcessEnv = process.env) {
  const denied = new RegExp(policy.environment.deny.join("|"), "i")
  const allowed = new Set(policy.environment.allow)
  return Object.fromEntries(
    Object.entries(source).filter(([key]) => !denied.test(key) && (allowed.size === 0 || allowed.has(key))),
  )
}
