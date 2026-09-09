import type {
  CreateRunRequest,
  DiffResponse,
  HealthResponse,
  ModelsResponse,
  Project,
  ProjectDetail,
  ProjectPatch,
  RunReport,
  RunSummary,
  StreamEvent,
} from "../../shared/protocol"

/** Every call goes to the Nexus API server; the UI holds no agent logic of its own. */
async function request<T>(route: string, method = "GET", payload?: unknown): Promise<T> {
  const response = await fetch(`/api${route}`, {
    method,
    ...(payload === undefined
      ? {}
      : { body: JSON.stringify(payload), headers: { "Content-Type": "application/json" } }),
  })
  const body: unknown = await response.json().catch(() => undefined)
  if (!response.ok) {
    const message = body && typeof body === "object" && "error" in body ? String(body.error) : response.statusText
    throw new Error(message)
  }
  return body as T
}

export const api = {
  health: () => request<HealthResponse>("/health"),
  models: () => request<ModelsResponse>("/models"),
  probe: (baseUrl: string, apiKeyEnv?: string) =>
    request<{ models: string[] }>("/models/probe", "POST", { baseUrl, apiKeyEnv }),
  projects: () => request<Project[]>("/projects"),
  addProject: (path: string) => request<ProjectDetail>("/projects", "POST", { path }),
  project: (id: string) => request<ProjectDetail>(`/projects/${id}`),
  saveProject: (id: string, patch: ProjectPatch) => request<ProjectDetail>(`/projects/${id}`, "PATCH", patch),
  removeProject: (id: string) => request<{ removed: string }>(`/projects/${id}`, "DELETE"),
  runs: () => request<RunSummary[]>("/runs"),
  startRun: (input: CreateRunRequest) => request<RunSummary>("/runs", "POST", input),
  run: (id: string) => request<RunSummary>(`/runs/${id}`),
  report: (id: string) => request<RunReport>(`/runs/${id}/report`),
  diff: (id: string) => request<DiffResponse>(`/runs/${id}/diff`),
  prompt: (id: string, text: string, delivery: "STEER" | "QUEUE") =>
    request<unknown>(`/runs/${id}/prompt`, "POST", { text, delivery }),
  permission: (id: string, requestId: string, approved: boolean) =>
    request<RunSummary>(`/runs/${id}/permission`, "POST", { requestId, approved }),
  cancel: (id: string) => request<RunSummary>(`/runs/${id}/cancel`, "POST"),
  resume: (id: string) => request<RunSummary>(`/runs/${id}/resume`, "POST"),
  assertGoal: (id: string, note: string) => request<RunReport>(`/runs/${id}/assert-goal`, "POST", { note }),
  trustChecks: (id: string, note: string) => request<RunReport>(`/runs/${id}/trust-checks`, "POST", { note }),
}

/** Replay from a cursor, then live. The server closes the stream when the run finishes. */
export function subscribe(
  runId: string,
  cursor: number,
  onEvent: (event: StreamEvent) => void,
  onClose: (finished: boolean) => void,
) {
  const source = new EventSource(`/api/runs/${runId}/events?cursor=${cursor}`)
  const state = { closed: false }
  const shut = (finished: boolean) => {
    if (state.closed) return
    state.closed = true
    source.close()
    onClose(finished)
  }
  source.onmessage = (message: MessageEvent<string>) => {
    const event = JSON.parse(message.data) as StreamEvent
    onEvent(event)
    if (event.type === "run_finished") shut(true)
  }
  source.onerror = () => shut(false)
  return () => shut(false)
}
