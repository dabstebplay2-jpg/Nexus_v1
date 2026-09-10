import path from "node:path"
import { mkdir } from "node:fs/promises"
import type { TrustManifest } from "../../domain/types"
import { atomicWrite } from "../../tools/workspace"

/**
 * Human-readable mirror of the pinned manifest.
 *
 * The authoritative copy lives on `session.contract.trustManifest` in the ledger. This file exists
 * so a reviewer can read and diff what Nexus decided to protect. It is written under `.nexus/`,
 * which the workspace guard refuses to let any tool write and which the workspace scan and the
 * Git source listing both skip — so the mirror can never be edited by the agent and can never
 * change the source fingerprint it helps protect.
 */
export const trustDirectory = ".nexus"
export const trustFile = "trust.manifest.json"

export function trustPath(workspace: string) {
  return path.join(workspace, trustDirectory, trustFile)
}
export async function writeManifest(workspace: string, manifest: TrustManifest) {
  await mkdir(path.join(workspace, trustDirectory), { recursive: true })
  await atomicWrite(trustPath(workspace), `${JSON.stringify(manifest, null, 2)}\n`)
}
export async function readManifest(workspace: string): Promise<TrustManifest | undefined> {
  const file = Bun.file(trustPath(workspace))
  return (await file.exists()) ? ((await file.json().catch(() => undefined)) as TrustManifest | undefined) : undefined
}
