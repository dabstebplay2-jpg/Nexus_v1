import { createInterface } from "node:readline"
import type { Event, NexusAPI } from "../../src/api"
import type { PermissionReply } from "../../src/domain/ports"
import { safeJson, bound } from "../../src/shared/redact"

const field = (data: unknown, key: string) =>
  data && typeof data === "object" && key in data ? (data as Record<string, unknown>)[key] : undefined
const text = (data: unknown, key: string) => {
  const value = field(data, key)
  return value === undefined || value === null ? "" : String(value)
}

/** Progress lines a human can follow. Raw event payloads stay behind --debug. */
export function render(event: Event, debug: boolean) {
  if (debug) {
    console.log(safeJson(event))
    return
  }
  const data = event.data
  if (event.type === "created")
    console.log(`Nexus · ${text(data, "project")} · ${text(data, "model")} · branch ${text(data, "branch")}`)
  if (event.type === "state") {
    const reason = text(data, "reason")
    console.log(`→ ${text(data, "next")}${reason ? ` — ${reason}` : ""}`)
  }
  if (event.type === "tool") console.log(`  · ${text(data, "name")} → ${text(data, "status")}`)
  if (event.type === "loop_guard") console.log(`  ! guard ${text(data, "action")} — ${text(data, "reason")}`)
  if (event.type === "completion") console.log(`  = ${text(data, "outcome")} — ${text(data, "reason")}`)
  if (event.type === "error") console.log(`  ✗ ${text(data, "code")}: ${text(data, "message")}`)
  if (event.type === "permission") console.log(`  ? ${bound(safeJson(data), 400).text}`)
}
/** One stdin owner routes approvals and durable steer/queue input without racing readline prompts. */
export function terminal() {
  const lines = createInterface({ input: process.stdin, output: process.stdout })
  const state: {
    goal?: (text: string) => void
    approval?: (approved: boolean) => void
    api?: NexusAPI
    sessionId?: string
  } = {}
  lines.on("line", (text) => {
    if (state.approval) {
      const reply = state.approval
      state.approval = undefined
      reply(text.trim().toLowerCase() === "y")
      return
    }
    if (state.goal) {
      const reply = state.goal
      state.goal = undefined
      reply(text)
      return
    }
    if (!state.api || !state.sessionId || !text.trim()) return
    const queued = text.startsWith("/queue ")
    const prompt = text.replace(/^\/(queue|steer)\s+/, "")
    state.api.prompt(state.sessionId, prompt, queued ? "QUEUE" : "STEER")
    console.log(`[inbox] ${queued ? "QUEUE" : "STEER"} saved`)
  })
  lines.on("close", () => {
    state.approval?.(false)
    state.goal?.("")
  })
  const permission: PermissionReply = async (request, signal) => {
    console.log(
      `\nPermission: ${request.capabilities.join(", ")}\n${request.reason}\n${safeJson(request.arguments)}\nAllow this action? [y/N]`,
    )
    return new Promise<boolean>((resolve) => {
      const cleanup = () => {
        state.approval = undefined
        signal.removeEventListener("abort", cancel)
      }
      const cancel = () => {
        cleanup()
        resolve(false)
      }
      state.approval = (answer) => {
        cleanup()
        resolve(answer)
      }
      signal.addEventListener("abort", cancel, { once: true })
      if (signal.aborted) cancel()
    })
  }
  return {
    permission,
    goal: () =>
      new Promise<string>((resolve) => {
        state.goal = resolve
        process.stdout.write("Nexus › ")
      }),
    attach: (api: NexusAPI, sessionId: string) => {
      state.api = api
      state.sessionId = sessionId
    },
    close: () => lines.close(),
  }
}
