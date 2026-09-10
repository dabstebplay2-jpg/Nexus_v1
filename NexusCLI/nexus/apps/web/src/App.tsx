import { useCallback, useEffect, useState } from "react"
import type {
  HealthResponse,
  ModelsResponse,
  Project,
  ProjectDetail,
  ProjectPatch,
  RunReport,
  RunSummary,
  StreamEvent,
} from "../../shared/protocol"
import { api, subscribe } from "./api"
import { ChatPanel } from "./components/ChatPanel"
import { ExecutionView } from "./components/ExecutionView"
import { ModelBar } from "./components/ModelBar"
import { ProjectsPanel } from "./components/ProjectsPanel"
import { DockLayout, useWorkspace } from "./components/workspace/DockLayout"
import { AgentStatePanel, PermissionsPanel, TerminalPanel, TimelinePanel } from "./components/workspace/AgentPanels"
import { EditorPanel, FileBrowser, useProjectDocument } from "./components/workspace/FilePanels"

/**
 * Nexus v0.2 shell: projects, chat, execution.
 *
 * Agent and project state come from the server; docking state lives in WorkspaceStore. The UI never derives a verdict; it renders the run
 * report and the event stream the API server produced from the core.
 */
export function App() {
  const workspace = useWorkspace()
  const [health, setHealth] = useState<HealthResponse>()
  const [models, setModels] = useState<ModelsResponse>()
  const [projects, setProjects] = useState<Project[]>([])
  const [projectId, setProjectId] = useState<string>()
  const [detail, setDetail] = useState<ProjectDetail>()
  const [runId, setRunId] = useState<string>()
  const [run, setRun] = useState<RunSummary>()
  const [events, setEvents] = useState<StreamEvent[]>([])
  const [report, setReport] = useState<RunReport>()
  const [epoch, setEpoch] = useState(0)
  const [busy, setBusy] = useState(false)
  const [modelPending, setModelPending] = useState(false)
  const [error, setError] = useState("")
  const file = useProjectDocument(projectId)

  const guard = useCallback(async (work: () => Promise<void>) => {
    setBusy(true)
    setError("")
    try {
      await work()
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : String(failure))
    } finally {
      setBusy(false)
    }
  }, [])

  const loadProjects = useCallback(async () => setProjects(await api.projects()), [])
  const loadDetail = useCallback(async (id: string) => setDetail(await api.project(id)), [])

  useEffect(() => {
    void guard(async () => {
      setHealth(await api.health())
      setModels(await api.models())
      const listed = await api.projects()
      setProjects(listed)
      if (listed[0]) setProjectId(listed[0].id)
    })
  }, [guard])

  useEffect(() => {
    if (!projectId) return
    void guard(async () => setDetail(await api.project(projectId)))
  }, [projectId, guard, epoch])

  /** Opening a project attaches to its running task, or reopens the most recent one. */
  useEffect(() => {
    if (!projectId) return
    const state = { live: true }
    void (async () => {
      const loaded = await api.project(projectId)
      if (!state.live) return
      const next = loaded.activeRunId ?? loaded.tasks[0]?.sessionId
      if (!next) {
        setRunId(undefined)
        setRun(undefined)
        setReport(undefined)
        return
      }
      setRunId(next)
      setEpoch((value) => value + 1)
      setRun(await api.run(next))
      setReport(await api.report(next))
    })()
    return () => {
      state.live = false
    }
  }, [projectId])

  const settle = useCallback(
    async (id: string) => {
      setRun(await api.run(id))
      setReport(await api.report(id))
      if (projectId) await loadDetail(projectId)
    },
    [projectId, loadDetail],
  )

  useEffect(() => {
    if (!runId) return
    setEvents([])
    const state: { live: boolean; timer?: ReturnType<typeof setTimeout> } = { live: true }
    const stop = subscribe(
      runId,
      0,
      (event) => {
        if (!state.live) return
        setEvents((current) => [...current, event])
        if (["permission_request", "permission_resolved"].includes(event.type)) void api.run(runId).then(setRun)
        if (!state.timer && ["state", "tool", "supervisor", "completion"].includes(event.type))
          state.timer = setTimeout(() => {
            state.timer = undefined
            void Promise.all([api.run(runId), api.report(runId)]).then(([summary, currentReport]) => {
              if (state.live) { setRun(summary); setReport(currentReport) }
            }).catch(() => {})
          }, 250)
      },
      () => {
        if (state.live) void settle(runId)
      },
    )
    return () => {
      state.live = false
      clearTimeout(state.timer)
      stop()
    }
  }, [runId, epoch, settle])

  const saveSettings = (patch: ProjectPatch) =>
    void guard(async () => {
      if (!projectId) return
      setDetail(await api.saveProject(projectId, patch))
    })

  const start = (goal: string) =>
    void guard(async () => {
      if (!projectId) return
      setReport(undefined)
      setEvents([])
      const started = await api.startRun({ projectId, goal })
      setRun(started)
      setRunId(started.id)
      setEpoch((value) => value + 1)
    })

  const openTask = (sessionId: string) =>
    void guard(async () => {
      setReport(undefined)
      setRun(await api.run(sessionId))
      setRunId(sessionId)
      setEpoch((value) => value + 1)
      setReport(await api.report(sessionId))
    })

  const recover = (work: () => Promise<RunReport>) => void guard(async () => setReport(await work()))
  const answerPermission = (requestId: string, approved: boolean) => void guard(async () => {
    if (runId) setRun(await api.permission(runId, requestId, approved))
  })
  const openFile = (path: string) => {
    file.open(path)
    workspace.open("editor", workspace.getSnapshot().model.getNodeById("chat")?.getParent()?.getId())
  }

  return (
    <div className="app">
      <div className="topbar">
        <span className="brand">
          NEXUS<span>v{health?.version ?? "0.2.0"} · evidence before completion</span>
        </span>
        <ModelBar
          onPending={setModelPending}
          key={projectId ?? "loading"}
          models={models}
          settings={detail?.id === projectId ? detail?.settings : undefined}
          disabled={busy || Boolean(run?.running) || !detail}
          onSave={async (patch) => {
            if (!projectId) throw new Error("Select a project first")
            const saved = await api.saveProject(projectId, patch)
            setDetail((current) => (current?.id === saved.id ? saved : current))
            return saved.settings
          }}
        />
        <span className="spacer" />
        {run?.pendingPermission && <button className="permission-notice" onClick={() => workspace.open("permissions")}>Approval required</button>}
        {health && <span className="tag">bun {health.bun}</span>}
      </div>
      {error && <div className="error">{error}</div>}
      <DockLayout store={workspace} pendingPermission={Boolean(run?.pendingPermission)} renderPanel={(panel) => {
        if (panel === "timeline") return <TimelinePanel events={events} />
        if (panel === "logs") return <TimelinePanel events={events} logs />
        if (panel === "terminal") return <TerminalPanel events={events} />
        if (panel === "state") return <AgentStatePanel run={run} report={report} />
        if (panel === "permissions") return <PermissionsPanel run={run} busy={busy} onPermission={answerPermission} />
        if (panel === "files" || panel === "explorer") return <FileBrowser key={`${panel}-${projectId}`} projectId={projectId} onOpen={openFile} explorer={panel === "explorer"} />
        if (panel === "editor") return <EditorPanel file={file} />
        if (panel === "projects") return <ProjectsPanel
          projects={projects}
          selectedId={projectId}
          detail={detail}
          busyRunId={run?.running ? run.id : undefined}
          onSelect={setProjectId}
          onAdd={(path) =>
            void guard(async () => {
              const created = await api.addProject(path)
              await loadProjects()
              setProjectId(created.id)
            })
          }
          onRemove={(id) =>
            void guard(async () => {
              await api.removeProject(id)
              setProjectId(undefined)
              setDetail(undefined)
              await loadProjects()
            })
          }
          onOpenTask={openTask}
        />
        if (panel === "chat") return <ChatPanel
          projectName={detail?.name}
          settings={detail?.settings}
          run={run}
          events={events}
          report={report}
          disabled={busy || modelPending || !detail?.available}
          onStart={start}
          onPrompt={(text, delivery) =>
            void guard(async () => {
              if (runId) await api.prompt(runId, text, delivery)
            })
          }
          onPermission={answerPermission}
          onCancel={() =>
            void guard(async () => {
              if (runId) setRun(await api.cancel(runId))
            })
          }
          onSaveSettings={saveSettings}
        />
        return <ExecutionView
          view={panel === "execution" ? undefined : panel}
          report={report}
          busy={busy || Boolean(run?.running)}
          onTrustChecks={(note) => recover(() => api.trustChecks(runId!, note))}
          onAssertGoal={(note) => recover(() => api.assertGoal(runId!, note))}
          onResume={() =>
            void guard(async () => {
              if (!runId) return
              setRun(await api.resume(runId))
              setEpoch((value) => value + 1)
            })
          }
        />
      }} />
    </div>
  )
}
