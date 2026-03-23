param(
  [string]$BackendHost = "127.0.0.1",
  [int]$BackendPort = 7860,
  [string]$FrontendCommand = "npm run dev"
)

function Wait-ForTcpPort {
  param(
    [string]$Host,
    [int]$Port,
    [int]$TimeoutSeconds = 60
  )

  $deadline = (Get-Date).AddSeconds($TimeoutSeconds)
  while ((Get-Date) -lt $deadline) {
    try {
      $res = Test-NetConnection -ComputerName $Host -Port $Port -WarningAction SilentlyContinue
      if ($res.TcpTestSucceeded) { return $true }
    } catch {
      # ignore
    }
    Start-Sleep -Milliseconds 500
  }
  return $false
}

Write-Host "Starting backend (FastAPI) on $BackendHost`:$BackendPort ..."

$backendArgs = @(
  "-m", "uvicorn", "backend.server:app",
  "--host", $BackendHost,
  "--port", $BackendPort
)

$backendProc = Start-Process -FilePath "python" -ArgumentList $backendArgs -PassThru -WindowStyle Normal

Write-Host "Waiting for backend to be reachable ..."
$ok = Wait-ForTcpPort -Host $BackendHost -Port $BackendPort -TimeoutSeconds 90
if (-not $ok) {
  Write-Error "Backend did not start in time. Check console output above."
  exit 1
}

Write-Host "Starting frontend ..."
Start-Process -FilePath "powershell" -ArgumentList "-NoProfile -Command $FrontendCommand" -WindowStyle Normal

Write-Host "Direct pipeline started. Use the UI to launch `/api/set-source`."
Write-Host "Tip: stop processes manually if needed."

