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

/**
 * Nexus v0.2 shell: projects, chat, execution.
 *
 * All state that matters is server state. The UI never derives a verdict; it renders the run
 * report and the event stream the API server produced from the core.
 */
export function App() {
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
  const [error, setError] = useState("")

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
    const state = { live: true }
    const stop = subscribe(
      runId,
      0,
      (event) => {
        if (!state.live) return
        setEvents((current) => [...current, event])
        if (["permission_request", "permission_resolved"].includes(event.type)) void api.run(runId).then(setRun)
      },
      () => {
        if (state.live) void settle(runId)
      },
    )
    return () => {
      state.live = false
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

  return (
    <div className="app">
      <div className="topbar">
        <span className="brand">
          NEXUS<span>v{health?.version ?? "0.2.0"} · evidence before completion</span>
        </span>
        <ModelBar
          models={models}
          settings={detail?.settings}
          disabled={busy || Boolean(run?.running) || !detail}
          onSave={saveSettings}
          onProbe={async () => {
            if (!detail) return []
            const probed = await api.probe(detail.settings.baseUrl, detail.settings.apiKeyEnv)
            return probed.models
          }}
        />
        <span className="spacer" />
        {health && <span className="tag">bun {health.bun}</span>}
      </div>
      {error && <div className="error">{error}</div>}
      <div className="columns">
        <ProjectsPanel
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
        <ChatPanel
          projectName={detail?.name}
          settings={detail?.settings}
          run={run}
          events={events}
          report={report}
          disabled={busy || !detail?.available}
          onStart={start}
          onPrompt={(text, delivery) =>
            void guard(async () => {
              if (runId) await api.prompt(runId, text, delivery)
            })
          }
          onPermission={(requestId, approved) =>
            void guard(async () => {
              if (runId) setRun(await api.permission(runId, requestId, approved))
            })
          }
          onCancel={() =>
            void guard(async () => {
              if (runId) setRun(await api.cancel(runId))
            })
          }
          onSaveSettings={saveSettings}
        />
        <ExecutionView
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
      </div>
    </div>
  )
}
