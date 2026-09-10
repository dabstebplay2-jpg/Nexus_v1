import path from "node:path"
import type { Contract, TrustManifest, TrustViolation } from "../domain/types"
import { guard, hashFile } from "../tools/workspace"
import { discoverManifest, trustConfig } from "./trust/discover"
import { alteredAnchors, evaluateTrust } from "./trust/guard"
import { writeManifest } from "./trust/file"

/**
 * Trust anchors are the harnesses a verdict depends on.
 *
 * Establishing trust pins them by content hash for one contract revision. Existing test harnesses
 * are anchors; new regression tests may still be added freely, because `extensible` patterns only
 * forbid *changing* what was already there.
 */
export async function establishTrust(
  workspace: string,
  commands: readonly string[][],
  contractRevision: number,
): Promise<TrustManifest> {
  const manifest = await discoverManifest(workspace, commands, contractRevision, await trustConfig(workspace))
  // Best effort: the mirror is for human review, and a read-only workspace must not fail a session.
  await writeManifest(workspace, manifest).catch(() => {})
  return manifest
}

/**
 * Has the trust boundary moved since it was established?
 *
 * Sessions created before Phase 0 have no manifest; they fall back to comparing the pinned hashes
 * recorded on the contract, which is exactly the v0.2.2 behaviour.
 */
export async function trustViolations(workspace: string, contract: Contract): Promise<TrustViolation[]> {
  if (contract.trustManifest) return evaluateTrust(workspace, contract.trustManifest)
  return (await changedAssets(workspace, contract.protectedFiles ?? {})).map((file) => ({
    path: file,
    kind: "modified" as const,
    reason: `Trust anchor ${file} was modified while the session ran`,
  }))
}
export { alteredAnchors, explainTrust } from "./trust/guard"

/** Pinned anchors whose content no longer matches. Retained for pre-Phase-0 contracts. */
export async function changedAssets(workspace: string, assets: Record<string, string>) {
  const changed = await Promise.all(
    Object.entries(assets).map(async ([file, hash]) => {
      const current = await guard(workspace, file)
        .then(hashFile)
        .catch(() => undefined)
      return current === hash ? undefined : file
    }),
  )
  return changed.filter((file): file is string => file !== undefined)
}
/** The pinned anchor hashes for a workspace, as stored on `Contract.protectedFiles`. */
export async function verificationAssets(workspace: string, commands: readonly string[][]) {
  return (await discoverManifest(workspace, commands, 1, await trustConfig(workspace))).protected
}
