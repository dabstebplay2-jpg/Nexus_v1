import { z } from "zod"
import type { Evidence, PlanStep } from "../domain/types"
import { NexusError } from "../shared/errors"

export const planSchema = z
  .array(
    z.object({
      id: z.string().min(1).max(80),
      description: z.string().min(1).max(500),
      state: z.enum(["PENDING", "ACTIVE", "DONE", "BLOCKED"]),
      dependencies: z.array(z.string()).max(30),
      evidence: z.array(z.string()).max(100),
      note: z.string().max(1000),
    }),
  )
  .min(1)
  .max(30)
export function revisePlan(raw: unknown, previous: PlanStep[], evidence: Evidence[]): PlanStep[] {
  const steps = planSchema.parse(raw)
  if (new Set(steps.map((step) => step.id)).size !== steps.length) throw new NexusError("PLAN", "Duplicate step IDs")
  const visit = (id: string, trail: string[]): void => {
    if (trail.includes(id)) throw new NexusError("PLAN", "Plan contains a dependency cycle")
    const step = steps.find((item) => item.id === id)
    if (!step) throw new NexusError("PLAN", `Unknown dependency ${id}`)
    step.dependencies.forEach((dependency) => visit(dependency, [...trail, id]))
    if (step.state !== "DONE") return
    if (
      !step.evidence.length ||
      step.evidence.some((key) => !evidence.some((item) => item.id === key && item.verdict === "pass"))
    )
      throw new NexusError("PLAN", "DONE steps require existing passing evidence")
    if (step.dependencies.some((dependency) => steps.find((item) => item.id === dependency)?.state !== "DONE"))
      throw new NexusError("PLAN", "Dependencies must be complete first")
  }
  steps.forEach((step) => visit(step.id, []))
  return steps.map((step) => ({
    ...step,
    attempts: (previous.find((item) => item.id === step.id)?.attempts ?? 0) + (step.state === "ACTIVE" ? 1 : 0),
  }))
}
