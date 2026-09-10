export type ContextMode = "normal" | "prepare" | "compress"

/** Reserve output and account for tokenizer uncertainty before admitting a prompt. */
export function contextBudget(window: number, requestedOutput: number, pressure = 1) {
  const output = Math.max(1, Math.min(requestedOutput, Math.floor(window * 0.2)))
  const limit = Math.floor((window * 0.9 - output) / pressure)
  const target = Math.floor((window * 0.7 - output) / pressure)
  return { window, output, limit, target, pressure }
}

export function contextMode(input: number, budget: ReturnType<typeof contextBudget>): ContextMode {
  const ratio = (input * budget.pressure + budget.output) / budget.window
  return ratio >= 0.9 ? "compress" : ratio >= 0.85 ? "prepare" : "normal"
}
