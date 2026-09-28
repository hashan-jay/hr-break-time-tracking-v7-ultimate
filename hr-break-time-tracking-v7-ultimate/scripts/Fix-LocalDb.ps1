#Requires -RunAsAdministrator
<#
.SYNOPSIS
  Fixes SQL Server LocalDB startup crash on Windows 11 (misaligned log IOs / stack overflow).

.DESCRIPTION
  Applies Microsoft's ForcedPhysicalSectorSizeInBytes workaround for NVMe drives that
  report a >4KB physical sector size. SQL Server 2022 LocalDB RTM (16.0.1000.6) then
  crashes with "256 misaligned log IOs" + EXCEPTION_STACK_OVERFLOW until this registry
  value is loaded by the stornvme driver - which requires a reboot.

  Docs:
  https://learn.microsoft.com/en-us/troubleshoot/sql/database-engine/database-file-operations/troubleshoot-os-4kb-disk-sector-size

.NOTES
  - Reboot is MANDATORY after applying the registry value; recreating LocalDB alone does not fix this.
  - After reboot: verify with SqlLocalDB.exe start/info, then run the API.
#>

$ErrorActionPreference = 'Stop'

$regPath = 'HKLM:\SYSTEM\CurrentControlSet\Services\stornvme\Parameters\Device'
if (-not (Test-Path $regPath)) {
    New-Item -Path $regPath -Force | Out-Null
}

New-ItemProperty `
    -Path $regPath `
    -Name 'ForcedPhysicalSectorSizeInBytes' `
    -PropertyType MultiString `
    -Value @('* 4095') `
    -Force | Out-Null

Write-Host 'Registry workaround applied: ForcedPhysicalSectorSizeInBytes = * 4095' -ForegroundColor Green

$boot = (Get-CimInstance Win32_OperatingSystem).LastBootUpTime
Write-Host "Last boot: $boot"
Write-Host 'This script just wrote/refreshed the registry value.'

$sqllocaldb = Join-Path ${env:ProgramFiles} 'Microsoft SQL Server\160\Tools\Binn\SqlLocalDB.exe'
if (-not (Test-Path $sqllocaldb)) {
    $found = Get-ChildItem "${env:ProgramFiles}\Microsoft SQL Server\*\Tools\Binn\SqlLocalDB.exe" -ErrorAction SilentlyContinue |
        Select-Object -First 1 -ExpandProperty FullName
    if ($found) { $sqllocaldb = $found }
}

Write-Host ''
Write-Host 'A reboot is REQUIRED before LocalDB will start reliably.' -ForegroundColor Yellow
Write-Host 'The stornvme driver only loads ForcedPhysicalSectorSizeInBytes at boot.' -ForegroundColor Yellow
Write-Host 'Recreating MSSQLLocalDB without a reboot will NOT fix misaligned log IOs / stack overflow.' -ForegroundColor Yellow
Write-Host ''
Write-Host 'NEXT STEP: Reboot this machine, then run:' -ForegroundColor Cyan
Write-Host "  & `"$sqllocaldb`" start MSSQLLocalDB"
Write-Host "  & `"$sqllocaldb`" info MSSQLLocalDB"
Write-Host '  cd HRTimeTracking.Api'
Write-Host '  dotnet run'
Write-Host ''
Write-Host 'Optional after reboot (if instance is still broken):' -ForegroundColor Cyan
Write-Host "  & `"$sqllocaldb`" stop MSSQLLocalDB -k"
Write-Host "  & `"$sqllocaldb`" delete MSSQLLocalDB"
Write-Host "  & `"$sqllocaldb`" create MSSQLLocalDB"
Write-Host "  & `"$sqllocaldb`" start MSSQLLocalDB"
