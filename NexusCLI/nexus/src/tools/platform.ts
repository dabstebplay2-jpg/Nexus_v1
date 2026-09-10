import { runProcess } from "./process"

export function platformContext(platform = process.platform) {
  return platform === "win32"
    ? {
        platform,
        shell: "Windows PowerShell (powershell.exe)",
        instructions:
          "The bash tool executes PowerShell, not Bash or cmd.exe. Use Get-ChildItem -Recurse -File | Select-Object FullName, Length | Format-List for structure. Use Get-Content for reading; prefer the guarded list/read/edit tools. Do not use dir /s /b, ls flags, export, or Bash syntax. Quote literal paths with single quotes and use -LiteralPath. Commands fail on intermediate errors; split recovery steps into separate calls.",
      }
    : {
        platform,
        shell: "bash",
        instructions:
          "Use Bash syntax. Commands run with errexit and pipefail; split recovery steps into separate calls. Prefer list/read/edit tools.",
      }
}

export function shellArgv(command: string, platform = process.platform) {
  if (platform !== "win32") return ["bash", "-e", "-o", "pipefail", "-c", command]
  // Parse with PowerShell itself. Instrument command AST extents, never split on semicolons
  // (which also occur inside strings and script blocks). Dot sourcing preserves scope.
  const source = Buffer.from(command, "utf8").toString("base64")
  const script = `
$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'
[Console]::OutputEncoding = [System.Text.UTF8Encoding]::new($false)
$source = [Text.Encoding]::UTF8.GetString([Convert]::FromBase64String('${source}'))
try {
  $tokens = $null; $parseErrors = $null
  $tree = [System.Management.Automation.Language.Parser]::ParseInput($source, [ref]$tokens, [ref]$parseErrors)
  if ($parseErrors.Count) { throw ($parseErrors | Out-String) }
  $inserts = @()
  foreach ($node in $tree.FindAll({ param($n) $n -is [System.Management.Automation.Language.CommandAst] }, $true)) {
    $prefix = '. { $global:LASTEXITCODE = 0; '
    if ($node.Parent -is [System.Management.Automation.Language.PipelineAst] -and $node.Parent.PipelineElements[0] -ne $node) {
      $prefix = '. { $global:LASTEXITCODE = 0; $input | '
    }
    $inserts += @{ Offset = $node.Extent.StartOffset; Text = $prefix }
    $inserts += @{ Offset = $node.Extent.EndOffset; Text = '; $nexusCommandSucceeded = $?; if ($global:LASTEXITCODE -ne 0) { throw "Native command failed with exit code $global:LASTEXITCODE; correct the failing operation before retrying." }; if (-not $nexusCommandSucceeded) { throw "Shell operation failed; inspect stderr and correct the command." } }' }
  }
  foreach ($insert in ($inserts | Sort-Object { $_.Offset } -Descending)) { $source = $source.Insert($insert.Offset, $insert.Text) }
  $Error.Clear()
  . ([ScriptBlock]::Create($source))
  if ($Error.Count) { throw 'Shell recorded an error; inspect stderr before retrying.' }
  exit 0
} catch {
  [Console]::Error.WriteLine(($_ | Out-String))
  exit 1
}`
  return [
    "powershell.exe",
    "-NoProfile",
    "-NonInteractive",
    "-OutputFormat",
    "Text",
    "-EncodedCommand",
    Buffer.from(script, "utf16le").toString("base64"),
  ]
}

export async function runShell(command: string, cwd: string, signal: AbortSignal) {
  return runProcess(shellArgv(command), cwd, signal)
}
