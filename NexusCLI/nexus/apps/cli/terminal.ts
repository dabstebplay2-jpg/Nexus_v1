import { createInterface } from "node:readline"
import type { Event, NexusAPI } from "../../src/api"
import type { PermissionReply } from "../../src/domain/ports"
import { safeJson, bound } from "../../src/shared/redact"

export function render(event: Event, debug: boolean) {
  if (debug) {
    console.log(safeJson(event))
    return
  }
  if (["state", "tool", "completion", "error", "loop_guard", "permission", "created"].includes(event.type))
    console.log(`[${event.type}] ${bound(safeJson(event.data), 1800).text}`)
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
