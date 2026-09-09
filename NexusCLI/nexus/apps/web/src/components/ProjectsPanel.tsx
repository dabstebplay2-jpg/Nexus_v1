import { useState } from "react"
import type { Project, ProjectDetail } from "../../../shared/protocol"

/** Projects panel: open a project, see what Nexus detected in it, see its task history. */
export function ProjectsPanel(props: {
  projects: Project[]
  selectedId?: string
  detail?: ProjectDetail
  busyRunId?: string
  onSelect: (id: string) => void
  onAdd: (path: string) => void
  onRemove: (id: string) => void
  onOpenTask: (sessionId: string) => void
}) {
  const [path, setPath] = useState("")
  const submit = () => {
    if (!path.trim()) return
    props.onAdd(path.trim())
    setPath("")
  }
  return (
    <section className="pane">
      <header>
        Projects
        <span className="spacer" />
        <span className="muted">{props.projects.length}</span>
      </header>
      <div className="body">
        <div className="row" style={{ marginBottom: 10 }}>
          <input
            value={path}
            placeholder="Absolute path to a project"
            onChange={(event) => setPath(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") submit()
            }}
          />
          <button onClick={submit} disabled={!path.trim()}>
            Add
          </button>
        </div>
        {props.projects.length === 0 && <p className="muted">No projects yet. Add a directory to open it.</p>}
        {props.projects.map((project) => (
          <div
            key={project.id}
            className={`project${project.id === props.selectedId ? " selected" : ""}`}
            onClick={() => props.onSelect(project.id)}
          >
            <div className="row">
              <span className="name">{project.name}</span>
              <span className="spacer" />
              {!project.available && <span className="tag fail">missing</span>}
              {props.busyRunId && project.id === props.selectedId && <span className="tag busy">running</span>}
            </div>
            <div className="path">{project.path}</div>
          </div>
        ))}

        {props.detail && (
          <div style={{ marginTop: 14 }}>
            <div className="section">
              <h3>Project</h3>
              <div className="mono">
                {props.detail.kind}
                {props.detail.packageManager ? ` · ${props.detail.packageManager}` : ""}
                {props.detail.branch ? ` · ${props.detail.branch}` : ""}
              </div>
              <div style={{ marginTop: 6 }}>
                <button onClick={() => props.onRemove(props.detail!.id)}>Remove from list</button>
              </div>
            </div>
            <div className="section">
              <h3>Detected checks</h3>
              {props.detail.checks.length === 0 ? (
                <p className="muted">None. Nexus cannot prove a code change here until you set a goal command below.</p>
              ) : (
                props.detail.checks.map((check) => (
                  <div key={check.id} className="mono">
                    {check.id} · {check.argv.join(" ")}
                  </div>
                ))
              )}
            </div>
            <div className="section">
              <h3>Task history</h3>
              {props.detail.tasks.length === 0 ? (
                <p className="muted">No tasks yet.</p>
              ) : (
                props.detail.tasks.slice(0, 12).map((task) => (
                  <div key={task.sessionId} className="check">
                    <StatusTag status={task.status} />
                    <button
                      onClick={() => props.onOpenTask(task.sessionId)}
                      style={{ background: "none", border: "none", padding: 0, textAlign: "left" }}
                    >
                      {task.goal}
                    </button>
                  </div>
                ))
              )}
            </div>
          </div>
        )}
      </div>
    </section>
  )
}

export function StatusTag(props: { status: string }) {
  const tone =
    props.status === "COMPLETED"
      ? "pass"
      : props.status === "UNKNOWN"
        ? "unknown"
        : ["FAILED", "ABORTED"].includes(props.status)
          ? "fail"
          : "busy"
  return <span className={`tag ${tone}`}>{props.status}</span>
}
