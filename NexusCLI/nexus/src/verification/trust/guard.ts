import path from "node:path"
import type { TrustManifest, TrustViolation } from "../../domain/types"
import { normalise } from "../../workspace/paths"
import { files, hashFile } from "../../tools/workspace"
import { isExclusiveAnchor } from "./manifest"

/**
 * Decide whether the trust boundary still holds.
 *
 * v0.2.2 re-hashed only the anchors it had already recorded, which left a hole: a harness file
 * that did not exist at admission was invisible forever. An agent could create `conftest.py`,
 * `pytest.ini` or `.github/workflows/ci.yml`, neutralize the failing assertion, and collect a
 * genuine exit code 0 as proof. `introduced` closes that hole.
 *
 * Anchors are always read from disk here. This is the one place that must never trust a cached
 * hash, because it is what stops a forged COMPLETE.
 */
export async function evaluateTrust(workspace: string, manifest: TrustManifest): Promise<TrustViolation[]> {
  const present = new Set((await files(workspace)).map(normalise))
  const pinned = await Promise.all(
    Object.entries(manifest.protected).map(async ([file, expected]): Promise<TrustViolation | undefined> => {
      if (!present.has(file))
        return { path: file, kind: "deleted", reason: `Trust anchor ${file} was deleted while the session ran` }
      const actual = await hashFile(path.join(workspace, file)).catch(() => undefined)
      return actual === expected
        ? undefined
        : { path: file, kind: "modified", reason: `Trust anchor ${file} was modified while the session ran` }
    }),
  )
  const introduced = [...present]
    .filter((file) => !(file in manifest.protected) && isExclusiveAnchor(file, manifest.patterns))
    .sort()
    .map(
      (file): TrustViolation => ({
        path: file,
        kind: "introduced",
        reason: `${file} is test-harness or build configuration that did not exist when trust was established; a new one can change how checks run`,
      }),
    )
  return [...pinned.filter((item): item is TrustViolation => item !== undefined), ...introduced].sort((left, right) =>
    left.path.localeCompare(right.path),
  )
}

/** Paths whose content moved. Kept as its own list because evidence metadata already exposes it. */
export function alteredAnchors(violations: readonly TrustViolation[]) {
  return violations.filter((item) => item.kind !== "introduced").map((item) => item.path)
}
export function explainTrust(violations: readonly TrustViolation[]) {
  return violations.map((item) => `${item.path} (${item.kind})`).join(", ")
}
