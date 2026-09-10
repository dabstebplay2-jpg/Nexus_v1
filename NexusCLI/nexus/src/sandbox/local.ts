import type { ExecutionRequest, ExecutionResult, SandboxCapabilities, SandboxProvider } from "./ports"
import { runProcess } from "../tools/process"
import { shellArgv } from "../tools/platform"
import { NexusError } from "../shared/errors"
import { withinScope } from "./policy"

/**
 * The backend Nexus has today: a direct process launch on the user's machine.
 *
 * It reports no filesystem or network isolation, because it has none. Anything that wants to claim
 * a result was produced under isolation must read `capabilities` and find out that it was not.
 * The working directory is still checked against the policy's PathScope, so a scope violation is a
 * refusal rather than a silent escape — but that is a guard rail, not a sandbox.
 */
export class LocalSandboxProvider implements SandboxProvider {
  readonly capabilities: SandboxCapabilities = {
    name: "local",
    filesystemIsolation: false,
    networkIsolation: false,
    // runProcess starts a detached process group off Windows and kills the whole tree.
    processIsolation: process.platform !== "win32",
    pathScopeEnforced: false,
  }
  async run(request: ExecutionRequest): Promise<ExecutionResult> {
    if (request.shell && request.argv.length !== 1)
      throw new NexusError("INPUT", "A shell execution takes exactly one command string")
    if (!withinScope(request.policy.scope, request.cwd, true))
      throw new NexusError("BOUNDARY", `Execution directory ${request.cwd} is outside the permitted path scope`)
    const argv = request.shell ? shellArgv(request.argv.join(" ")) : request.argv
    const deadline = AbortSignal.any([request.signal, AbortSignal.timeout(request.policy.timeoutMs)])
    const result = await runProcess(argv, request.cwd, deadline, request.policy.maxOutputBytes)
    return { ...result, argv: request.argv, enforced: this.capabilities }
  }
}
