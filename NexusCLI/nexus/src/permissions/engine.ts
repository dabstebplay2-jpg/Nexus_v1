import type { Capability } from "../domain/types"
import type { PermissionReply, PermissionRequest } from "../domain/ports"
import { NexusError, cancellable } from "../shared/errors"
import { safeJson } from "../shared/redact"

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
            DELETE: "ask",
            GIT_MUTATE: "ask",
          } as Rules
        )[capability] ??
        "ask",
    )
    return decisions.includes("deny") ? "deny" : decisions.includes("ask") ? "ask" : "allow"
  }
  async authorize(request: PermissionRequest, signal: AbortSignal, waiting: () => void) {
    const decision = this.evaluate(request.capabilities)
    const operation = `${request.tool} ${safeJson(request.arguments)} [${request.capabilities.join(", ")}]`
    if (decision === "deny")
      throw new NexusError(
        "PERMISSION_DENIED",
        `Blocked operation: ${operation}. Permission policy denies this capability. Review the operation and its scope; choose a permitted project tool or ask the operator to review the relevant permission rule.`,
      )
    if (decision === "allow") return
    waiting()
    if (!this.reply)
      throw new NexusError(
        "PERMISSION_REQUIRED",
        `Approval required for operation: ${operation}. Nothing was executed. Review and approve the request in the connected UI or resume in an interactive terminal.`,
      )
    if (!(await cancellable(this.reply(request, signal), signal)))
      throw new NexusError(
        "PERMISSION_DENIED",
        `User declined operation: ${operation}. Nothing was executed. Revise the operation or submit it again for explicit approval.`,
      )
  }
}
export function commandCapabilities(command: string, platform = process.platform): Capability[] {
  // Only a deliberately small, literal grammar may bypass unrestricted-process approval.
  // No expressions, paths, redirects, aliases, script blocks or expandable strings.
  if (
    platform === "win32" &&
    /^(?:Get-Location|Get-ChildItem(?:\s+-(?:Recurse|File|Directory|Force))*)(?:\s*\|\s*(?:Select-Object\s+(?:FullName|Name|Length)(?:\s*,\s*(?:FullName|Name|Length))*|Format-(?:List|Table)))* *$/i.test(
      command.trim(),
    )
  )
    return ["READ"]
  // Collect all capabilities: a mixed pipeline must not hide a later dangerous operation.
  const capabilities = new Set<Capability>(["RUN_PROCESS"])
  const tokens = command.replace(/'[^']*'/g, "''")
  const registryRead =
    /^\s*Get-(?:Item|ItemProperty)\s+(?:-LiteralPath\s+)?(?:'(?:HKLM|HKCU):[^'\r\n]*'|(?:HKLM|HKCU):[\\\w.-]+)\s*$/i.test(
      command,
    )
  // Nested interpreters remain conservative; an argument to cmd /c or -Command
  // may itself be an operation, rather than an ordinary literal argument.
  const nestedSystem =
    /\b(?:cmd(?:\.exe)?|powershell(?:\.exe)?|pwsh(?:\.exe)?|bash|sh)\s/i.test(tokens) &&
    /\s(?:format(?:\.exe|\.com)?|diskpart|reg(?:\.exe)?|regedit|Set-ExecutionPolicy|(?:Set|Start|Stop|Restart)-Service|shutdown|bcdedit|netsh|sudo)(?=\s|$)/i.test(
      tokens,
    )
  if (/\brm\s+.*-[a-z]*r[a-z]*f|\brm\s+.*-[a-z]*f[a-z]*r|\b(?:Remove-Item|rmdir|rd)\s+.*(?:-Recurse|\/s)/i.test(tokens))
    capabilities.add("SYSTEM_MUTATION")
  if (
    /(?:^|[;\n|&({])\s*(?:format(?:\.com|\.exe)?|diskpart|reg(?:\.exe)?|regedit|Set-ExecutionPolicy|(?:Set|Start|Stop|Restart)-Service|(?:Enable|Disable)-[^\s]+|shutdown|bcdedit|netsh|sudo)(?=\s|$)/i.test(
      tokens,
    ) ||
    (/\b(?:HKLM|HKCU|Registry):/i.test(command) && !registryRead) ||
    nestedSystem
  )
    capabilities.add("SYSTEM_MUTATION")
  if (/(?:^|[\s;|&({])(?:rm|Remove-Item|ri|erase|rmdir|rd|del)(?=\s|$)|\bgit\s+(?:reset|clean)(?=\s|$)/i.test(tokens))
    capabilities.add("DELETE")
  if (
    /(?:^|[\s;|&({])(?:Set-Content|Add-Content|Out-File|New-Item|Copy-Item|Move-Item|Rename-Item|sc|ac|ni|cp|mv|copy|move)(?=\s|$)|[>]/i.test(
      tokens,
    )
  )
    capabilities.add("WRITE_PROJECT")
  if (/\bgit\s+(?:push|commit|checkout|restore|rebase|merge|switch|reset|clean)(?=\s|$)/i.test(tokens))
    capabilities.add("GIT_MUTATE")
  if (/\b(?:npm|bun|pnpm|yarn|pip|uv)\s+(?:install|add|sync)(?=\s|$)/i.test(tokens)) {
    capabilities.add("INSTALL_PACKAGE")
    capabilities.add("NETWORK")
  }
  return [...capabilities]
}
