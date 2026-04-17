$scriptRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
$projectRoot = Split-Path -Parent (Split-Path -Parent $scriptRoot)
$pythonAiDir = Join-Path $projectRoot "python-ai"

function Resolve-PythonExe {
  $candidates = @(
    $env:PFE_PYTHON_EXE,
    "C:\Users\dell\AppData\Local\Programs\Python\Python314\python.exe",
    "C:\Program Files\Python314\python.exe",
    "C:\Program Files\Python313\python.exe",
    "C:\Program Files\Python312\python.exe",
    "C:\Python314\python.exe",
    "C:\Python313\python.exe",
    "C:\Python312\python.exe"
  ) | Where-Object { $_ }

  foreach ($candidate in $candidates) {
    if (Test-Path -LiteralPath $candidate) {
      return (Resolve-Path -LiteralPath $candidate).Path
    }
  }

  $pythonCmd = Get-Command python.exe -ErrorAction SilentlyContinue
  if ($pythonCmd -and $pythonCmd.Source -notmatch 'WindowsApps') {
    return $pythonCmd.Source
  }

  $userPythonRoot = Join-Path $env:LOCALAPPDATA "Programs\Python"
  if (Test-Path -LiteralPath $userPythonRoot) {
    $found = Get-ChildItem -LiteralPath $userPythonRoot -Recurse -Filter python.exe -ErrorAction SilentlyContinue |
      Select-Object -ExpandProperty FullName -First 1
    if ($found) { return $found }
  }

  throw "Python executable not found. Set PFE_PYTHON_EXE or install CPython."
}

$pythonExe = Resolve-PythonExe
$logDir = Join-Path $pythonAiDir "logs"
$logFile = Join-Path $logDir "auto_rules_scheduler.log"
if (-not (Test-Path -LiteralPath $logDir)) {
  New-Item -ItemType Directory -Path $logDir -Force | Out-Null
}

Set-Location -LiteralPath $pythonAiDir
& $pythonExe (Join-Path $pythonAiDir "auto_rules_scheduler.py") *>> $logFile
exit $LASTEXITCODE
