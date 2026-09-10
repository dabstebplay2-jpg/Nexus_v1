import path from "node:path"
import { readdir, stat } from "node:fs/promises"
import { guard } from "../../src/tools/workspace"
import { ignoredDirectories, secretPath } from "../../src/workspace/paths"
import { NexusError } from "../../src/shared/errors"
import type { WorkspaceDirectory, WorkspaceFile } from "../shared/protocol"

/** Read-only workbench access uses the same path boundary as agent tools. */
export async function workspaceDirectory(workspace: string, relative = "."): Promise<WorkspaceDirectory> {
  const target = await guard(workspace, relative)
  if (!(await stat(target)).isDirectory()) throw new NexusError("INPUT", "Choose a directory")
  const entries = (await readdir(target, { withFileTypes: true }))
    .filter((entry) => !entry.isSymbolicLink() && !secretPath(entry.name) && !ignoredDirectories.has(entry.name) && (entry.isDirectory() || entry.isFile()))
    .sort((a, b) => Number(b.isDirectory()) - Number(a.isDirectory()) || a.name.localeCompare(b.name))
  return {
    path: path.relative(workspace, target).split(path.sep).join("/") || ".",
    entries: entries.slice(0, 500).map((entry) => ({ name: entry.name, path: path.relative(workspace, path.join(target, entry.name)).split(path.sep).join("/"), kind: entry.isDirectory() ? "directory" : "file" })),
    truncated: entries.length > 500,
  }
}

export async function workspaceFile(workspace: string, relative: string): Promise<WorkspaceFile> {
  const target = await guard(workspace, relative)
  if (!(await stat(target)).isFile()) throw new NexusError("INPUT", "Choose a regular file")
  const file = Bun.file(target)
  if (file.size > 512000) throw new NexusError("FILE_LIMIT", "Preview supports text files up to 500 KB")
  const bytes = await file.bytes()
  if (bytes.includes(0)) throw new NexusError("INPUT", "Binary files cannot be previewed")
  const content = new TextDecoder("utf-8", { fatal: true }).decode(bytes)
  return { path: path.relative(workspace, target).split(path.sep).join("/"), content }
}
