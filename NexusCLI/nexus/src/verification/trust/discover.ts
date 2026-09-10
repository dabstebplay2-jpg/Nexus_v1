import path from "node:path"
import { z } from "zod"
import type { TrustManifest, TrustPatterns } from "../../domain/types"
import { normalise } from "../../workspace/paths"
import { files, hashFile } from "../../tools/workspace"
import { defaultTrustPatterns, isAnchor, mergePatterns, wellKnownHarnesses } from "./manifest"

const configSchema = z.object({
  patterns: z
    .object({ exclusive: z.array(z.string()).default([]), extensible: z.array(z.string()).default([]) })
    .partial()
    .optional(),
})

/**
 * Read a project's optional `trust.manifest.json` overrides.
 *
 * Read exactly once, at admission, and then pinned into the session contract. It is never
 * consulted again, and the file itself is an exclusive anchor, so an agent cannot widen its own
 * trust boundary mid-session by rewriting it.
 */
export async function trustConfig(workspace: string): Promise<Partial<TrustPatterns> | undefined> {
  const file = Bun.file(path.join(workspace, "trust.manifest.json"))
  if (!(await file.exists())) return undefined
  const parsed = configSchema.safeParse(await file.json().catch(() => undefined))
  return parsed.success ? parsed.data.patterns : undefined
}

/** Files named directly by a trusted check, e.g. `bun scenario.ts` pins `scenario.ts`. */
export function checkRunners(commands: readonly string[][]) {
  return [
    ...new Set(
      commands
        .flat()
        .filter((item) => /\.[cm]?[jt]s$|\.py$|\.sh$|\.ps1$|\.rb$|\.bat$|\.cmd$/.test(item))
        .map((item) => normalise(item)),
    ),
  ]
}

/**
 * Pin every trust anchor that exists right now, plus the files a check names directly.
 *
 * Anchors are always content-hashed, never served from the index metadata cache, so the proof
 * chain does not depend on `mtime` being honest.
 */
export async function discoverManifest(
  workspace: string,
  commands: readonly string[][],
  contractRevision: number,
  overrides?: Partial<TrustPatterns>,
): Promise<TrustManifest> {
  const patterns = mergePatterns(defaultTrustPatterns, overrides)
  const runners = checkRunners(commands)
  const present = (await files(workspace)).map(normalise)
  const anchors = [
    ...new Set([
      ...present.filter((file) => isAnchor(file, patterns)),
      ...runners.filter((file) => present.includes(file)),
    ]),
  ].sort()
  const hashed = await Promise.all(
    anchors.map(async (file) => [file, await hashFile(path.join(workspace, file)).catch(() => undefined)] as const),
  )
  return {
    version: 1,
    generatedAt: new Date().toISOString(),
    contractRevision,
    patterns,
    protected: Object.fromEntries(hashed.filter((entry): entry is [string, string] => typeof entry[1] === "string")),
    absent: wellKnownHarnesses.filter((file) => !present.includes(file)).sort(),
    runners,
  }
}
