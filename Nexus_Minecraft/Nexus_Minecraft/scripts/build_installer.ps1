param(
    [string]$Python = "python",
    [switch]$SkipReleaseBuild,
    [string]$ISCCPath = ""
)

$ErrorActionPreference = "Stop"
$ProjectRoot = Resolve-Path (Join-Path $PSScriptRoot "..")
Set-Location $ProjectRoot

if (Test-Path ".\.venv\Scripts\python.exe") {
    $PythonExe = ".\.venv\Scripts\python.exe"
} else {
    $PythonExe = $Python
}

$Version = & $PythonExe -c "from core.app_info import APP_VERSION; print(APP_VERSION)"
$ReleaseExe = Join-Path $ProjectRoot "release\NexusLauncher-$Version-win-x64.exe"

if (-not $SkipReleaseBuild) {
    if (-not (Test-Path $ReleaseExe)) {
        Write-Host "Release EXE not found. Building release first..."
        powershell -ExecutionPolicy Bypass -File ".\scripts\build_release.ps1" -Python $Python
        if ($LASTEXITCODE -ne 0) {
            throw "build_release.ps1 failed with code $LASTEXITCODE"
        }
    }
}

if (-not (Test-Path $ReleaseExe)) {
    throw "Release EXE not found: $ReleaseExe"
}

function Find-InnoSetupCompiler {
    param([string]$ManualPath)

    $candidates = New-Object System.Collections.Generic.List[string]

    if ($ManualPath) {
        $candidates.Add($ManualPath)
    }

    $cmd = Get-Command "ISCC.exe" -ErrorAction SilentlyContinue
    if ($cmd) {
        $candidates.Add($cmd.Source)
    }

    $knownRoots = @(
        ${env:ProgramFiles(x86)},
        $env:ProgramFiles,
        $env:LOCALAPPDATA,
        $env:APPDATA
    ) | Where-Object { $_ -and (Test-Path $_) }

    foreach ($root in $knownRoots) {
        $candidates.Add((Join-Path $root "Inno Setup 6\ISCC.exe"))
        $candidates.Add((Join-Path $root "Programs\Inno Setup 6\ISCC.exe"))
        $candidates.Add((Join-Path $root "JRSoftware\Inno Setup 6\ISCC.exe"))
    }

    $registryPaths = @(
        "HKCU:\Software\Microsoft\Windows\CurrentVersion\Uninstall\*",
        "HKLM:\Software\Microsoft\Windows\CurrentVersion\Uninstall\*",
        "HKLM:\Software\WOW6432Node\Microsoft\Windows\CurrentVersion\Uninstall\*"
    )

    foreach ($regPath in $registryPaths) {
        try {
            Get-ItemProperty $regPath -ErrorAction SilentlyContinue |
                Where-Object { $_.DisplayName -like "*Inno Setup*" -or $_.InstallLocation -like "*Inno Setup*" } |
                ForEach-Object {
                    if ($_.InstallLocation) {
                        $candidates.Add((Join-Path $_.InstallLocation "ISCC.exe"))
                    }

                    if ($_.UninstallString) {
                        $uninstall = $_.UninstallString.Trim('"')
                        $folder = Split-Path $uninstall -Parent
                        if ($folder) {
                            $candidates.Add((Join-Path $folder "ISCC.exe"))
                        }
                    }
                }
        } catch {}
    }

    foreach ($candidate in ($candidates | Select-Object -Unique)) {
        if ($candidate -and (Test-Path $candidate)) {
            return (Resolve-Path $candidate).Path
        }
    }

    foreach ($root in $knownRoots) {
        try {
            $found = Get-ChildItem -Path $root -Filter "ISCC.exe" -Recurse -ErrorAction SilentlyContinue |
                Where-Object { $_.FullName -like "*Inno Setup*" } |
                Select-Object -First 1

            if ($found) {
                return $found.FullName
            }
        } catch {}
    }

    return $null
}

$ISCC = Find-InnoSetupCompiler -ManualPath $ISCCPath

if (-not $ISCC) {
    throw @"
Inno Setup Compiler (ISCC.exe) not found.

Try to locate it:
  Get-ChildItem -Path "$env:ProgramFiles","${env:ProgramFiles(x86)}","$env:LOCALAPPDATA" -Filter ISCC.exe -Recurse -ErrorAction SilentlyContinue

If it is found, run with explicit path:
  powershell -ExecutionPolicy Bypass -File .\scripts\build_installer.ps1 -SkipReleaseBuild -ISCCPath "FULL_PATH_TO_ISCC.exe"

Or reinstall Inno Setup:
  winget uninstall JRSoftware.InnoSetup
  winget install JRSoftware.InnoSetup --scope machine

Then run:
  powershell -ExecutionPolicy Bypass -File .\scripts\build_installer.ps1 -SkipReleaseBuild
"@
}

Write-Host "Using Inno Setup: $ISCC"
Write-Host "Building installer for Nexus Launcher v$Version"

& $ISCC "/DAppVersion=$Version" "installer\NexusLauncher.iss"
if ($LASTEXITCODE -ne 0) {
    throw "Inno Setup build failed with code $LASTEXITCODE"
}

$SetupExe = Join-Path $ProjectRoot "release\NexusLauncherSetup-$Version-win-x64.exe"

if (-not (Test-Path $SetupExe)) {
    throw "Installer was not created: $SetupExe"
}

$Hash = Get-FileHash $SetupExe -Algorithm SHA256
"$($Hash.Hash)  $(Split-Path $SetupExe -Leaf)" | Out-File -FilePath "$SetupExe.sha256" -Encoding ascii

Write-Host ""
Write-Host "Installer created:" -ForegroundColor Green
Write-Host $SetupExe
Write-Host "$SetupExe.sha256"
