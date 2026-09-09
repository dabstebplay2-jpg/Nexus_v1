# Run full VSCodium build; log to nexus-desktop/build.log (for long runs).
$ErrorActionPreference = "Continue"
$Desktop = Split-Path -Parent $PSScriptRoot
$Log = Join-Path $Desktop "build.log"
$ts = Get-Date -Format "yyyy-MM-dd HH:mm:ss"
"=== Nexus IDE build started $ts ===" | Tee-Object -FilePath $Log
& (Join-Path $PSScriptRoot "build.ps1") 2>&1 | Tee-Object -FilePath $Log -Append
$code = $LASTEXITCODE
"=== Finished exit=$code $(Get-Date -Format 'yyyy-MM-dd HH:mm:ss') ===" | Tee-Object -FilePath $Log -Append
exit $code
