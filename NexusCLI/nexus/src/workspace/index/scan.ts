import path from "node:path"
import { readdir } from "node:fs/promises"
import { NexusError } from "../../shared/errors"
import { ignoredDirectories, secretPath } from "../paths"
import { probe, type FileMetadata } from "./cache"

export type ScannedFile = { path: string; metadata: FileMetadata }
export type Scan = { files: ScannedFile[]; directories: number }

/**
 * A 50k-file repository is the target, so the old 20k ceiling is raised rather than removed:
 * an unbounded walk is how an agent accidentally indexes a home directory.
 */
export const maximumFiles = 200000
/** Bounded fan-out: a 50k-file repository must not open 50k descriptors at once. */
export const concurrency = 64

/** Ordered, bounded-parallel map. Preserves input order so traversal order stays observable. */
export async function mapLimited<T, R>(items: readonly T[], limit: number, task: (item: T) => Promise<R>) {
  const results = new Array<R>(items.length)
  const cursor = { next: 0 }
  const worker = async () => {
    while (cursor.next < items.length) {
      const index = cursor.next++
      results[index] = await task(items[index]!)
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker))
  return results
}

/** Directory traversal only. Cheap, and there are orders of magnitude fewer directories than files. */
export async function walkPaths(workspace: string, maximum = maximumFiles) {
  const found: string[] = []
  const state = { directories: 0 }
  async function visit(directory: string) {
    state.directories++
    const entries = await readdir(path.join(workspace, directory), { withFileTypes: true })
    for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name))) {
      if (entry.isSymbolicLink() || ignoredDirectories.has(entry.name) || secretPath(entry.name)) continue
      const relative = path.join(directory, entry.name)
      if (entry.isDirectory()) {
        await visit(relative)
        continue
      }
      if (!entry.isFile()) continue
      found.push(relative)
      if (found.length > maximum)
        throw new NexusError("PROJECT_LIMIT", `Project exceeds ${maximum} files; select a smaller project root`)
    }
  }
  await visit("")
  return { paths: found, directories: state.directories }
}

/**
 * Bounded walk that collects file metadata.
 *
 * Ordering is identical to the walk this replaces (entries sorted by name, subdirectories recursed
 * in place) because `files()` order is observable through the list/glob/search tools. Metadata is
 * gathered in a second, parallel pass: at 10k+ files a serialized `lstat` per entry costs more
 * than the content hashing the index exists to avoid.
 */
export async function scan(workspace: string, maximum = maximumFiles): Promise<Scan> {
  const walked = await walkPaths(workspace, maximum)
  const probed = await mapLimited(walked.paths, concurrency, async (relative) => {
    const metadata = await probe(path.join(workspace, relative))
    return metadata ? ({ path: relative, metadata } as ScannedFile) : undefined
  })
  return {
    files: probed.filter((entry): entry is ScannedFile => entry !== undefined),
    directories: walked.directories,
  }
}
