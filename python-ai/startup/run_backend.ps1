$scriptRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
$projectRoot = Split-Path -Parent (Split-Path -Parent $scriptRoot)
$backendDir = Join-Path $projectRoot "backend"

function Resolve-NpmExe {
  $candidates = @(
    $env:PFE_NPM_EXE,
    "C:\Program Files\nodejs\npm.cmd",
    "C:\Program Files\nodejs\npm.exe"
  ) | Where-Object { $_ }

  foreach ($candidate in $candidates) {
    if (Test-Path -LiteralPath $candidate) {
      return (Resolve-Path -LiteralPath $candidate).Path
    }
  }

  $npmCmd = Get-Command npm.cmd -ErrorAction SilentlyContinue
  if ($npmCmd) { return $npmCmd.Source }

  throw "npm executable not found. Set PFE_NPM_EXE or install Node.js."
}

$npmExe = Resolve-NpmExe
$logDir = Join-Path $projectRoot "python-ai\logs"
$logFile = Join-Path $logDir "backend.log"
if (-not (Test-Path -LiteralPath $logDir)) {
  New-Item -ItemType Directory -Path $logDir -Force | Out-Null
}

Set-Location -LiteralPath $backendDir
& $npmExe run start *>> $logFile
exit $LASTEXITCODE
