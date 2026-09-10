import type { Capability } from "../domain/types"

/**
 * Execution isolation ports.
 *
 * Today the agent runs processes directly on the user's machine: PermissionEngine decides *whether*
 * a capability may run, and nothing constrains what the resulting process can reach. These types
 * give that gap a shape, so a container or job-object backend can be added later without touching
 * the agent loop, the tools or the verification engine.
 *
 * Phase 0 deliberately ships only the local backend. The point of `SandboxCapabilities` is that no
 * layer can mistake it for real isolation: it reports, honestly, what it does not enforce.
 */

/** Filesystem reach, as data. A backend that cannot enforce it must say so. */
export type PathScope = {
  /** Absolute roots the process may read. */
  read: string[]
  /** Absolute roots the process may write. */
  write: string[]
  /** Paths that stay unreachable even inside a readable root. */
  deny: string[]
}
export type NetworkPolicy = { mode: "none" } | { mode: "allowlist"; hosts: string[] } | { mode: "unrestricted" }
export type ExecutionPolicy = {
  scope: PathScope
  network: NetworkPolicy
  timeoutMs: number
  maxOutputBytes: number
  /** Environment names the process may inherit. Everything else is withheld. */
  environment: { allow: string[]; deny: string[] }
  /** The capabilities the permission layer authorized for this execution. */
  capabilities: Capability[]
}
export type ExecutionRequest = {
  argv: string[]
  cwd: string
  policy: ExecutionPolicy
  signal: AbortSignal
  /** True when the caller wants the platform shell rather than a direct exec. */
  shell?: boolean
}
export type SandboxCapabilities = {
  name: string
  filesystemIsolation: boolean
  networkIsolation: boolean
  /** The child and its descendants can be terminated as one group. */
  processIsolation: boolean
  /** True when the backend enforces PathScope, rather than merely carrying it. */
  pathScopeEnforced: boolean
}
export type ExecutionResult = {
  stdout: string
  stderr: string
  exitCode: number
  argv: string[]
  /** What the backend actually enforced, so evidence can record isolation honestly. */
  enforced: SandboxCapabilities
}
/** One process launch per call. A provider never decides permissions and never interprets output. */
export interface SandboxProvider {
  readonly capabilities: SandboxCapabilities
  run(request: ExecutionRequest): Promise<ExecutionResult>
}
