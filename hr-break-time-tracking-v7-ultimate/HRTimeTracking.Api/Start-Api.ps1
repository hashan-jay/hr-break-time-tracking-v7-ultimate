# Clear leftover API hosts, then start a single watch instance on port 5085.
$ErrorActionPreference = 'Stop'
Set-Location $PSScriptRoot

& (Join-Path $PSScriptRoot 'Stop-ApiLocks.ps1')
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

Write-Host 'Starting API: dotnet watch run --launch-profile http'
dotnet watch run --launch-profile http --project $PSScriptRoot
