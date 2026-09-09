import { mkdir } from "node:fs/promises"
await mkdir("dist", { recursive: true })
const result = await Bun.build({
  entrypoints: ["apps/cli/index.ts"],
  outdir: "dist",
  target: "bun",
  naming: "nexus.js",
  sourcemap: "external",
})
if (!result.success) {
  console.error(result.logs)
  process.exit(1)
}
const compiled = Bun.spawn(
  [
    process.execPath,
    "build",
    "apps/cli/index.ts",
    "--compile",
    "--outfile",
    process.platform === "win32" ? "dist/nexus.exe" : "dist/nexus",
  ],
  { stdout: "inherit", stderr: "inherit" },
)
if (await compiled.exited) process.exit(1)
console.log("Built bundled CLI and standalone executable")
await mkdir("dist/licenses", { recursive: true })
for (const dependency of ["zod", "diff"])
  await Bun.write(`dist/licenses/${dependency}.txt`, await Bun.file(`node_modules/${dependency}/LICENSE`).text())
await Bun.write("dist/THIRD_PARTY_NOTICES.md", await Bun.file("THIRD_PARTY_NOTICES.md").text())
