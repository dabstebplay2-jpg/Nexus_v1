import path from "node:path"
import { files, guard } from "../tools/workspace"
import { abort } from "../shared/errors"

/** Lightweight lexical candidates followed by import edges; no embedding service or full-source prompt. */
export async function retrieve(workspace: string, query: string, signal: AbortSignal) {
  const terms = query
    .toLowerCase()
    .split(/[^\p{L}\p{N}_]+/u)
    .filter((term) => term.length > 2)
  const candidates = (await files(workspace))
    .map((file) => ({
      file,
      score: terms.reduce((score, term) => score + (file.toLowerCase().includes(term) ? 2 : 0), 0),
    }))
    .filter((item) => item.score > 0)
    .sort((a, b) => b.score - a.score || a.file.localeCompare(b.file))
    .slice(0, 12)
  return Promise.all(
    candidates.map(async (candidate) => {
      abort(signal)
      const file = await guard(workspace, candidate.file)
      if (Bun.file(file).size > 256000) return { ...candidate, imports: [] }
      const source = await Bun.file(file).text()
      const imports = [...source.matchAll(/(?:from\s+|import\s*\(|require\s*\()["']([^"']+)["']/g)]
        .map((match) => match[1]!)
        .slice(0, 25)
      return {
        ...candidate,
        imports: imports.map((specifier) => ({
          specifier,
          relativeCandidate: specifier.startsWith(".")
            ? path.normalize(path.join(path.dirname(candidate.file), specifier))
            : undefined,
        })),
      }
    }),
  )
}
