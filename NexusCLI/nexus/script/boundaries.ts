import path from "node:path"
const violations: string[] = []
const graph = new Map<string, string[]>()
for await (const file of new Bun.Glob("{src,apps}/**/*.ts").scan(".")) {
  const content = await Bun.file(file).text()
  const edges: string[] = []
  for (const match of content.matchAll(/(?:from\s+|import\s*\()(["'])([^"']+)\1/g)) {
    const dependency = match[2]!
    const resolved = path.resolve(path.dirname(file), dependency)
    if (dependency.startsWith(".")) edges.push(resolved.replace(/\.ts$/, ""))
    if (dependency.includes("opencode") || dependency.includes("packages/"))
      violations.push(`${file}: OpenCode runtime dependency`)
    if (
      file.replaceAll("\\", "/").startsWith("src/domain/") &&
      dependency.startsWith(".") &&
      !resolved.startsWith(path.resolve("src/domain"))
    )
      violations.push(`${file}: domain imports infrastructure`)
    if (
      file.replaceAll("\\", "/").startsWith("src/core/") &&
      /storage\/sqlite|llm\/openai|apps\/|composition/.test(dependency)
    )
      violations.push(`${file}: core imports concrete infrastructure or UI`)
    if (/import\s+(?:type\s+)?\*\s+as|import\s*{[^}]*\bas\b/.test(content))
      violations.push(`${file}: aliased or star import`)
  }
  graph.set(path.resolve(file).replace(/\.ts$/, ""), edges)
}
function visit(file: string, trail: string[], checked: Set<string>) {
  if (trail.includes(file)) {
    violations.push(
      `Circular import: ${[...trail, file].map((item) => path.relative(process.cwd(), item)).join(" -> ")}`,
    )
    return
  }
  if (checked.has(file)) return
  for (const next of graph.get(file) ?? []) visit(next, [...trail, file], checked)
  checked.add(file)
}
const checked = new Set<string>()
for (const file of graph.keys()) visit(file, [], checked)
if (violations.length) {
  console.error([...new Set(violations)].join("\n"))
  process.exit(1)
}
console.log("Dependency boundaries passed")
