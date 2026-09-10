import type { AgentSession, Event, ModelConfig, NexusAPI } from "../../src/api"
import type { PermissionReply } from "../../src/domain/ports"
import { NexusError, errorText } from "../../src/shared/errors"
import { budgetsFor, modelConfigFor } from "../shared/models"
import { buildRunReport } from "../shared/run-report"
import { ProjectRegistry } from "../shared/projects"
import type { CreateRunRequest, PermissionPrompt, RunMode, RunSummary, StreamEvent } from "../shared/protocol"

/**
 * The agent bridge.
 *
 * A run is one core session: the identifiers are the same value on purpose, because a second
 * identifier would only create a mapping that can disagree with the ledger. This class owns
 * three things the core deliberately leaves to its clients — replayable event delivery, an
 * answer to permission requests, and cancellation — and nothing else. Status, decisions and
 * evidence are always read back from NexusAPI.
 */
const bufferLimit = 5000
const goalCheckTimeoutMs = 120000

type Run = {
  id: string
  projectId: string
  goal: string
  workspace: string
  mode: RunMode
  model: string
  startedAt: number
  finishedAt?: number
  error?: string
  running: boolean
  allowChecks: boolean
  emitted: number
  events: StreamEvent[]
  seen: Set<string>
  listeners: Set<(event: StreamEvent) => void>
  pending?: { prompt: PermissionPrompt; settle: (approved: boolean) => void }
  cancellation: AbortController
}

export class RunManager {
  private readonly runs = new Map<string, Run>()
  private connected?: NexusAPI
  constructor(
    private readonly registry: ProjectRegistry,
    private readonly template: ModelConfig,
  ) {}

  /** createNexus needs this manager's sinks, so the API is attached immediately after it exists. */
  attach(api: NexusAPI) {
    this.connected = api
  }
  private get api() {
    if (!this.connected) throw new NexusError("STATE", "Run manager is not attached to a Nexus API")
    return this.connected
  }
  private require(id: string) {
    const run = this.runs.get(id)
    if (!run) throw new NexusError("INPUT", `Unknown run: ${id}`)
    return run
  }
  /**
   * Adopt a session that exists in the ledger but not in this process, so a task from an
   * earlier server run can still be inspected and resumed. Its event history is replayed from
   * the ledger rather than reconstructed.
   */
  async adopt(id: string) {
    if (this.runs.has(id)) return
    const session = this.api.sessions().find((item) => item.id === id)
    if (!session) throw new NexusError("INPUT", `Unknown run: ${id}`)
    const project = (await this.registry.list()).find((item) => item.path === session.workspace)
    this.runs.set(id, {
      id,
      projectId: project?.id ?? "",
      goal: session.goal,
      workspace: session.workspace,
      mode: project?.settings.mode ?? "balanced",
      model: session.model.model,
      startedAt: session.createdAt,
      finishedAt: session.updatedAt,
      running: false,
      allowChecks: project?.settings.allowChecks ?? false,
      emitted: 0,
      events: [],
      seen: new Set<string>(),
      listeners: new Set<(event: StreamEvent) => void>(),
      cancellation: new AbortController(),
    })
    this.api.inspect(id).events.forEach(this.ingest)
  }
  private session(id: string): AgentSession {
    const found = this.api.sessions().find((session) => session.id === id)
    if (!found) throw new NexusError("INPUT", `Unknown session: ${id}`)
    return found
  }
  private deliver(run: Run, event: StreamEvent) {
    run.events.push(event)
    if (run.events.length > bufferLimit) run.events.splice(0, run.events.length - bufferLimit)
    run.listeners.forEach((listener) => listener(event))
  }
  /** Server-level events the core does not model, such as the run finishing. Clearly named as such. */
  private announce(run: Run, type: string, data: unknown) {
    this.deliver(run, { cursor: ++run.emitted, id: crypto.randomUUID(), type, timestamp: Date.now(), data })
  }

  /** Wired into createNexus({ onEvent }). Events carry the session id, so they route themselves. */
  readonly ingest = (event: Event) => {
    const run = this.runs.get(event.sessionId)
    if (!run || run.seen.has(event.id)) return
    run.seen.add(event.id)
    this.deliver(run, {
      cursor: ++run.emitted,
      id: event.id,
      type: event.type,
      timestamp: event.timestamp,
      data: event.data,
    })
  }

  /**
   * Wired into createNexus({ permission }). Pre-approving trusted project checks is the exact
   * equivalent of the CLI's --allow-checks flag: verification asks for RUN_TESTS and nothing else.
   * Every other capability reaches a human.
   */
  readonly permission: PermissionReply = (request, signal) => {
    const run = this.runs.get(request.sessionId)
    if (!run) return Promise.resolve(false)
    if (run.allowChecks && request.capabilities.every((capability) => capability === "RUN_TESTS"))
      return Promise.resolve(true)
    const prompt: PermissionPrompt = {
      requestId: request.actionId,
      tool: request.tool,
      capabilities: request.capabilities,
      reason: request.reason,
      arguments: request.arguments,
    }
    return new Promise<boolean>((resolve) => {
      const settle = (approved: boolean) => {
        if (run.pending?.prompt.requestId !== prompt.requestId) return
        run.pending = undefined
        signal.removeEventListener("abort", decline)
        this.announce(run, "permission_resolved", { requestId: prompt.requestId, approved })
        resolve(approved)
      }
      const decline = () => settle(false)
      run.pending = { prompt, settle }
      signal.addEventListener("abort", decline, { once: true })
      this.announce(run, "permission_request", prompt)
      if (signal.aborted) decline()
    })
  }

  async start(input: CreateRunRequest): Promise<RunSummary> {
    const project = await this.registry.get(input.projectId)
    if (!input.goal.trim()) throw new NexusError("INPUT", "A goal is required")
    if (!(await this.registry.available(project)))
      throw new NexusError("INPUT", `Project directory is missing: ${project.path}`)
    // The core holds a workspace lock per session, so a second concurrent run would fail there.
    const busy = [...this.runs.values()].find((run) => run.projectId === project.id && run.running)
    if (busy) throw new NexusError("CONFLICT", `This project already has a run in progress: ${busy.id}`)
    const mode = input.mode ?? project.settings.mode
    const settings = { ...project.settings, ...(input.model?.trim() ? { model: input.model.trim() } : {}) }
    const session = await this.api.create({
      workspace: project.path,
      goal: input.goal,
      model: modelConfigFor(settings, this.template),
      mode: input.answerOnly ? "answer" : "coding",
      budgets: budgetsFor(mode),
      goalCheck: settings.goalCommand
        ? {
            id: "goal",
            description: "Original user scenario",
            kind: "GOAL_ASSERTION",
            argv: settings.goalCommand,
            timeoutMs: goalCheckTimeoutMs,
          }
        : undefined,
    })
    const run: Run = {
      id: session.id,
      projectId: project.id,
      goal: session.goal,
      workspace: session.workspace,
      mode,
      model: session.model.model,
      startedAt: Date.now(),
      running: true,
      allowChecks: project.settings.allowChecks,
      emitted: 0,
      events: [],
      seen: new Set<string>(),
      listeners: new Set<(event: StreamEvent) => void>(),
      cancellation: new AbortController(),
    }
    this.runs.set(run.id, run)
    // create() publishes before the run is registered, so the opening events come from the ledger.
    this.api.inspect(run.id).events.forEach(this.ingest)
    void this.execute(run)
    return this.summary(run.id)
  }

  private async execute(run: Run) {
    try {
      await this.api.run(run.id, run.cancellation.signal)
    } catch (error) {
      run.error = errorText(error)
    } finally {
      run.running = false
      run.finishedAt = Date.now()
      run.pending?.settle(false)
      // One terminal event, so a client knows the stream is complete rather than merely quiet.
      const status = this.runs.has(run.id) ? this.session(run.id).status : "UNKNOWN"
      this.announce(run, "run_finished", { status, error: run.error })
    }
  }

  summary(id: string): RunSummary {
    const run = this.require(id)
    const session = this.session(id)
    return {
      id: run.id,
      projectId: run.projectId,
      sessionId: run.id,
      goal: run.goal,
      workspace: run.workspace,
      status: session.status,
      mode: run.mode,
      model: run.model,
      startedAt: run.startedAt,
      finishedAt: run.finishedAt,
      error: run.error,
      running: run.running,
      pendingPermission: run.pending?.prompt,
    }
  }
  list(): RunSummary[] {
    return [...this.runs.keys()].map((id) => this.summary(id)).sort((left, right) => right.startedAt - left.startedAt)
  }
  activeFor(projectId: string) {
    return [...this.runs.values()].find((run) => run.projectId === projectId && run.running)?.id
  }
  report(id: string) {
    this.require(id)
    return buildRunReport(this.api, id, this.session(id))
  }
  diff(id: string) {
    this.require(id)
    return this.api.diff(id)
  }
  rollback(id: string, actionId: string, note: string, signal?: AbortSignal) {
    const run = this.require(id)
    if (run.running) throw new NexusError("CONFLICT", "Wait for the active run to stop before rollback")
    return this.api.rollback(id, actionId, note, signal)
  }
  /** Replay from a cursor, then live delivery. Reconnecting a stream never loses an event. */
  subscribe(id: string, cursor: number, listener: (event: StreamEvent) => void) {
    const run = this.require(id)
    const replay = run.events.filter((event) => event.cursor > cursor)
    run.listeners.add(listener)
    return { replay, running: run.running, unsubscribe: () => run.listeners.delete(listener) }
  }
  prompt(id: string, text: string, delivery: "STEER" | "QUEUE") {
    this.require(id)
    if (!text.trim()) throw new NexusError("INPUT", "Message text is required")
    return this.api.prompt(id, text, delivery)
  }
  answerPermission(id: string, requestId: string, approved: boolean) {
    const run = this.require(id)
    if (run.pending?.prompt.requestId !== requestId)
      throw new NexusError("INPUT", "That permission request is no longer pending")
    run.pending.settle(approved)
  }
  /**
   * Resume the same session after the user supplied what was missing. Only the completion
   * policy can promote it; this just runs the loop again over the corrected ledger.
   */
  resume(id: string) {
    const run = this.require(id)
    if (run.running) throw new NexusError("CONFLICT", `Run already in progress: ${id}`)
    const busy = [...this.runs.values()].find((other) => other.projectId === run.projectId && other.running)
    if (busy) throw new NexusError("CONFLICT", `This project already has a run in progress: ${busy.id}`)
    run.running = true
    run.finishedAt = undefined
    run.error = undefined
    run.cancellation = new AbortController()
    this.announce(run, "run_resumed", { runId: run.id })
    void this.execute(run)
    return this.summary(id)
  }
  cancel(id: string) {
    const run = this.require(id)
    run.cancellation.abort()
  }
  /** Recovery affordances, forwarded unchanged: without them UNKNOWN would be a dead end in the UI. */
  assertGoal(id: string, note: string) {
    this.require(id)
    return this.api.assertGoal(id, note)
  }
  trustChecks(id: string, note: string) {
    this.require(id)
    return this.api.trustChecks(id, note)
  }
  resolveAction(id: string, actionId: string, outcome: "VERIFIED" | "FAILED", note: string) {
    this.require(id)
    this.api.resolveAction(id, actionId, outcome, note)
  }
}
