# Stop leftover API hosts and their parent `dotnet watch` trees.
# Those leftovers lock bin\Debug\net10.0\HRTimeTracking.Api.dll (MSB3027).
$ErrorActionPreference = 'Continue'
$killed = [System.Collections.Generic.HashSet[int]]::new()
$failed = [System.Collections.Generic.List[string]]::new()
$dll = Join-Path $PSScriptRoot 'bin\Debug\net10.0\HRTimeTracking.Api.dll'

function Get-ChildProcessIds([int]$ProcessId) {
    Get-CimInstance Win32_Process -Filter "ParentProcessId = $ProcessId" | ForEach-Object {
        $_.ProcessId
        Get-ChildProcessIds $_.ProcessId
    }
}

function Stop-DotnetTree([int]$ProcessId) {
    if ($ProcessId -le 4 -or $killed.Contains($ProcessId)) { return }

    $current = Get-CimInstance Win32_Process -Filter "ProcessId = $ProcessId"
    if (-not $current) { return }

    $top = $current
    while ($true) {
        $parent = Get-CimInstance Win32_Process -Filter "ProcessId = $($top.ParentProcessId)"
        if (-not $parent -or $parent.Name -notmatch '^(dotnet|HRTimeTracking)') { break }
        $top = $parent
    }

    $ids = @($top.ProcessId) + @(Get-ChildProcessIds $top.ProcessId)
    foreach ($id in ($ids | Select-Object -Unique)) {
        if ($id -le 4 -or -not $killed.Add($id)) { continue }
        $detail = Get-CimInstance Win32_Process -Filter "ProcessId = $id"
        Write-Host "Stopping PID $id  $($detail.Name)"
        try {
            Stop-Process -Id $id -Force -ErrorAction Stop
        } catch {
            $null = taskkill /F /PID $id 2>&1
            $still = Get-Process -Id $id -ErrorAction SilentlyContinue
            if ($still) {
                $failed.Add("PID $id $($detail.Name)") | Out-Null
                Write-Host '  Access denied. This process is likely from an elevated or old terminal.'
            }
        }
    }
}

Get-NetTCPConnection -LocalPort 5085 -State Listen -ErrorAction SilentlyContinue | ForEach-Object {
    Stop-DotnetTree $_.OwningProcess
}

Get-CimInstance Win32_Process | Where-Object {
    $_.Name -match '^(dotnet|HRTimeTracking)' -and
    $_.CommandLine -match 'HRTimeTracking\.Api|HRBreakTimeTrackerV6|HRBreakTimeTrackerV7|hr-break-time-tracking-v6|hr-break-time-tracking-v7'
} | ForEach-Object {
    Stop-DotnetTree $_.ProcessId
}

# Stuck watches started from this folder often omit the csproj in CommandLine.
Get-CimInstance Win32_Process -Filter "Name = 'dotnet.exe'" | Where-Object {
    $_.CommandLine -match 'dotnet-watch|watch run' -and
    $_.CommandLine -notmatch '\.csproj'
} | ForEach-Object {
    Stop-DotnetTree $_.ProcessId
}

Get-Process -Name 'HRTimeTracking.Api' -ErrorAction SilentlyContinue | ForEach-Object {
    Stop-DotnetTree $_.Id
}

$unlocked = $false
for ($i = 0; $i -lt 20; $i++) {
    Start-Sleep -Milliseconds 250
    if (-not (Test-Path $dll)) { $unlocked = $true; break }
    try {
        $fs = [System.IO.File]::Open($dll, 'Open', 'ReadWrite', 'None')
        $fs.Dispose()
        $unlocked = $true
        break
    } catch {
        # still locked
    }
}

$listening = Get-NetTCPConnection -LocalPort 5085 -State Listen -ErrorAction SilentlyContinue
$hosts = Get-CimInstance Win32_Process | Where-Object {
    $_.CommandLine -match 'HRTimeTracking\.Api\.dll' -or
    ($_.Name -eq 'dotnet.exe' -and $_.ProcessId -in @($listening.OwningProcess))
}

if ($listening -or $hosts -or -not $unlocked) {
    $pids = @($listening.OwningProcess | Select-Object -Unique)
    Write-Host ''
    Write-Host 'API host is still running and the build output is locked (MSB3027).'
    if ($pids.Count -gt 0) {
        Write-Host ("Leftover process: {0}" -f (($pids | ForEach-Object { "dotnet.exe PID $_" }) -join ', '))
    }
    if ($failed.Count -gt 0) {
        Write-Host ("Could not stop: {0}" -f ($failed -join ', '))
    }
    Write-Host 'This usually means the API was started from an elevated or older PowerShell window.'
    Write-Host 'Close that window (Ctrl+C), or in Task Manager end the leftover dotnet.exe, then retry.'
    Write-Host 'Do not start a second dotnet watch run while port 5085 is still in use.'
    exit 1
}

Write-Host 'Port 5085 is free. You can run: .\Start-Api.ps1'
exit 0
