import path from "node:path"
import { realpath, stat } from "node:fs/promises"
import { z } from "zod"
import { NexusError } from "../../src/shared/errors"
import type { ProjectSettings } from "./protocol"
import { endpointSchema, keyEnvSchema } from "./models"
import { atomicWrite } from "../../src/tools/workspace"

/**
 * Project registry — the foundation for project memory.
 *
 * Deliberately small. Task history, file changes, checks and evidence already live in the
 * core's SQLite ledger and are read back through NexusAPI, so a second store for them would
 * only be able to disagree with the ledger. What the core genuinely does not know is which
 * directories the user calls projects and how each one should be run, so that is all this
 * file persists.
 */
const settingsSchema = z.object({
  presetId: z.string().min(1),
  baseUrl: endpointSchema,
  model: z.string().min(1),
  apiKeyEnv: keyEnvSchema,
  contextLength: z.number().int().min(4096),
  mode: z.enum(["fast", "balanced", "deep"]),
  allowChecks: z.boolean(),
  goalCommand: z.array(z.string().min(1)).min(1).optional(),
})
const recordSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  path: z.string().min(1),
  createdAt: z.number(),
  settings: settingsSchema,
})
const fileSchema = z.object({ projects: z.array(recordSchema) })

export type ProjectRecord = z.infer<typeof recordSchema>

async function directory(target: string) {
  const resolved = path.resolve(target)
  const info = await stat(resolved).catch(() => undefined)
  if (!info) throw new NexusError("INPUT", `No such directory: ${resolved}`)
  if (!info.isDirectory()) throw new NexusError("INPUT", `Not a directory: ${resolved}`)
  return await realpath(resolved)
}

export class ProjectRegistry {
  /** Serializes read-modify-write cycles so two requests cannot clobber the file. */
  private gate: Promise<unknown> = Promise.resolve()
  constructor(private readonly file: string) {}

  private async read(): Promise<ProjectRecord[]> {
    const handle = Bun.file(this.file)
    if (!(await handle.exists())) return []
    const parsed = fileSchema.safeParse(await handle.json())
    if (!parsed.success) throw new NexusError("CONFIG", `Unreadable project registry: ${this.file}`)
    return parsed.data.projects
  }
  private async write(projects: ProjectRecord[]) {
    await atomicWrite(this.file, JSON.stringify({ projects }, null, 2))
  }
  private mutate<T>(operation: (projects: ProjectRecord[]) => Promise<{ projects: ProjectRecord[]; result: T }>) {
    const next = this.gate.then(async () => {
      const outcome = await operation(await this.read())
      await this.write(outcome.projects)
      return outcome.result
    })
    this.gate = next.catch(() => undefined)
    return next
  }

  list() {
    return this.read()
  }
  async get(id: string) {
    const found = (await this.read()).find((project) => project.id === id)
    if (!found) throw new NexusError("INPUT", `Unknown project: ${id}`)
    return found
  }
  /** True when the registered directory is still there; a moved project stays listed but unusable. */
  async available(project: ProjectRecord) {
    return await stat(project.path)
      .then((info) => info.isDirectory())
      .catch(() => false)
  }
  add(input: { path: string; name?: string }, settings: ProjectSettings) {
    return this.mutate(async (projects) => {
      const resolved = await directory(input.path)
      const existing = projects.find((project) => project.path === resolved)
      if (existing) return { projects, result: existing }
      const record = recordSchema.parse({
        id: crypto.randomUUID(),
        name: input.name?.trim() || path.basename(resolved) || resolved,
        path: resolved,
        createdAt: Date.now(),
        settings,
      })
      return { projects: [...projects, record], result: record }
    })
  }
  update(id: string, patch: Partial<ProjectSettings> & { name?: string }) {
    return this.mutate(async (projects) => {
      const current = projects.find((project) => project.id === id)
      if (!current) throw new NexusError("INPUT", `Unknown project: ${id}`)
      const { name, ...settings } = patch
      const record = recordSchema.parse({
        ...current,
        name: name?.trim() || current.name,
        settings: { ...current.settings, ...settings },
      })
      return { projects: projects.map((project) => (project.id === id ? record : project)), result: record }
    })
  }
  remove(id: string) {
    return this.mutate(async (projects) => {
      if (!projects.some((project) => project.id === id)) throw new NexusError("INPUT", `Unknown project: ${id}`)
      return { projects: projects.filter((project) => project.id !== id), result: true }
    })
  }
}
