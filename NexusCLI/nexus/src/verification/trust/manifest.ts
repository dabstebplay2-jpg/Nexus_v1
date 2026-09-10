import type { TrustPatterns } from "../../domain/types"
import { normalise } from "../../workspace/paths"

/**
 * Which files are trust anchors.
 *
 * These are data, not code: they are copied into the manifest at admission and can be reviewed,
 * diffed and extended per project without editing Nexus. A project may ship its own
 * `trust.manifest.json` at its root, which is read once at admission and then pinned.
 *
 * `exclusive` decides how a check runs — package manifests, test-runner configuration, build and
 * CI definitions. Editing one, deleting one, or *introducing* one that did not exist all make a
 * check's exit code untrustworthy.
 *
 * `extensible` is existing test material. Editing or deleting one is a violation; adding new
 * regression tests is expected work, not tampering.
 */
export const defaultTrustPatterns: TrustPatterns = {
  exclusive: [
    // Node / TypeScript
    "**/package.json",
    "**/package-lock.json",
    "**/pnpm-lock.yaml",
    "**/yarn.lock",
    "**/bun.lock",
    "**/bun.lockb",
    "**/tsconfig*.json",
    "**/jsconfig*.json",
    "**/vitest.config.*",
    "**/vitest.workspace.*",
    "**/jest.config.*",
    "**/jest.setup.*",
    "**/karma.conf.*",
    "**/playwright.config.*",
    "**/cypress.config.*",
    "**/.mocharc.*",
    "**/bunfig.toml",
    "**/eslint.config.*",
    "**/.eslintrc*",
    "**/biome.json",
    "**/.babelrc*",
    "**/babel.config.*",
    // Python
    "**/pyproject.toml",
    "**/setup.py",
    "**/setup.cfg",
    "**/pytest.ini",
    "**/tox.ini",
    "**/conftest.py",
    "**/sitecustomize.py",
    "**/requirements*.txt",
    "**/Pipfile",
    "**/uv.lock",
    "**/poetry.lock",
    "**/.coveragerc",
    "**/ruff.toml",
    "**/mypy.ini",
    // Other ecosystems
    "**/Cargo.toml",
    "**/Cargo.lock",
    "**/go.mod",
    "**/go.sum",
    "**/*.csproj",
    "**/*.fsproj",
    "**/*.sln",
    "**/pom.xml",
    "**/build.gradle*",
    "**/Gemfile",
    "**/Rakefile",
    // Build, CI and task runners
    "**/Makefile",
    "**/makefile",
    "**/justfile",
    "**/Taskfile.*",
    "**/Dockerfile*",
    "**/docker-compose*.y*ml",
    ".github/**",
    ".gitlab-ci.yml",
    ".circleci/**",
    "azure-pipelines.yml",
    "**/*.nexus-check.*",
    // The project's own anchor configuration is itself an anchor.
    "trust.manifest.json",
  ],
  extensible: [
    "**/test/**",
    "**/tests/**",
    "**/spec/**",
    "**/__tests__/**",
    "**/*.test.*",
    "**/*.spec.*",
    "**/test_*.py",
    "**/*_test.py",
    "**/*_test.go",
    "**/*Test.java",
    "**/*Tests.cs",
  ],
}

/** Well-known harness files whose *absence* is worth recording, so a reviewer sees what was checked. */
export const wellKnownHarnesses = [
  "conftest.py",
  "pytest.ini",
  "tox.ini",
  "setup.cfg",
  "sitecustomize.py",
  "jest.config.js",
  "vitest.config.ts",
  "Makefile",
  "trust.manifest.json",
]

export function matchesAny(file: string, patterns: readonly string[]) {
  const target = normalise(file)
  return patterns.some((pattern) => new Bun.Glob(pattern).match(target))
}
/** True when a check's exit code depends on this file's contents. */
export function isAnchor(file: string, patterns: TrustPatterns) {
  return matchesAny(file, patterns.exclusive) || matchesAny(file, patterns.extensible)
}
/** True when creating this file — not just editing it — invalidates a check. */
export function isExclusiveAnchor(file: string, patterns: TrustPatterns) {
  return matchesAny(file, patterns.exclusive)
}
export function mergePatterns(base: TrustPatterns, extra?: Partial<TrustPatterns>): TrustPatterns {
  return {
    exclusive: [...new Set([...base.exclusive, ...(extra?.exclusive ?? [])])],
    extensible: [...new Set([...base.extensible, ...(extra?.extensible ?? [])])],
  }
}
