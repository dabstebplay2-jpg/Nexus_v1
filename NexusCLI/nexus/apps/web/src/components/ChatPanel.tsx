import { useEffect, useRef, useState } from "react"
import type { ProjectPatch, ProjectSettings, RunReport, RunSummary, StreamEvent } from "../../../shared/protocol"
import { StatusTag } from "./ProjectsPanel"

const field = (data: unknown, key: string) => {
  if (!data || typeof data !== "object" || !(key in data)) return ""
  const value = (data as Record<string, unknown>)[key]
  return value === undefined || value === null ? "" : String(value)
}

/** Progress a human can follow, from the same events the CLI prints. */
function describe(event: StreamEvent): string | undefined {
  const data = event.data
  if (event.type === "created")
    return `Nexus · ${field(data, "project")} · ${field(data, "model")} · branch ${field(data, "branch")}`
  if (event.type === "state") {
    const reason = field(data, "reason")
    return `→ ${field(data, "next")}${reason ? ` — ${reason}` : ""}`
  }
  if (event.type === "tool") return `  · ${field(data, "name")} → ${field(data, "status")}`
  if (event.type === "loop_guard") return `  ! guard ${field(data, "action")} — ${field(data, "reason")}`
  if (event.type === "completion") return `  = ${field(data, "outcome")} — ${field(data, "reason")}`
  if (event.type === "error") return `  ✗ ${field(data, "code")}: ${field(data, "message")}`
  if (event.type === "recovery") return `  ↺ ${field(data, "reason") || field(data, "outcome")}`
  if (event.type === "trust_checks") return `  ↺ checks re-reviewed — ${field(data, "note")}`
  if (event.type === "permission_request") return `  ? approval required: ${field(data, "tool")}`
  if (event.type === "permission_resolved") return `  ? ${field(data, "approved") === "true" ? "approved" : "declined"}`
  if (event.type === "run_resumed") return `→ resumed`
  if (event.type === "run_finished") return `■ finished — ${field(data, "status")}`
  return undefined
}

/** The result block: counted from the report, so it can never overstate what was proved. */
function ResultBlock(props: { report: RunReport }) {
  const report = props.report
  const passed = report.verification.filter((check) => check.verdict === "pass").length
  return (
    <div className={`bubble${report.status === "COMPLETED" ? "" : " alert"}`}>
      <div className="who">
        Result <StatusTag status={report.status} />
      </div>
      <div className="mono">
        {`✓ Files changed: ${report.changes.files.length}\n`}
        {`✓ Checks: ${passed}/${report.verification.length} passed\n`}
        {report.verification.map((check) => `    - ${check.checkId} ${check.verdict.toUpperCase()}\n`).join("")}
        {`✓ Evidence: ${report.evidence.filter((item) => item.met).length}/${report.evidence.length} required criteria proved\n`}
        {report.decision ? `\n${report.decision.reason}` : ""}
      </div>
      {report.status !== "COMPLETED" && (
        <p className="muted" style={{ margin: "8px 0 0" }}>
          Nexus does not claim this task is done. See the Execution view for what is missing.
        </p>
      )}
    </div>
  )
}

export function ChatPanel(props: {
  projectName?: string
  settings?: ProjectSettings
  run?: RunSummary
  events: StreamEvent[]
  report?: RunReport
  disabled: boolean
  onStart: (goal: string) => void
  onPrompt: (text: string, delivery: "STEER" | "QUEUE") => void
  onPermission: (requestId: string, approved: boolean) => void
  onCancel: () => void
  onSaveSettings: (patch: ProjectPatch) => void
}) {
  const [text, setText] = useState("")
  const [goalCommand, setGoalCommand] = useState(props.settings?.goalCommand?.join(" ") ?? "")
  const tail = useRef<HTMLDivElement>(null)
  const running = Boolean(props.run?.running)
  useEffect(() => {
    tail.current?.scrollIntoView({ block: "end" })
  }, [props.events.length, props.report])
  useEffect(() => {
    setGoalCommand(props.settings?.goalCommand?.join(" ") ?? "")
  }, [props.settings?.goalCommand])

  const send = () => {
    if (!text.trim()) return
    if (running) props.onPrompt(text.trim(), "STEER")
    else props.onStart(text.trim())
    setText("")
  }
  const lines = props.events.map((event) => ({ cursor: event.cursor, text: describe(event) }))
  return (
    <section className="pane">
      <header>
        Chat
        <span className="spacer" />
        {props.projectName && <span className="muted">{props.projectName}</span>}
        {props.run && <StatusTag status={props.run.status} />}
      </header>
      <div className="body">
        {!props.run && (
          <p className="muted">
            {props.projectName
              ? "Describe a task. Nexus will plan, act, run the project's checks and then show you the evidence."
              : "Select or add a project first."}
          </p>
        )}
        {props.run && (
          <div className="bubble user">
            <div className="who">You</div>
            <div className="mono">{props.run.goal}</div>
          </div>
        )}
        {lines.length > 0 && (
          <div className="bubble">
            <div className="who">Nexus</div>
            <div className="log">{lines.map((line) => line.text && <div key={line.cursor}>{line.text}</div>)}</div>
          </div>
        )}
        {props.run?.pendingPermission && (
          <div className="bubble alert">
            <div className="who">Approval required</div>
            <div className="mono">
              {`${props.run.pendingPermission.tool} · ${props.run.pendingPermission.capabilities.join(", ")}\n${props.run.pendingPermission.reason}\n${JSON.stringify(props.run.pendingPermission.arguments)}`}
            </div>
            <div className="row" style={{ marginTop: 8 }}>
              <button
                className="primary"
                onClick={() => props.onPermission(props.run!.pendingPermission!.requestId, true)}
              >
                Allow
              </button>
              <button onClick={() => props.onPermission(props.run!.pendingPermission!.requestId, false)}>Deny</button>
            </div>
          </div>
        )}
        {props.report && !running && <ResultBlock report={props.report} />}
        <div ref={tail} />
      </div>
      <div className="composer">
        <div className="settings">
          <label htmlFor="goal-command">Goal check</label>
          <div className="row">
            <input
              id="goal-command"
              value={goalCommand}
              placeholder="Command that proves the task, e.g. bun test scenario.test.ts"
              disabled={props.disabled || running}
              onChange={(event) => setGoalCommand(event.target.value)}
              onBlur={() => {
                const argv = goalCommand.trim().split(/\s+/).filter(Boolean)
                props.onSaveSettings({ goalCommand: argv.length ? argv : null })
              }}
            />
            <label className="row" style={{ whiteSpace: "nowrap" }}>
              <input
                type="checkbox"
                style={{ width: 14 }}
                checked={props.settings?.allowChecks ?? false}
                disabled={props.disabled || running}
                onChange={(event) => props.onSaveSettings({ allowChecks: event.target.checked })}
              />
              trust checks
            </label>
          </div>
        </div>
        <textarea
          value={text}
          placeholder={running ? "Steer the running agent…" : "Describe the task…"}
          disabled={props.disabled}
          onChange={(event) => setText(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) send()
          }}
        />
        <div className="row">
          <button className="primary" disabled={props.disabled || !text.trim()} onClick={send}>
            {running ? "Steer" : "Send task"}
          </button>
          <button
            disabled={!running || !text.trim()}
            title="Run this after the current task finishes"
            onClick={() => {
              props.onPrompt(text.trim(), "QUEUE")
              setText("")
            }}
          >
            Queue
          </button>
          <span className="spacer" />
          <span className="muted">Ctrl/Cmd + Enter</span>
          <button disabled={!running} onClick={props.onCancel}>
            Cancel
          </button>
        </div>
      </div>
    </section>
  )
}
