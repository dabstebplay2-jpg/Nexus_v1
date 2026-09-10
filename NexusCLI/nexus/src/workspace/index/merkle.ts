/**
 * Directory-level Merkle tree over workspace content hashes.
 *
 * The point is invalidation, not identity. Changing one file marks only its ancestor chain dirty,
 * so `root()` recomputes `O(changed x depth)` directory hashes instead of rehashing the project.
 * `directoryHash` then answers "did anything under src/ move?" without touching any file.
 *
 * The tree deliberately does NOT define the completion fingerprint. Evidence rows written by
 * earlier versions store `inventoryFingerprint` values and CompletionPolicy compares them by
 * equality, so that algorithm stays byte-identical and the Merkle root is additive metadata.
 */
type Directory = { files: Map<string, string>; children: Set<string>; hash?: string }

const parentOf = (target: string) => {
  const cut = target.lastIndexOf("/")
  return cut === -1 ? "" : target.slice(0, cut)
}
const nameOf = (target: string) => target.slice(target.lastIndexOf("/") + 1)

export class MerkleTree {
  private readonly directories = new Map<string, Directory>([["", { files: new Map(), children: new Set() }]])
  private readonly dirty = new Set<string>([""])
  /** Directory hashes recomputed by the most recent root(). Bounded by changed paths x depth. */
  recomputed = 0
  set(file: string, hash: string) {
    const directory = this.ensure(parentOf(file))
    if (directory.files.get(nameOf(file)) === hash) return
    directory.files.set(nameOf(file), hash)
    this.markDirty(parentOf(file))
  }
  delete(file: string) {
    const directory = this.directories.get(parentOf(file))
    if (!directory?.files.delete(nameOf(file))) return
    this.markDirty(parentOf(file))
    this.prune(parentOf(file))
  }
  /** Recompute only dirty directories, deepest first, so every child is settled before its parent. */
  root() {
    this.recomputed = 0
    const pending = [...this.dirty].sort((a, b) => depth(b) - depth(a))
    for (const target of pending) {
      const directory = this.directories.get(target)
      if (!directory) continue
      const hasher = new Bun.CryptoHasher("sha256")
      for (const name of [...directory.files.keys()].sort()) hasher.update(`f:${name}:${directory.files.get(name)!}\n`)
      for (const name of [...directory.children].sort())
        hasher.update(`d:${name}:${this.directories.get(join(target, name))?.hash ?? ""}\n`)
      directory.hash = hasher.digest("hex")
      this.recomputed++
    }
    this.dirty.clear()
    return this.directories.get("")!.hash ?? ""
  }
  directoryHash(directory: string) {
    return this.directories.get(directory === "." ? "" : directory)?.hash
  }
  get size() {
    return this.directories.size
  }
  clear() {
    this.directories.clear()
    this.directories.set("", { files: new Map(), children: new Set() })
    this.dirty.clear()
    this.dirty.add("")
    this.recomputed = 0
  }
  private ensure(target: string): Directory {
    const existing = this.directories.get(target)
    if (existing) return existing
    const created: Directory = { files: new Map(), children: new Set() }
    this.directories.set(target, created)
    this.ensure(parentOf(target)).children.add(nameOf(target))
    this.markDirty(parentOf(target))
    return created
  }
  private markDirty(target: string) {
    let current = target
    while (true) {
      if (this.dirty.has(current)) break
      this.dirty.add(current)
      const directory = this.directories.get(current)
      if (directory) directory.hash = undefined
      if (current === "") break
      current = parentOf(current)
    }
  }
  private prune(target: string) {
    let current = target
    while (current !== "") {
      const directory = this.directories.get(current)
      if (!directory || directory.files.size || directory.children.size) return
      this.directories.delete(current)
      const parent = this.directories.get(parentOf(current))
      parent?.children.delete(nameOf(current))
      this.markDirty(parentOf(current))
      current = parentOf(current)
    }
  }
}
function depth(target: string) {
  return target === "" ? 0 : target.split("/").length
}
function join(directory: string, name: string) {
  return directory === "" ? name : `${directory}/${name}`
}
