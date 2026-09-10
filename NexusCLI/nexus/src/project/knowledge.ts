import path from "node:path"
import type { Project } from "../domain/types"
import type { ScannedFile } from "../workspace/index/scan"
import { scan } from "../workspace/index/scan"
import { guard } from "../tools/workspace"
import { safeJson } from "../shared/redact"

/**
 * Project Intelligence (L3). A durable, deterministic map of the project derived from the existing
 * incremental workspace scan. It is never a second filesystem traversal implementation and it never
 * throws into the context build: an unreadable or oversized project degrades to `partial: true`.
 */
export type ProjectCommand = { id: string; argv: string[] }
export type ProjectLanguage = { extension: string; files: number }
export type ProjectKnowledge = {
  generatedAt: number
  stack: string
  packageManager?: string
  fileCount: number
  signature: string
  partial: boolean
  languages: ProjectLanguage[]
  sourceRoots: string[]
  entryPoints: string[]
  testPaths: string[]
  configFiles: string[]
  importantFiles: string[]
  commands: ProjectCommand[]
  dependencies: { runtime: string[]; development: string[] }
  conventions: string[]
}

export const knowledgeTtlMs = 30000
export const knowledgeFileLimit = 50000
const readLimit = 262144
const retainedProjects = 8

type Json = Record<string, unknown>
type CacheEntry = { scannedAt: number; knowledge: ProjectKnowledge }
const cache = new Map<string, CacheEntry>()

const codeExtensions = new Set([
  "ts", "tsx", "js", "jsx", "mjs", "cjs", "py", "rs", "go", "cs", "java", "kt", "rb", "php", "swift", "c", "h",
  "cpp", "hpp", "m", "scala", "sh",
])
const languageNames = new Map([
  ["ts", "typescript"], ["tsx", "typescript"], ["js", "javascript"], ["jsx", "javascript"], ["mjs", "javascript"],
  ["cjs", "javascript"], ["py", "python"], ["rs", "rust"], ["go", "go"], ["cs", "c#"], ["java", "java"],
  ["kt", "kotlin"], ["rb", "ruby"], ["php", "php"], ["swift", "swift"], ["c", "c"], ["h", "c"], ["cpp", "c++"],
  ["hpp", "c++"], ["m", "objective-c"], ["scala", "scala"], ["sh", "shell"],
])
const configNames = new Set([
  "package.json", "tsconfig.json", "bun.lock", "bun.lockb", "pnpm-lock.yaml", "yarn.lock", "package-lock.json",
  "pyproject.toml", "requirements.txt", "uv.lock", "Cargo.toml", "go.mod", "Makefile", "Dockerfile",
  "docker-compose.yml", "vite.config.ts", "vitest.config.ts", "eslint.config.js", ".eslintrc.json",
  ".prettierrc.json", ".editorconfig",
])
const documentNames = new Set(["AGENTS.md", "README.md", "CONTRIBUTING.md"])
const entryCandidates = [
  "src/index.ts", "src/main.ts", "src/api.ts", "src/cli.ts", "index.ts", "main.ts", "main.py", "src/main.py",
  "src/main.rs", "main.go", "src/lib.rs", "app.py", "server.ts", "src/server.ts",
]
const frameworkNames: Array<[string, string]> = [
  ["next", "next.js"], ["react", "react"], ["vue", "vue"], ["svelte", "svelte"], ["vite", "vite"],
  ["express", "express"], ["fastify", "fastify"], ["django", "django"], ["flask", "flask"],
  ["fastapi", "fastapi"], ["axum", "axum"],
]
const testPatterns = [/(^|\/)(tests?|spec|__tests__)(\/|$)/, /\.(test|spec)\.[^/]+$/, /(^|\/)test_[^/]*\.py$/]
const testRoots = new Set(["test", "tests", "spec", "__tests__"])

/** Deterministic, bounded project knowledge. Cached per workspace by scan signature, then by TTL. */
export async function projectKnowledge(workspace: string, project: Project, now = Date.now()): Promise<ProjectKnowledge> {
  const cached = cache.get(workspace)
  if (cached && now - cached.scannedAt < knowledgeTtlMs) return cached.knowledge
  try {
    const scanned = await scan(workspace, knowledgeFileLimit)
    const signature = fingerprint(scanned.files)
    // An unchanged tree reuses the previous map instead of re-reading manifests.
    if (cached && cached.knowledge.signature === signature) return remember(workspace, now, cached.knowledge)
    return remember(workspace, now, await derive(workspace, project, scanned.files, signature, now))
  } catch (error) {
    // Project intelligence is an optimisation. It must never break the context build or the agent loop.
    return remember(workspace, now, degraded(project, now, error))
  }
}

/** A compact L3 projection for the prompt. Deterministic so identical projects produce identical text. */
export function knowledgeSummary(knowledge: ProjectKnowledge, scale = 1) {
  const bounded = Math.min(1, Math.max(0.15, scale))
  const cap = (limit: number) => Math.max(1, Math.round(limit * bounded))
  return safeJson({
    stack: knowledge.stack,
    packageManager: knowledge.packageManager,
    files: knowledge.fileCount,
    signature: knowledge.signature.slice(0, 12),
    partial: knowledge.partial ? true : undefined,
    languages: knowledge.languages.slice(0, cap(3)).map(language => `${language.extension}:${language.files}`),
    sourceRoots: knowledge.sourceRoots.slice(0, cap(6)),
    entryPoints: knowledge.entryPoints.slice(0, cap(5)),
    testPaths: knowledge.testPaths.slice(0, cap(3)),
    importantFiles: knowledge.importantFiles.slice(0, cap(6)),
    commands: knowledge.commands.slice(0, cap(5)).map(command => `${command.id}: ${command.argv.join(" ")}`),
    dependencies: {
      runtime: knowledge.dependencies.runtime.slice(0, cap(10)),
      development: knowledge.dependencies.development.slice(0, cap(5)),
    },
    conventions: knowledge.conventions.slice(0, cap(5)),
  })
}

function remember(workspace: string, now: number, knowledge: ProjectKnowledge) {
  cache.delete(workspace)
  cache.set(workspace, { scannedAt: now, knowledge })
  while (cache.size > retainedProjects) {
    const oldest = cache.keys().next().value
    if (oldest === undefined) break
    cache.delete(oldest)
  }
  return knowledge
}

function fingerprint(files: ScannedFile[]) {
  const hasher = new Bun.CryptoHasher("sha256")
  for (const file of files) hasher.update(`${file.path}:${file.metadata.size}:${file.metadata.mtimeMs}\n`)
  return hasher.digest("hex")
}

async function derive(
  workspace: string,
  project: Project,
  files: ScannedFile[],
  signature: string,
  now: number,
): Promise<ProjectKnowledge> {
  const paths = files.map(file => file.path.split(path.sep).join("/")).sort()
  const present = new Set(paths)
  const languages = countLanguages(paths)
  const packageJson = present.has("package.json") ? parseJson(await readText(workspace, "package.json")) : undefined
  const tsconfig = present.has("tsconfig.json") ? parseJson(await readText(workspace, "tsconfig.json")) : undefined
  const editorconfig = present.has(".editorconfig") ? await readText(workspace, ".editorconfig") : ""
  const requirements = present.has("requirements.txt") ? await readText(workspace, "requirements.txt") : ""
  const runtime = packageJson ? keysOf(packageJson.dependencies) : pythonNames(requirements)
  const development = packageJson ? keysOf(packageJson.devDependencies) : []
  const sourceRoots = deriveSourceRoots(paths, project)
  const testPaths = deriveTestPaths(paths)
  const configFiles = paths.filter(candidate => configNames.has(base(candidate))).slice(0, 12)
  const documents = paths.filter(candidate => documentNames.has(base(candidate))).slice(0, 6)
  const entryPoints = deriveEntryPoints(present, packageJson)
  return {
    generatedAt: now,
    stack: deriveStack(project, languages, runtime, development),
    packageManager: project.packageManager,
    fileCount: files.length,
    signature,
    partial: false,
    languages,
    sourceRoots,
    entryPoints,
    testPaths,
    configFiles,
    importantFiles: unique([...documents, ...configFiles.slice(0, 6), ...entryPoints]).slice(0, 12),
    commands: deriveCommands(project, packageJson),
    dependencies: { runtime: runtime.slice(0, 20), development: development.slice(0, 20) },
    conventions: deriveConventions({ packageJson, tsconfig, editorconfig, present, testPaths }),
  }
}

function degraded(project: Project, now: number, error: unknown): ProjectKnowledge {
  const reason = error instanceof Error ? error.message : "unknown error"
  return {
    generatedAt: now,
    stack: project.kind,
    packageManager: project.packageManager,
    fileCount: 0,
    signature: "",
    partial: true,
    languages: [],
    sourceRoots: [...project.roots],
    entryPoints: [],
    testPaths: [],
    configFiles: [],
    importantFiles: [],
    commands: checkCommands(project),
    dependencies: { runtime: [], development: [] },
    conventions: [`project map unavailable: ${reason.slice(0, 160)}`],
  }
}

function countLanguages(paths: string[]) {
  const counts = new Map<string, number>()
  for (const candidate of paths) {
    const extension = suffix(candidate)
    if (!codeExtensions.has(extension)) continue
    counts.set(extension, (counts.get(extension) ?? 0) + 1)
  }
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .map(([extension, count]) => ({ extension, files: count }))
}

function deriveSourceRoots(paths: string[], project: Project) {
  const counts = new Map<string, number>()
  for (const candidate of paths) {
    const segments = candidate.split("/")
    if (segments.length < 2 || !codeExtensions.has(suffix(candidate))) continue
    const head = segments[0]!
    if (testRoots.has(head)) continue
    counts.set(head, (counts.get(head) ?? 0) + 1)
  }
  const roots = [...counts.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .map(([root]) => root)
    .slice(0, 8)
  return roots.length ? roots : [...project.roots].slice(0, 8)
}

function deriveTestPaths(paths: string[]) {
  const found = new Set<string>()
  for (const candidate of paths) {
    if (!testPatterns.some(pattern => pattern.test(candidate))) continue
    const segments = candidate.split("/")
    const index = segments.findIndex(segment => testRoots.has(segment))
    found.add(index >= 0 ? segments.slice(0, index + 1).join("/") : candidate)
  }
  return [...found].sort().slice(0, 6)
}

function deriveEntryPoints(present: Set<string>, packageJson: Json | undefined) {
  const declared = [packageJson?.main, packageJson?.module].filter((value): value is string => typeof value === "string")
  const bin = packageJson?.bin
  const binaries =
    typeof bin === "string"
      ? [bin]
      : bin && typeof bin === "object"
        ? Object.values(bin as Json).filter((value): value is string => typeof value === "string")
        : []
  const normalised = [...declared, ...binaries].map(entry => entry.replace(/^\.\//, "")).sort()
  return unique([...entryCandidates.filter(candidate => present.has(candidate)), ...normalised]).slice(0, 8)
}

function deriveCommands(project: Project, packageJson: Json | undefined) {
  const runner = project.packageManager ?? "npm"
  const scripts = keysOf(packageJson?.scripts).map(name => ({ id: `script:${name}`, argv: [runner, "run", name] }))
  const commands: ProjectCommand[] = []
  for (const command of [...checkCommands(project), ...scripts]) {
    if (commands.some(existing => existing.id === command.id)) continue
    commands.push(command)
    if (commands.length === 10) break
  }
  return commands
}

function checkCommands(project: Project): ProjectCommand[] {
  return project.checks.map(check => ({ id: check.id, argv: [...check.argv] }))
}

function deriveStack(project: Project, languages: ProjectLanguage[], runtime: string[], development: string[]) {
  const primary = languages[0]
  const language = primary ? (languageNames.get(primary.extension) ?? primary.extension) : project.kind
  const installed = new Set([...runtime, ...development])
  const detected = frameworkNames.filter(([dependency]) => installed.has(dependency)).map(([, label]) => label)
  return [language, ...detected.slice(0, 2)].join(" + ")
}

function deriveConventions(input: {
  packageJson: Json | undefined
  tsconfig: Json | undefined
  editorconfig: string
  present: Set<string>
  testPaths: string[]
}) {
  const conventions: string[] = []
  if (input.packageJson?.type === "module") conventions.push("ESM modules (package.json type: module)")
  const compilerOptions = input.tsconfig?.compilerOptions
  if (compilerOptions && typeof compilerOptions === "object" && (compilerOptions as Json).strict === true)
    conventions.push("TypeScript strict mode")
  if (input.present.has(".prettierrc.json") || input.packageJson?.prettier) conventions.push("Prettier formatting")
  if (input.present.has("eslint.config.js") || input.present.has(".eslintrc.json")) conventions.push("ESLint linting")
  const style = /indent_style\s*=\s*(\w+)/.exec(input.editorconfig)?.[1]
  const size = /indent_size\s*=\s*(\w+)/.exec(input.editorconfig)?.[1]
  if (style) conventions.push(`indentation: ${style}${size ? ` ${size}` : ""}`)
  const root = input.testPaths[0]
  if (root) conventions.push(`tests live in ${root}`)
  return conventions.slice(0, 8)
}

async function readText(workspace: string, relative: string) {
  try {
    const file = await guard(workspace, relative)
    const handle = Bun.file(file)
    if (!(await handle.exists()) || handle.size > readLimit) return ""
    return await handle.text()
  } catch {
    return ""
  }
}

function parseJson(text: string): Json | undefined {
  if (!text.trim()) return undefined
  const candidates = [text, text.replace(/^\s*\/\/.*$/gm, "").replace(/,(\s*[}\]])/g, "$1")]
  for (const candidate of candidates) {
    try {
      const value: unknown = JSON.parse(candidate)
      if (value && typeof value === "object" && !Array.isArray(value)) return value as Json
    } catch {
      continue
    }
  }
  return undefined
}

function keysOf(value: unknown) {
  return value && typeof value === "object" && !Array.isArray(value) ? Object.keys(value as Json).sort() : []
}

function pythonNames(requirements: string) {
  return requirements
    .split(/\r?\n/)
    .map(line => line.trim())
    .filter(line => line.length > 0 && !line.startsWith("#"))
    .map(line => (/^[A-Za-z0-9._-]+/.exec(line)?.[0] ?? "").toLowerCase())
    .filter(Boolean)
    .sort()
}

function unique(values: string[]) {
  return [...new Set(values)]
}

function base(candidate: string) {
  return candidate.split("/").at(-1) ?? candidate
}

function suffix(candidate: string) {
  const name = base(candidate)
  const dot = name.lastIndexOf(".")
  return dot > 0 ? name.slice(dot + 1).toLowerCase() : ""
}
