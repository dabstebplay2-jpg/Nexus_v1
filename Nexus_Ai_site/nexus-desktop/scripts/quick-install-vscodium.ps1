# Install Nexus VSIX into an existing VSCodium / VS Code install (no 15GB compile).
# Usage: .\scripts\quick-install-vscodium.ps1
#        .\scripts\quick-install-vscodium.ps1 -IdePath "C:\Users\you\AppData\Local\Programs\VSCodium"
param(
  [string]$IdePath = ""
)

$ErrorActionPreference = "Stop"
$Desktop = Split-Path -Parent $PSScriptRoot
$Dist = Join-Path $Desktop "dist"

if (-not (Test-Path $Dist)) {
  Write-Host "Packaging VSIX..."
  & (Join-Path $PSScriptRoot "package-extensions.ps1")
}

function Find-Vscodium {
  # VSCodium first — script name targets VSCodium; VS Code is fallback only.
  $candidates = @(
    $IdePath,
    "${env:LOCALAPPDATA}\Programs\VSCodium",
    "${env:ProgramFiles}\VSCodium",
    "${env:ProgramFiles}\Microsoft VS Code",
    "${env:LOCALAPPDATA}\Programs\Microsoft VS Code"
  ) | Where-Object { $_ -and (Test-Path $_) }
  foreach ($c in $candidates) {
    $bin = Join-Path $c "bin"
    foreach ($name in @("codium.cmd", "code.cmd")) {
      $cli = Join-Path $bin $name
      if (Test-Path $cli) {
        return @{ Root = $c; Cli = $cli; Name = if ($name -like "codium*") { "VSCodium" } else { "VS Code" } }
      }
    }
  }
  return $null
}

$ide = Find-Vscodium
if (-not $ide) {
  Write-Error "VSCodium/VS Code not found. Install from https://vscodium.com/ or pass -IdePath"
}

Write-Host "IDE: $($ide.Name) at $($ide.Root)"
$cli = $ide.Cli

foreach ($vsix in Get-ChildItem $Dist -Filter "*.vsix") {
  Write-Host "Installing $($vsix.Name)..."
  if ($cli -like "*.cmd") {
    & cmd /c "`"$cli`" --install-extension `"$($vsix.FullName)`" --force"
  } else {
    & $cli --install-extension $vsix.FullName --force
  }
}

Write-Host @"

Done. Launch IDE and:
  1. Settings -> nexus.cloudUrl = https://nexus-cloud-bxcc.onrender.com/v1
  2. Command: Nexus: Sign In
  3. Open Nexus sidebar -> AI Chat

"@
