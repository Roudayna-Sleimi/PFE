param(
  [switch]$RunNow
)

$ErrorActionPreference = 'Stop'

$scriptRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
$projectRoot = Split-Path -Parent $scriptRoot
$pythonAiDir = Join-Path $projectRoot 'python-ai'
$backendDir = Join-Path $projectRoot 'backend'

function Resolve-ExistingPath {
  param(
    [Parameter(Mandatory = $true)][string]$Label,
    [Parameter(Mandatory = $true)][string[]]$Candidates
  )

  foreach ($candidate in $Candidates) {
    if (-not $candidate) { continue }
    if (Test-Path -LiteralPath $candidate) {
      return (Resolve-Path -LiteralPath $candidate).Path
    }
  }

  throw "$Label executable not found. Set PFE_${Label}_EXE or install $Label."
}

$pythonCmd = Get-Command python.exe -ErrorAction SilentlyContinue
$nodeCmd = Get-Command node.exe -ErrorAction SilentlyContinue

$pythonCandidates = @(
  $env:PFE_PYTHON_EXE,
  'C:\Users\dell\AppData\Local\Programs\Python\Python314\python.exe',
  'C:\Program Files\Python314\python.exe',
  'C:\Program Files\Python313\python.exe',
  'C:\Program Files\Python312\python.exe',
  'C:\Python314\python.exe',
  'C:\Python313\python.exe',
  'C:\Python312\python.exe',
  $(if ($pythonCmd -and $pythonCmd.Source -notmatch 'WindowsApps') { $pythonCmd.Source } else { $null })
)
$pythonCandidates = $pythonCandidates | Where-Object { -not [string]::IsNullOrWhiteSpace($_) }
$pythonExe = Resolve-ExistingPath -Label 'PYTHON' -Candidates $pythonCandidates

$nodeCandidates = @(
  $env:PFE_NODE_EXE,
  'C:\Program Files\nodejs\node.exe',
  $(if ($nodeCmd) { $nodeCmd.Source } else { $null })
)
$nodeCandidates = $nodeCandidates | Where-Object { -not [string]::IsNullOrWhiteSpace($_) }
$nodeExe = Resolve-ExistingPath -Label 'NODE' -Candidates $nodeCandidates

function Register-PfeTask {
  param(
    [Parameter(Mandatory = $true)][string]$TaskName,
    [Parameter(Mandatory = $true)][string]$Execute,
    [Parameter(Mandatory = $true)][string]$Arguments,
    [Parameter(Mandatory = $true)][string]$WorkingDirectory,
    [Parameter(Mandatory = $true)][int]$DelaySeconds,
    [Parameter(Mandatory = $true)][ValidateSet('system', 'user')][string]$Mode
  )

  $action = New-ScheduledTaskAction -Execute $Execute -Argument $Arguments -WorkingDirectory $WorkingDirectory
  $principal = $null

  if ($Mode -eq 'system') {
    $trigger = New-ScheduledTaskTrigger -AtStartup
    $principal = New-ScheduledTaskPrincipal -UserId 'SYSTEM' -LogonType ServiceAccount -RunLevel Highest
  } else {
    $currentUser = '{0}\{1}' -f $env:USERDOMAIN, $env:USERNAME
    $trigger = New-ScheduledTaskTrigger -AtLogOn -User $currentUser
    $principal = New-ScheduledTaskPrincipal -UserId $currentUser -LogonType Interactive -RunLevel Limited
  }

  $trigger.Delay = ('PT{0}S' -f $DelaySeconds)
  $settings = New-ScheduledTaskSettingsSet `
    -AllowStartIfOnBatteries `
    -DontStopIfGoingOnBatteries `
    -StartWhenAvailable `
    -MultipleInstances IgnoreNew `
    -RestartCount 999 `
    -RestartInterval (New-TimeSpan -Minutes 1)

  Register-ScheduledTask -TaskName $TaskName -Action $action -Trigger $trigger -Principal $principal -Settings $settings -Force -ErrorAction Stop | Out-Null
  Write-Host ("Registered ({0}): {1}" -f $Mode, $TaskName)
}

$tasks = @(
  @{ TaskName = 'PFE_BackendService'; Execute = $nodeExe; Arguments = 'server.js'; WorkingDirectory = $backendDir; DelaySeconds = 15 },
  @{ TaskName = 'PFE_AIInferenceService'; Execute = $pythonExe; Arguments = ('"{0}"' -f (Join-Path $pythonAiDir 'scripts\run_maintenance_inference.py')); WorkingDirectory = $pythonAiDir; DelaySeconds = 45 },
  @{ TaskName = 'PFE_AIRetrainScheduler'; Execute = $pythonExe; Arguments = ('"{0}"' -f (Join-Path $pythonAiDir 'scripts\run_retraining_scheduler.py')); WorkingDirectory = $pythonAiDir; DelaySeconds = 75 },
  @{ TaskName = 'PFE_AISupervisorService'; Execute = $pythonExe; Arguments = ('"{0}"' -f (Join-Path $pythonAiDir 'scripts\run_gsm_supervisor.py')); WorkingDirectory = $pythonAiDir; DelaySeconds = 105 }
)

$mode = 'system'
try {
  foreach ($task in $tasks) {
    Register-PfeTask @task -Mode $mode
  }
} catch {
  Write-Warning "SYSTEM task registration failed ($($_.Exception.Message)). Falling back to current-user tasks."
  $mode = 'user'
  foreach ($task in $tasks) {
    Register-PfeTask @task -Mode $mode
  }
}

if ($RunNow) {
  Start-ScheduledTask -TaskName 'PFE_BackendService'
  Start-ScheduledTask -TaskName 'PFE_AIInferenceService'
  Start-ScheduledTask -TaskName 'PFE_AIRetrainScheduler'
  Start-ScheduledTask -TaskName 'PFE_AISupervisorService'
  Write-Host 'Started tasks now.'
}

Write-Host 'Done.'
Write-Host ("Task mode: {0}" -f $mode)
Write-Host ("Python exe: {0}" -f $pythonExe)
Write-Host ("Node exe: {0}" -f $nodeExe)
Write-Host 'Check tasks with: Get-ScheduledTask -TaskName PFE_*'
