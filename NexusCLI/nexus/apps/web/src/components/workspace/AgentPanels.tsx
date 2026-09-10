import { useState } from "react"
import type { RunReport, RunSummary, StreamEvent } from "../../../../shared/protocol"

export function TimelinePanel({ events, logs = false }: { events: StreamEvent[]; logs?: boolean }) {
  const [filter, setFilter] = useState("")
  const visible = events.filter((event) => logs || ["state", "tool", "supervisor", "loop_guard", "permission_request", "completion", "run_finished", "error"].includes(event.type))
    .filter((event) => `${event.type} ${JSON.stringify(event.data)}`.toLowerCase().includes(filter.toLowerCase()))
  return <section className="pane"><header>{logs ? "Logs" : "Agent Timeline"}<span className="spacer" />{events.length} events</header>
    <div className="workspace-filebar"><input aria-label={logs ? "Filter logs" : "Filter timeline"} placeholder="Filter events…" value={filter} onChange={(event) => setFilter(event.target.value)} /></div>
    <div className="body">{visible.length === 0 && <p className="muted">No matching events. Events appear as the agent works.</p>}
      {visible.slice(-500).map((event) => <div key={event.cursor} className="workspace-event"><time>{new Date(event.timestamp).toLocaleTimeString()}</time><strong>{event.type}</strong><pre>{JSON.stringify(event.data, null, 2)}</pre></div>)}
      {visible.length > 500 && <p className="muted">Showing the latest 500 matching events.</p>}
    </div></section>
}

export function TerminalPanel({ events }: { events: StreamEvent[] }) {
  const output = events.filter((event) => {
    if (event.type !== "tool" || !event.data || typeof event.data !== "object") return false
    return "name" in event.data && ["bash", "verify"].includes(String(event.data.name))
  })
  return <section className="pane workspace-terminal"><header>Terminal<span className="spacer" /><span>Agent output</span></header><div className="body">
    <p className="muted">Command output from this run. Commands and approvals are managed by the agent.</p>
    {output.length === 0 && <p className="mono muted">Waiting for command output…</p>}
    {output.map((event) => <pre key={event.cursor}>{JSON.stringify(event.data, null, 2)}</pre>)}
  </div></section>
}

export function PermissionsPanel(props: { run?: RunSummary; onPermission: (requestId: string, approved: boolean) => void; busy: boolean }) {
  const pending = props.run?.pendingPermission
  return <section className="pane"><header>Permissions</header><div className="body">
    {!pending ? <p className="muted">No approval is waiting.</p> : <div className="bubble alert">
      <div className="who">Approval required · {pending.tool}</div><p>{pending.reason}</p>
      <div className="mono">{pending.capabilities.join(", ")}</div><pre className="mono">{JSON.stringify(pending.arguments, null, 2)}</pre>
      <div className="row"><button className="primary" disabled={props.busy} onClick={() => props.onPermission(pending.requestId, true)}>Allow operation</button><button disabled={props.busy} onClick={() => props.onPermission(pending.requestId, false)}>Deny operation</button></div>
    </div>}
  </div></section>
}

export function AgentStatePanel({ run, report }: { run?: RunSummary; report?: RunReport }) {
  return <section className="pane"><header>Agent State</header><div className="body">
    {!run ? <p className="muted">No task selected.</p> : <>
      <div className="section"><h3>{run.status}</h3><p>{run.goal}</p><div className="mono">{run.model} · {run.mode}</div></div>
      {report && <><div className="section"><h3>Progress</h3><p>{report.turns} turns · {report.toolCount} tool calls</p></div>
      <div className="section"><h3>Completion decision</h3><p>{report.decision?.reason ?? "No completion decision yet."}</p></div></>}
      {run.pendingPermission && <p className="tag unknown">Waiting for approval</p>}
    </>}
  </div></section>
}
