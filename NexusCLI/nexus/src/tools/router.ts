import type { Contract, TaskIntent } from "../domain/types"

/**
 * Tool routing and guidance.
 *
 * Observed with a 9B local model: the shell became the universal filesystem API. `bash ls`,
 * `bash cat`, `bash grep` -- each one costs a permission decision, produces unbounded output,
 * loses the content hash that `write`/`edit` require, and cannot be attributed by the workspace
 * delta. The guarded tools already do all of that correctly; the model simply did not know when
 * to prefer them.
 *
 * This is a *guidance* layer, not a controller. It states no new permission, blocks no call and
 * cannot terminate a task. Enforcement stays where it already lives:
 *
 *   - which tools exist at all: `ToolRegistry`
 *   - which tools this intent may use: `intelligence/intent.toolAllowed`
 *   - whether a call is permitted: `PermissionEngine` and the workspace guard
 *   - whether the task is done: `CompletionPolicy`, and only `CompletionPolicy`
 *
 * Pure and deterministic: same goal in, same guidance out, so the prompt stays reproducible.
 */

export type ToolClass =
  | "discovery"
  | "read"
  | "retrieval"
  | "mutate"
  | "verify"
  | "shell"
  | "ledger"
  | "plan"
  | "vcs"
  | "unknown"

/** Classification of the built-in surface. An unregistered name is `unknown`, never guessed. */
export const TOOL_CLASSES: Readonly<Record<string, ToolClass>> = {
  list: "discovery",
  glob: "discovery",
  search: "discovery",
  read: "read",
  retrieve: "retrieval",
  write: "mutate",
  edit: "mutate",
  verify: "verify",
  bash: "shell",
  history: "ledger",
  output: "ledger",
  update_plan: "plan",
  git_status: "vcs",
  git_diff: "vcs",
}

export function toolClass(name: string): ToolClass {
  return TOOL_CLASSES[name] ?? "unknown"
}

export type ShellRedirect = { tool: string; reason: string }

/**
 * Shell stages that have a first-class equivalent.
 *
 * Only whole-command heads are matched. A substring rule would fire on `git log --grep=x` and
 * send the agent to `search`, which is worse than saying nothing.
 */
const alternatives: ReadonlyArray<{ pattern: RegExp; tool: string; reason: string }> = [
  {
    pattern: /^(?:ls|dir|tree|Get-ChildItem|gci)(?:\s|$)/i,
    tool: "list",
    reason: "list paginates, honours the workspace guard and never needs RUN_PROCESS",
  },
  {
    pattern: /^(?:cat|type|head|tail|more|less|Get-Content|gc)(?:\s|$)/i,
    tool: "read",
    reason: "read returns the content hash that write and edit require",
  },
  {
    pattern: /^(?:grep|egrep|fgrep|rg|ag|ack|findstr|Select-String|sls)(?:\s|$)/i,
    tool: "search",
    reason: "search is bounded to 200 matches and skips ignored and secret paths",
  },
  {
    pattern: /^(?:find|fd|Get-Item)(?:\s|$)/i,
    tool: "glob",
    reason: "glob matches paths without spawning a process",
  },
  {
    pattern: /^(?:sed|awk|tee|Set-Content|Add-Content|Out-File)(?:\s|$)/i,
    tool: "edit",
    reason: "edit is atomic and hash-checked, so a concurrent user change cannot be overwritten",
  },
  {
    pattern:
      /^(?:(?:bun|npm|pnpm|yarn)\s+(?:run\s+)?(?:test|typecheck|lint|build)|pytest|(?:cargo|go|dotnet)\s+(?:test|build)|tsc)(?:\s|$)/i,
    tool: "verify",
    reason: "verify runs the trusted project checks and is the only path that produces verification evidence",
  },
]

/**
 * The guarded equivalent of a shell command, when every stage of it has one.
 *
 * Conservative by construction. A command that redirects, substitutes, or contains one stage
 * without an equivalent gets no suggestion at all: the shell is a legitimate tool and advising
 * against a real process launch would be worse than silence.
 */
export function shellRedirect(command: string): ShellRedirect | undefined {
  const text = command.trim()
  if (!text || /[>`]|\$\(|<\(/.test(text)) return undefined
  const stages = text
    .split(/&&|\|\||[;|]/)
    .map((stage) => stage.trim().replace(/^(?:[A-Za-z_][A-Za-z0-9_]*=\S*\s+)+/, ""))
    .filter(Boolean)
  if (!stages.length) return undefined
  const matched = stages.map((stage) => alternatives.find((entry) => entry.pattern.test(stage)))
  if (matched.some((entry) => entry === undefined)) return undefined
  const last = matched.at(-1)
  return last ? { tool: last.tool, reason: last.reason } : undefined
}

/** Preference order offered to the model, narrowed to what this intent is actually allowed to call. */
export function preferredTools(intent: TaskIntent | undefined, available: readonly string[] = []): string[] {
  const order: ToolClass[] = ["discovery", "read", "retrieval", "plan", "mutate", "verify", "vcs", "ledger", "shell"]
  const names = available.length ? [...available] : Object.keys(TOOL_CLASSES)
  const allowed = intent?.allowedTools.length ? names.filter((name) => intent.allowedTools.includes(name)) : names
  return allowed.sort(
    (left, right) =>
      order.indexOf(toolClass(left)) - order.indexOf(toolClass(right)) || left.localeCompare(right),
  )
}

/**
 * The routing paragraph injected into L0.
 *
 * Short on purpose. It competes for the same window as the working set, and on an 8k model a
 * verbose policy essay is itself a context regression.
 */
export function routingGuidance(
  intent: TaskIntent | undefined,
  mode: Contract["mode"],
  available: readonly string[] = [],
): string {
  const names = available.length ? available : Object.keys(TOOL_CLASSES)
  const shellAvailable = names.includes("bash") && (!intent?.allowedTools.length || intent.allowedTools.includes("bash"))
  const lines = [
    "filesystem questions use list/glob/search then a targeted read; code changes use read (for the hash) then edit or write; proof uses verify.",
  ]
  if (shellAvailable)
    lines.push(
      "bash is for real process work only (installers, generators, git, ad-hoc builds) and is never a file API: ls/cat/grep/find have guarded equivalents that are cheaper, bounded and cannot be denied for RUN_PROCESS.",
    )
  else
    lines.push(
      "mutating and process tools are not offered for this task; answer from the read-only surface and say what you could not determine.",
    )
  if (mode === "answer") lines.push("The deliverable is the answer itself, so finish with a written response, not a command.")
  if (intent?.workflow.length) lines.push(`Expected workflow: ${intent.workflow.join(" \u2192 ")}.`)
  return lines.join(" ")
}

/** One line appended to a shell result when a guarded tool would have been the better route. */
export function redirectAdvice(command: string): string | undefined {
  const redirect = shellRedirect(command)
  return redirect
    ? `Routing hint: prefer the ${redirect.tool} tool for this next time -- ${redirect.reason}.`
    : undefined
}
