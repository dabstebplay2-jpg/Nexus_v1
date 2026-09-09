import type { NexusAPI } from "../../src/api"
import type { AgentSession, Decision, EvidenceKind, Status, Verdict } from "../../src/domain/types"

/**
 * The structured run report.
 *
 * Nexus's whole claim is that it can prove what it did, so every client must show the same
 * proof: what it planned, what it changed, what it ran, what that produced, and what may be
 * concluded from it. This module owns the *derivation* of those facts from the session ledger.
 * Wording, colour and layout stay in each client, so the terminal and the web interface can
 * present the same facts without either one inventing a verdict of its own.
 */
export type ReportPlanStep = {
  id: string
  description: string
  state: "PENDING" | "ACTIVE" | "DONE" | "BLOCKED"
  note: string
}
export type ReportFileChange = { path?: string; added: number; removed: number; patch: string }
export type ReportProcess = { actionId: string; tool: string; status: string; attribution: string }
export type ReportCheck = {
  checkId: string
  verdict: Verdict
  argv: string
  exitCode?: number
  unknownReason?: string
  /** Files this check mutated while running, which is why its exit code cannot be attributed. */
  sourceChanges: string[]
  evidenceId: string
}
export type ReportCriterion = {
  id: string
  description: string
  kind: EvidenceKind
  expectedVerdict: Verdict
  baseline: boolean
  met: boolean
  verdict?: Verdict
  evidenceId?: string
  /** The completion policy listed this criterion as the reason the run is not complete. */
  unsatisfied: boolean
}
/** What a human can do next. Derived once so no client has to guess the way out of UNKNOWN. */
export type ReportAffordance = "inspect" | "trust-checks" | "assert-goal" | "resolve-action" | "resume"
export type RunReport = {
  sessionId: string
  goal: string
  status: Status
  project: string
  model: string
  branch: string
  turns: number
  toolCount: number
  createdAt: number
  updatedAt: number
  decision?: Decision
  plan: ReportPlanStep[]
  changes: { files: ReportFileChange[]; processes: ReportProcess[] }
  verification: ReportCheck[]
  evidence: ReportCriterion[]
  affordances: ReportAffordance[]
  /** The model's closing message. Only trustworthy once the completion policy authorized COMPLETED. */
  proposal?: { verified: boolean; text: string }
}

const number = (value: unknown) => (typeof value === "number" ? value : undefined)
const strings = (value: unknown) => (Array.isArray(value) ? value.map(String) : [])

/** Unified diff headers carry a tab-separated label after the path. */
function patchFile(patch: string) {
  return patch
    .split("\n")
    .find((row) => row.startsWith("+++ b/"))
    ?.slice("+++ b/".length)
    .split("\t")[0]
}
function countLines(patch: string) {
  const rows = patch.split("\n")
  return {
    added: rows.filter((row) => row.startsWith("+") && !row.startsWith("+++")).length,
    removed: rows.filter((row) => row.startsWith("-") && !row.startsWith("---")).length,
  }
}

function affordances(session: AgentSession, unknownActions: boolean): ReportAffordance[] {
  if (session.status === "COMPLETED") return []
  if (session.status === "UNKNOWN") return ["inspect", "trust-checks", "assert-goal", "resume"]
  const outcome = session.decision?.outcome
  return [
    ...(outcome === "NEEDS_USER_INPUT" ? (["assert-goal", "resume"] as ReportAffordance[]) : []),
    ...(outcome === "BLOCKED" ? (["inspect"] as ReportAffordance[]) : []),
    ...(unknownActions ? (["resolve-action"] as ReportAffordance[]) : []),
  ]
}

export function buildRunReport(api: NexusAPI, id: string, session: AgentSession): RunReport {
  const inspected = api.inspect(id)
  const evidence = inspected.evidence
  const changes = api.diff(id)
  const checks = evidence.filter((item) => item.source === "verification")
  // The last run of each check is the current one; earlier runs only contribute mutated files.
  const latest = new Map<string, (typeof checks)[number]>()
  checks.forEach((item) => latest.set(String(item.metadata.checkId), item))
  const unmet = new Set(session.decision?.missing ?? [])
  const proposal = session.conversation.findLast(
    (message) => message.role === "assistant" && !message.toolCalls?.length,
  )
  return {
    sessionId: session.id,
    goal: session.goal,
    status: session.status,
    project: session.project.kind,
    model: session.model.model,
    branch: session.baseline.branch,
    turns: session.turns,
    toolCount: session.toolCount,
    createdAt: session.createdAt,
    updatedAt: session.updatedAt,
    decision: session.decision,
    plan: session.plan.map((step) => ({
      id: step.id,
      description: step.description,
      state: step.state,
      note: step.note,
    })),
    changes: {
      files: changes.patches.map((item) => ({
        path: patchFile(item.patch),
        ...countLines(item.patch),
        patch: item.patch,
      })),
      // Trusted checks get their own section; listing them here as unattributable processes is noise.
      processes: changes.processes.filter((item) => !item.tool.startsWith("check_")),
    },
    verification: [...latest.entries()].map(([checkId, item]) => ({
      checkId,
      verdict: item.verdict,
      argv: Array.isArray(item.metadata.argv) ? item.metadata.argv.map(String).join(" ") : item.command,
      exitCode: number(item.metadata.exitCode),
      unknownReason: typeof item.metadata.unknownReason === "string" ? item.metadata.unknownReason : undefined,
      sourceChanges: [
        ...new Set(
          checks
            .filter((entry) => String(entry.metadata.checkId) === checkId)
            .flatMap((entry) => strings(entry.metadata.sourceChanges)),
        ),
      ],
      evidenceId: item.id,
    })),
    evidence: session.contract.criteria
      .filter((criterion) => criterion.required)
      .map((criterion) => {
        const backing = evidence.filter((item) =>
          criterion.checkId
            ? item.source === "verification" && item.metadata.checkId === criterion.checkId
            : item.kind === criterion.kind && item.source !== "tool",
        )
        const expectedVerdict = criterion.expectedVerdict ?? "pass"
        // A baseline criterion is proved by the run that failed, not by the most recent run.
        const backed = criterion.baseline ? backing.find((item) => item.verdict === expectedVerdict) : backing.at(-1)
        return {
          id: criterion.id,
          description: criterion.description,
          kind: criterion.kind,
          expectedVerdict,
          baseline: criterion.baseline ?? false,
          met: backed?.verdict === expectedVerdict,
          verdict: backed?.verdict,
          evidenceId: backed?.id,
          unsatisfied: unmet.has(criterion.id),
        }
      }),
    affordances: affordances(
      session,
      inspected.actions.some((action) => action.status === "UNKNOWN"),
    ),
    ...(proposal?.content?.trim()
      ? { proposal: { verified: session.status === "COMPLETED", text: proposal.content.trim() } }
      : {}),
  }
}
