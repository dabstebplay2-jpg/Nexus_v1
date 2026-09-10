export class NexusError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly retryable = false,
  ) {
    super(message)
    this.name = "NexusError"
  }
}
export function errorText(error: unknown) {
  return error instanceof Error ? error.message : String(error)
}
export function isContextOverflow(error: unknown) {
  if (error instanceof NexusError && error.code === "CONTEXT_OVERFLOW") return true
  return /context[_\s-]*(?:length|window|size|limit).{0,80}(?:exceed|limit|long|small)|(?:exceed|too long|maximum).{0,100}(?:context|tokens)|\d+\s+tokens\s+exceeds?/i.test(errorText(error))
}
export function abort(signal: AbortSignal) {
  if (signal.aborted) throw new NexusError("ABORTED", "Execution interrupted")
}
export async function cancellable<T>(task: Promise<T>, signal: AbortSignal): Promise<T> {
  abort(signal)
  const state: { listener?: () => void } = {}
  const cancelled = new Promise<never>((_, reject) => {
    state.listener = () => reject(new NexusError("ABORTED", "Operation cancelled or timed out"))
    signal.addEventListener("abort", state.listener, { once: true })
  })
  return Promise.race([task, cancelled]).finally(() => {
    if (state.listener) signal.removeEventListener("abort", state.listener)
  })
}
/** Keep the timer referenced even when an adapter is stalled without active I/O. */
export function createDeadline(parent: AbortSignal, milliseconds: number) {
  const controller = new AbortController()
  const timer = setTimeout(
    () => controller.abort(new NexusError("TIMEOUT", "Deadline exceeded")),
    Math.max(1, milliseconds),
  )
  return { signal: AbortSignal.any([parent, controller.signal]), close: () => clearTimeout(timer) }
}
