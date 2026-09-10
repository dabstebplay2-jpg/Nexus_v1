import { lstat } from "node:fs/promises"

/** Everything the index can learn about a file without reading a single byte of its contents. */
export type FileMetadata = { size: number; mtimeMs: number; ctimeMs: number; ino: number; dev: number }
export type CacheEntry = { metadata: FileMetadata; hash: string }

export async function probe(file: string): Promise<FileMetadata | undefined> {
  const info = await lstat(file).catch(() => undefined)
  if (!info?.isFile()) return undefined
  return {
    size: info.size,
    mtimeMs: info.mtimeMs,
    ctimeMs: info.ctimeMs,
    ino: Number(info.ino),
    dev: Number(info.dev),
  }
}

/**
 * A cached content hash is reused only when *every* observed attribute is identical.
 *
 * `mtime` on its own is forgeable: `touch -r other file` copies another file's timestamp, which
 * would let an agent mutate source and hide it from a metadata-only index. That matters here
 * because the fingerprint authorizes COMPLETE. Two further fields close the gap:
 *
 *   - `ctimeMs` moves on any write or metadata change and cannot be set by an unprivileged
 *     process on Linux/macOS.
 *   - `ino` changes whenever a file is replaced by rename, which is exactly how `atomicWrite`
 *     and most editors write.
 *
 * Where a platform reports a field as 0 the key is merely no stricter — never falsely permissive.
 * Trust anchors bypass this cache entirely (see WorkspaceIndex `anchors`), so the proof chain
 * never depends on filesystem metadata.
 */
export function sameFile(a: FileMetadata, b: FileMetadata) {
  return a.size === b.size && a.mtimeMs === b.mtimeMs && a.ctimeMs === b.ctimeMs && a.ino === b.ino && a.dev === b.dev
}

export class FileHashCache {
  private readonly entries = new Map<string, CacheEntry>()
  /** Content reads actually performed. Regression tests assert this stays O(changed), not O(files). */
  reads = 0
  hits = 0
  async resolve(key: string, metadata: FileMetadata, read: () => Promise<string>, force = false) {
    const cached = this.entries.get(key)
    if (!force && cached && sameFile(cached.metadata, metadata)) {
      this.hits++
      return cached.hash
    }
    this.reads++
    const hash = await read()
    this.entries.set(key, { metadata, hash })
    return hash
  }
  invalidate(key: string) {
    this.entries.delete(key)
  }
  /** Drop entries for paths that no longer exist, so a long session does not grow without bound. */
  retain(keys: ReadonlySet<string>) {
    for (const key of [...this.entries.keys()]) if (!keys.has(key)) this.entries.delete(key)
  }
  get tracked() {
    return this.entries.size
  }
  counters() {
    return { reads: this.reads, hits: this.hits, tracked: this.entries.size }
  }
  resetCounters() {
    this.reads = 0
    this.hits = 0
  }
  clear() {
    this.entries.clear()
    this.resetCounters()
  }
}
