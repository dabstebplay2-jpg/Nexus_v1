import type { Capability } from "../domain/types"

/**
 * Trust profiles: the data model for "stop asking me to approve `bun test`".
 *
 * Today PermissionEngine maps a capability to allow/ask/deny, which means every unrestricted shell
 * command is one undifferentiated `ask`, however ordinary it is. A profile lets an operator pin a
 * specific action and command shape to a decision, and lets a workspace pick a posture.
 *
 * This is the foundation only -- no file format, no UI, no persistence. What it does fix is the
 * shape of the answer, and the safety floor around it:
 *
 *  - A profile can never grant a capability in `NEVER_AUTOMATIC`; such a rule degrades to `ask`.
 *  - A profile can never overturn a `deny`, from either the engine defaults or another rule.
 *  - Patterns are literal, with an optional single trailing `*`. A regular expression read from a
 *    config file would be both an injection surface and a denial-of-service surface.
 */
export type TrustLevel = "safe" | "normal" | "trusted-workspace" | "autonomous"
export type Permission = "allow" | "ask" | "deny"
/** `action` is a tool name; `pattern` narrows it by command text. An absent pattern matches any input. */
export type TrustRule = { action: string; pattern?: string; permission: Permission }
export type TrustProfile = { workspace: string; level: TrustLevel; rules: TrustRule[] }

/** Capabilities no stored rule may grant, at any level. Escalation stays a human decision. */
export const NEVER_AUTOMATIC: Capability[] = ["SECRET_ACCESS", "WRITE_OUTSIDE_PROJECT", "SYSTEM_MUTATION"]

/**
 * Capability posture per level. No level mentions a NEVER_AUTOMATIC capability, so the engine
 * defaults (deny) stand for those however far trust is raised.
 */
const levels: Record<TrustLevel, Partial<Record<Capability, Permission>>> = {
  // Nothing that leaves a trace happens without a human.
  safe: { READ: "allow", WRITE_PROJECT: "ask", RUN_TESTS: "ask", RUN_PROCESS: "ask", DELETE: "deny" },
  // The v0.2.2 defaults, unchanged.
  normal: {},
  "trusted-workspace": { READ: "allow", WRITE_PROJECT: "allow", RUN_TESTS: "allow", RUN_PROCESS: "allow" },
  autonomous: {
    READ: "allow",
    WRITE_PROJECT: "allow",
    RUN_TESTS: "allow",
    RUN_PROCESS: "allow",
    DELETE: "allow",
    GIT_MUTATE: "allow",
  },
}

export const defaultProfile = (workspace: string, level: TrustLevel = "normal"): TrustProfile => ({
  workspace,
  level,
  rules: [],
})

/** Capability defaults implied by a level. Explicit engine rules still win over these. */
export const levelRules = (level: TrustLevel): Partial<Record<Capability, Permission>> => levels[level]

const normalise = (value: string) => value.trim().replace(/\s+/g, " ")
const matches = (value: string, pattern?: string) => {
  if (pattern === undefined) return true
  const target = normalise(value)
  const wanted = normalise(pattern)
  if (wanted === "*") return true
  if (wanted.endsWith("*")) return target.startsWith(wanted.slice(0, -1))
  return target === wanted
}

/**
 * The decision a profile contributes, or undefined when it has nothing to say.
 * Later rules win, so an operator can append an exception without rewriting the list.
 */
export function matchPermission(
  profile: TrustProfile | undefined,
  request: { action: string; command?: string; capabilities: Capability[] },
): { permission: Permission; rule: TrustRule } | undefined {
  const rule = profile?.rules
    .filter((item) => item.action === request.action && matches(request.command ?? "", item.pattern))
    .at(-1)
  if (!rule) return undefined
  const floored =
    rule.permission === "allow" && request.capabilities.some((capability) => NEVER_AUTOMATIC.includes(capability))
  return { permission: floored ? "ask" : rule.permission, rule }
}

/** Structural validation for an untrusted profile document. Unknown shapes are rejected, never coerced. */
export function parseTrustProfile(raw: unknown, workspace: string): TrustProfile | undefined {
  if (!raw || typeof raw !== "object") return undefined
  const source = raw as { level?: unknown; rules?: unknown }
  const level = (["safe", "normal", "trusted-workspace", "autonomous"] as const).find((item) => item === source.level)
  if (!level || !Array.isArray(source.rules)) return undefined
  const rules = source.rules.filter(
    (item): item is TrustRule =>
      Boolean(item) &&
      typeof item === "object" &&
      typeof (item as TrustRule).action === "string" &&
      (["allow", "ask", "deny"] as const).some((permission) => permission === (item as TrustRule).permission) &&
      ((item as TrustRule).pattern === undefined || typeof (item as TrustRule).pattern === "string"),
  )
  return rules.length === source.rules.length ? { workspace, level, rules } : undefined
}
