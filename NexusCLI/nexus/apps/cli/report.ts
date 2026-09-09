import type { NexusAPI } from "../../src/api"
import type { AgentSession, Evidence } from "../../src/domain/types"

/**
 * The run report. Nexus's whole claim is that it can prove what it did, so the last thing a
 * user sees must be the proof, not a JSON dump: what it planned, what it changed, what it ran,
 * what that produced, and what may be concluded from it.
 */
const colour = process.stdout.isTTY
const paint = (code: string, text: string) => (colour ? `\u001b[${code}m${text}\u001b[0m` : text)
const heading = (label: string) => `\n${paint("1", label)}\n${"─".repeat(Math.max(label.length, 12))}`
const mark = { pass: paint("32", "✓"), fail: paint("31", "✗"), unknown: paint("33", "?") }
const verdictMark = (verdict: string) => mark[verdict as keyof typeof mark] ?? "·"
const short = (id: string) => id.slice(0, 8)

function planSection(session: AgentSession) {
  if (!session.plan.length) return ["  (no explicit plan was recorded)"]
  const glyph = { DONE: mark.pass, BLOCKED: mark.fail, ACTIVE: paint("36", "▸"), PENDING: "·" }
  return session.plan.map((step) => `  ${glyph[step.state]} ${step.description}${step.note ? ` — ${step.note}` : ""}`)
}

function changeSection(api: NexusAPI, id: string) {
  const changes = api.diff(id)
  const lines = changes.patches.map((item) => {
    const rows = item.patch.split("\n")
    const added = rows.filter((row) => row.startsWith("+") && !row.startsWith("+++")).length
    const removed = rows.filter((row) => row.startsWith("-") && !row.startsWith("---")).length
    // Unified headers carry a tab-separated label after the path.
    const file = rows
      .find((row) => row.startsWith("+++ b/"))
      ?.slice("+++ b/".length)
      .split("\t")[0]
    return `  ${file ?? "(unknown file)"}  ${paint("32", `+${added}`)} ${paint("31", `-${removed}`)}`
  })
  // Trusted checks get their own section; listing them here as unattributable processes is noise.
  changes.processes
    .filter((item) => !item.tool.startsWith("check_"))
    .forEach((item) => lines.push(`  ${paint("33", "!")} ${item.tool} (${item.status}) — ${item.attribution}`))
  return lines.length ? lines : ["  (no file changes were recorded)"]
}

function verificationSection(evidence: Evidence[]) {
  const checks = evidence.filter((item) => item.source === "verification")
  if (!checks.length) return ["  (no trusted check has been run)"]
  const latest = new Map<string, Evidence>()
  checks.forEach((item) => latest.set(String(item.metadata.checkId), item))
  return [...latest.entries()].map(([checkId, item]) => {
    const argv = Array.isArray(item.metadata.argv) ? item.metadata.argv.join(" ") : item.command
    const exit = item.metadata.exitCode === undefined ? "" : ` exit=${String(item.metadata.exitCode)}`
    const note =
      typeof item.metadata.unknownReason === "string" ? `\n      ${paint("33", item.metadata.unknownReason)}` : ""
    // The first unattributable run names the files; later runs only say the check is quarantined.
    const mutated = [
      ...new Set(
        checks
          .filter((entry) => String(entry.metadata.checkId) === checkId)
          .flatMap((entry) => (Array.isArray(entry.metadata.sourceChanges) ? entry.metadata.sourceChanges : []))
          .map(String),
      ),
    ]
    const files = mutated.length ? `\n      ${paint("33", `source changed by this check: ${mutated.join(", ")}`)}` : ""
    return `  ${verdictMark(item.verdict)} ${checkId}  ${item.verdict}${exit}  ${paint("90", argv)}${note}${files}`
  })
}

function evidenceSection(session: AgentSession, evidence: Evidence[]) {
  const unmet = new Set(session.decision?.missing ?? [])
  return session.contract.criteria
    .filter((criterion) => criterion.required)
    .map((criterion) => {
      const backing = evidence.filter((item) =>
        criterion.checkId
          ? item.source === "verification" && item.metadata.checkId === criterion.checkId
          : item.kind === criterion.kind && item.source !== "tool",
      )
      const expected = criterion.expectedVerdict ?? "pass"
      // A baseline criterion is proved by the run that failed, not by the most recent run.
      const latest = criterion.baseline ? backing.find((item) => item.verdict === expected) : backing.at(-1)
      const met = latest?.verdict === expected
      const state = latest
        ? `${latest.verdict}${expected === "pass" ? "" : ` (expected ${expected})`} (e:${short(latest.id)})`
        : "no evidence yet"
      const flag = unmet.has(criterion.id) ? paint("33", " ← not satisfied") : ""
      return `  ${met ? mark.pass : verdictMark(latest?.verdict ?? "")} ${criterion.description}: ${state}${flag}`
    })
}

/** UNKNOWN is a first-class answer, so it has to be explained rather than reported as a failure. */
function resultSection(session: AgentSession, id: string) {
  const outcome = session.decision?.outcome
  const reason = session.decision?.reason ?? "Stopped without a decision"
  if (session.status === "COMPLETED")
    return [`  ${paint("32", "DONE")} — ${reason}`, `  Every required criterion has current, trusted passing evidence.`]
  if (session.status === "UNKNOWN")
    return [
      `  ${paint("33", "UNKNOWN")} — the result could not be proved either way.`,
      `  ${reason}`,
      ``,
      `  This is not a failure and not a success: the checks stopped being trustworthy,`,
      `  so Nexus will not claim the work is done. You can:`,
      `    • inspect what ran:   nexus inspect-session ${id}`,
      `    • review the checks:  nexus trust-checks ${id} "why the harness change is legitimate"`,
      `    • confirm by hand:    nexus assert-goal ${id} "the scenario you personally checked"`,
      `  then: nexus resume ${id}`,
    ]
  return [
    `  ${paint("31", session.status)} — ${reason}`,
    ...(outcome === "NEEDS_USER_INPUT"
      ? [`  Confirm the scenario: nexus assert-goal ${id} "what you checked", then nexus resume ${id}`]
      : []),
    ...(outcome === "BLOCKED" ? [`  Inspect before resuming: nexus inspect-session ${id}`] : []),
  ]
}

export function report(api: NexusAPI, id: string, session: AgentSession) {
  const evidence = api.inspect(id).evidence
  const proposal = session.conversation.findLast(
    (message) => message.role === "assistant" && !message.toolCalls?.length,
  )
  const sections: [string, string[]][] = [
    ["PLAN", planSection(session)],
    ["CHANGES", changeSection(api, id)],
    ["VERIFICATION", verificationSection(evidence)],
    ["EVIDENCE", evidenceSection(session, evidence)],
    ["RESULT", resultSection(session, id)],
  ]
  const output = sections.map(([label, lines]) => `${heading(label)}\n${lines.join("\n")}`).join("\n")
  const summary =
    proposal?.content?.trim() &&
    `${heading(session.status === "COMPLETED" ? "SUMMARY" : "MODEL PROPOSAL (UNVERIFIED)")}\n  ${proposal.content.trim().split("\n").join("\n  ")}`
  return `${output}${summary ? `\n${summary}` : ""}\n\n${paint("90", `Session: ${id}`)}`
}
