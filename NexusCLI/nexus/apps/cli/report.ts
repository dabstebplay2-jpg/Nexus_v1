import type { NexusAPI } from "../../src/api"
import type { AgentSession } from "../../src/domain/types"
import { buildRunReport, type RunReport } from "../shared/run-report"

/**
 * The terminal rendering of the run report. Nexus's whole claim is that it can prove what it
 * did, so the last thing a user sees must be the proof, not a JSON dump: what it planned, what
 * it changed, what it ran, what that produced, and what may be concluded from it.
 *
 * The facts come from buildRunReport; this file only decides wording, colour and layout, so the
 * web interface can present the same proof without either client inventing a verdict.
 */
const colour = process.stdout.isTTY
const paint = (code: string, text: string) => (colour ? `\u001b[${code}m${text}\u001b[0m` : text)
const heading = (label: string) => `\n${paint("1", label)}\n${"─".repeat(Math.max(label.length, 12))}`
const mark = { pass: paint("32", "✓"), fail: paint("31", "✗"), unknown: paint("33", "?") }
const verdictMark = (verdict: string) => mark[verdict as keyof typeof mark] ?? "·"
const short = (id: string) => id.slice(0, 8)

function planSection(model: RunReport) {
  if (!model.plan.length) return ["  (no explicit plan was recorded)"]
  const glyph = { DONE: mark.pass, BLOCKED: mark.fail, ACTIVE: paint("36", "▸"), PENDING: "·" }
  return model.plan.map((step) => `  ${glyph[step.state]} ${step.description}${step.note ? ` — ${step.note}` : ""}`)
}

function changeSection(model: RunReport) {
  const lines = model.changes.files.map(
    (item) => `  ${item.path ?? "(unknown file)"}  ${paint("32", `+${item.added}`)} ${paint("31", `-${item.removed}`)}`,
  )
  model.changes.processes.forEach((item) =>
    lines.push(`  ${paint("33", "!")} ${item.tool} (${item.status}) — ${item.attribution}`),
  )
  return lines.length ? lines : ["  (no file changes were recorded)"]
}

function verificationSection(model: RunReport) {
  if (!model.verification.length) return ["  (no trusted check has been run)"]
  return model.verification.map((item) => {
    const exit = item.exitCode === undefined ? "" : ` exit=${String(item.exitCode)}`
    const note = item.unknownReason === undefined ? "" : `\n      ${paint("33", item.unknownReason)}`
    // The first unattributable run names the files; later runs only say the check is quarantined.
    const files = item.sourceChanges.length
      ? `\n      ${paint("33", `source changed by this check: ${item.sourceChanges.join(", ")}`)}`
      : ""
    return `  ${verdictMark(item.verdict)} ${item.checkId}  ${item.verdict}${exit}  ${paint("90", item.argv)}${note}${files}`
  })
}

function evidenceSection(model: RunReport) {
  return model.evidence.map((item) => {
    const expected = item.expectedVerdict
    const state =
      item.evidenceId === undefined
        ? "no evidence yet"
        : `${item.verdict}${expected === "pass" ? "" : ` (expected ${expected})`} (e:${short(item.evidenceId)})`
    const flag = item.unsatisfied ? paint("33", " ← not satisfied") : ""
    return `  ${item.met ? mark.pass : verdictMark(item.verdict ?? "")} ${item.description}: ${state}${flag}`
  })
}

/** UNKNOWN is a first-class answer, so it has to be explained rather than reported as a failure. */
function resultSection(model: RunReport) {
  const id = model.sessionId
  const outcome = model.decision?.outcome
  const reason = model.decision?.reason ?? "Stopped without a decision"
  if (model.status === "COMPLETED")
    return [`  ${paint("32", "DONE")} — ${reason}`, `  Every required criterion has current, trusted passing evidence.`]
  if (model.status === "UNKNOWN")
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
    `  ${paint("31", model.status)} — ${reason}`,
    ...(outcome === "NEEDS_USER_INPUT"
      ? [`  Confirm the scenario: nexus assert-goal ${id} "what you checked", then nexus resume ${id}`]
      : []),
    ...(outcome === "BLOCKED" ? [`  Inspect before resuming: nexus inspect-session ${id}`] : []),
  ]
}

export function renderRunReport(model: RunReport) {
  const sections: [string, string[]][] = [
    ["PLAN", planSection(model)],
    ["CHANGES", changeSection(model)],
    ["VERIFICATION", verificationSection(model)],
    ["EVIDENCE", evidenceSection(model)],
    ["RESULT", resultSection(model)],
  ]
  const output = sections.map(([label, lines]) => `${heading(label)}\n${lines.join("\n")}`).join("\n")
  const summary =
    model.proposal &&
    `${heading(model.proposal.verified ? "SUMMARY" : "MODEL PROPOSAL (UNVERIFIED)")}\n  ${model.proposal.text.split("\n").join("\n  ")}`
  return `${output}${summary ? `\n${summary}` : ""}\n\n${paint("90", `Session: ${model.sessionId}`)}`
}

export function report(api: NexusAPI, id: string, session: AgentSession) {
  return renderRunReport(buildRunReport(api, id, session))
}
