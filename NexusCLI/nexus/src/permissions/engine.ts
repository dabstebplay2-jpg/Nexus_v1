import type { Capability } from "../domain/types"
import type { PermissionReply, PermissionRequest } from "../domain/ports"
import { NexusError, cancellable } from "../shared/errors"

export type Rules = Partial<Record<Capability, "allow" | "ask" | "deny">>
export class PermissionEngine {
  constructor(
    private readonly rules: Rules = {},
    private readonly reply?: PermissionReply,
  ) {}
  evaluate(capabilities: Capability[]) {
    const decisions = capabilities.map(
      (capability) =>
        this.rules[capability] ??
        (
          {
            READ: "allow",
            WRITE_PROJECT: "allow",
            WRITE_OUTSIDE_PROJECT: "deny",
            SYSTEM_MUTATION: "deny",
            SECRET_ACCESS: "deny",
            DELETE: "deny",
            GIT_MUTATE: "ask",
          } as Rules
        )[capability] ??
        "ask",
    )
    return decisions.includes("deny") ? "deny" : decisions.includes("ask") ? "ask" : "allow"
  }
  async authorize(request: PermissionRequest, signal: AbortSignal, waiting: () => void) {
    const decision = this.evaluate(request.capabilities)
    if (decision === "deny") throw new NexusError("PERMISSION_DENIED", `Denied ${request.capabilities.join(", ")}`)
    if (decision === "allow") return
    waiting()
    if (!this.reply)
      throw new NexusError("PERMISSION_REQUIRED", "Interactive approval required; resume in an interactive terminal")
    if (!(await cancellable(this.reply(request, signal), signal)))
      throw new NexusError("PERMISSION_DENIED", "User declined this action")
  }
}
export function commandCapabilities(command: string): Capability[] {
  if (
    /(?:\brm\s+.*-[a-z]*r[a-z]*f|\bformat\b|\bdiskpart\b|\bRemove-Item\b|\brmdir\b|\brd\s+\/s|\bdel\b|\bgit\s+(?:reset|clean)\b)/i.test(
      command,
    )
  )
    return ["DELETE", "SYSTEM_MUTATION"]
  if (/\bgit\s+(?:push|commit|checkout|restore|rebase|merge|switch)\b/i.test(command))
    return ["RUN_PROCESS", "GIT_MUTATE"]
  if (/\b(?:npm|bun|pnpm|yarn|pip|uv)\s+(?:install|add|sync)\b/.test(command))
    return ["RUN_PROCESS", "INSTALL_PACKAGE", "NETWORK"]
  return ["RUN_PROCESS"]
}
