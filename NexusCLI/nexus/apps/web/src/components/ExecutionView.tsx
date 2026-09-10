import { useState } from "react"
import type { ReportCriterion, RunReport } from "../../../shared/protocol"

/**
 * Execution view. The point of Nexus: not "I fixed it", but what it planned, what it changed,
 * what it ran, what that produced and what may be concluded. Every value here comes from the
 * run report; nothing on this screen is computed from the model's own words.
 */
const glyphFor = (verdict?: string) =>
  verdict === "pass" ? "✓" : verdict === "fail" ? "✗" : verdict === "unknown" ? "?" : "·"
const toneFor = (verdict?: string) =>
  verdict === "pass" ? "pass" : verdict === "fail" ? "fail" : verdict === "unknown" ? "unknown" : ""

function Glyph(props: { verdict?: string; text?: string }) {
  return <span className={`glyph ${toneFor(props.verdict)}`}>{props.text ?? glyphFor(props.verdict)}</span>
}

function Criterion(props: { criterion: ReportCriterion }) {
  const item = props.criterion
  return (
    <div className="check">
      <Glyph verdict={item.met ? "pass" : item.verdict} />
      <span>
        <span className="mono">{item.description}</span>
        <span className="muted">
          {": "}
          {item.evidenceId
            ? `${item.verdict}${item.expectedVerdict === "pass" ? "" : ` (expected ${item.expectedVerdict})`} (e:${item.evidenceId.slice(0, 8)})`
            : "no evidence yet"}
        </span>
        {item.unsatisfied && <span className="tag unknown"> not satisfied</span>}
      </span>
    </div>
  )
}

export function ExecutionView(props: {
  report?: RunReport
  busy: boolean
  onTrustChecks: (note: string) => void
  onAssertGoal: (note: string) => void
  onResume: () => void
  view?: "plan" | "changes" | "evidence"
}) {
  const [note, setNote] = useState("")
  const report = props.report
  return (
    <section className="pane">
      <header>
        {props.view === "plan" ? "Plan" : props.view === "changes" ? "Changes / Diff" : props.view === "evidence" ? "Evidence" : "Execution"}
        <span className="spacer" />
        {report && <span className="muted">{report.sessionId.slice(0, 8)}</span>}
      </header>
      <div className="body">
        {!report && <p className="muted">Run a task to see the plan, the changes, the checks and the evidence.</p>}
        {report && (
          <>
            {(!props.view || props.view === "plan") && <div className="section">
              <h3>Plan</h3>
              {report.plan.length === 0 ? (
                <p className="muted">No explicit plan was recorded.</p>
              ) : (
                report.plan.map((step) => (
                  <div key={step.id} className="check">
                    <Glyph
                      verdict={step.state === "DONE" ? "pass" : step.state === "BLOCKED" ? "fail" : undefined}
                      text={step.state === "ACTIVE" ? "▸" : undefined}
                    />
                    <span className="mono">
                      {step.description}
                      {step.note ? <span className="muted"> — {step.note}</span> : null}
                    </span>
                  </div>
                ))
              )}
            </div>}

            {(!props.view || props.view === "changes") && <div className="section">
              <h3>Changes</h3>
              {report.changes.files.length === 0 && report.changes.processes.length === 0 ? (
                <p className="muted">No file changes were recorded.</p>
              ) : (
                <>
                  {report.changes.files.map((file, index) => (
                    <div key={`${file.path ?? "unknown"}-${index}`}>
                      <div className="mono">
                        {file.path ?? "(unknown file)"} <span style={{ color: "var(--pass)" }}>+{file.added}</span>{" "}
                        <span style={{ color: "var(--fail)" }}>-{file.removed}</span>
                      </div>
                      <details className="patch">
                        <summary>diff</summary>
                        <pre>{file.patch}</pre>
                      </details>
                    </div>
                  ))}
                  {report.changes.processes.map((process) => (
                    <div key={process.actionId} className="check">
                      <Glyph verdict="unknown" text="!" />
                      <span className="mono">
                        {process.tool} ({process.status})<span className="muted"> — {process.attribution}</span>
                      </span>
                    </div>
                  ))}
                </>
              )}
            </div>}

            {(!props.view || props.view === "evidence") && <div className="section">
              <h3>Verification</h3>
              {report.verification.length === 0 ? (
                <p className="muted">No trusted check has been run.</p>
              ) : (
                report.verification.map((check) => (
                  <div key={check.checkId}>
                    <div className="check">
                      <Glyph verdict={check.verdict} />
                      <span className="mono">
                        {check.checkId} {check.verdict}
                        {check.exitCode === undefined ? "" : ` exit=${check.exitCode}`}
                        <span className="muted"> {check.argv}</span>
                      </span>
                    </div>
                    {check.unknownReason && (
                      <div className="mono" style={{ color: "var(--unknown)", paddingLeft: 20 }}>
                        {check.unknownReason}
                      </div>
                    )}
                    {check.sourceChanges.length > 0 && (
                      <div className="mono" style={{ color: "var(--unknown)", paddingLeft: 20 }}>
                        source changed by this check: {check.sourceChanges.join(", ")}
                      </div>
                    )}
                  </div>
                ))
              )}
            </div>}

            {(!props.view || props.view === "evidence") && <div className="section">
              <h3>Evidence</h3>
              {report.evidence.length === 0 ? (
                <p className="muted">The contract has no required criteria.</p>
              ) : (
                report.evidence.map((criterion) => <Criterion key={criterion.id} criterion={criterion} />)
              )}
            </div>}

            {!props.view && <div className="section">
              <h3>Result</h3>
              <div className="mono">
                {report.status === "COMPLETED" && (
                  <span style={{ color: "var(--pass)" }}>DONE — every required criterion has trusted evidence.</span>
                )}
                {report.status === "UNKNOWN" && (
                  <span style={{ color: "var(--unknown)" }}>
                    UNKNOWN — the result could not be proved either way. This is not a failure and not a success: the
                    checks stopped being trustworthy, so Nexus will not claim the work is done.
                  </span>
                )}
                {!["COMPLETED", "UNKNOWN"].includes(report.status) && (
                  <span style={{ color: "var(--fail)" }}>{report.status}</span>
                )}
                {report.decision ? `\n${report.decision.reason}` : ""}
              </div>
              {report.proposal && (
                <div className="section" style={{ marginTop: 10 }}>
                  <h3>{report.proposal.verified ? "Summary" : "Model proposal (unverified)"}</h3>
                  <div className="mono">{report.proposal.text}</div>
                </div>
              )}
            </div>}

            {!props.view && report.affordances.length > 0 && (
              <div className="section">
                <h3>Next steps</h3>
                <input
                  value={note}
                  placeholder="Note explaining what you checked or reviewed"
                  onChange={(event) => setNote(event.target.value)}
                />
                <div className="row" style={{ marginTop: 6, flexWrap: "wrap" }}>
                  {report.affordances.includes("trust-checks") && (
                    <button
                      disabled={props.busy || !note.trim()}
                      title="Re-review the changed check harness and trust it again"
                      onClick={() => {
                        props.onTrustChecks(note.trim())
                        setNote("")
                      }}
                    >
                      Trust checks
                    </button>
                  )}
                  {report.affordances.includes("assert-goal") && (
                    <button
                      disabled={props.busy || !note.trim()}
                      title="Record that you personally verified the scenario"
                      onClick={() => {
                        props.onAssertGoal(note.trim())
                        setNote("")
                      }}
                    >
                      I checked it myself
                    </button>
                  )}
                  {report.affordances.includes("resume") && (
                    <button className="primary" disabled={props.busy} onClick={props.onResume}>
                      Resume
                    </button>
                  )}
                </div>
                {report.affordances.includes("resolve-action") && (
                  <p className="muted" style={{ marginBottom: 0 }}>
                    An action finished in an uncertain state. Inspect it with{" "}
                    <span className="mono">nexus inspect-session {report.sessionId}</span> before resuming.
                  </p>
                )}
              </div>
            )}
          </>
        )}
      </div>
    </section>
  )
}
