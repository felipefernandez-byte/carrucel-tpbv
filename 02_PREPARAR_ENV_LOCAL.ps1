$ErrorActionPreference = "Stop"

$root =
  Split-Path -Parent $MyInvocation.MyCommand.Path

Add-Type -AssemblyName System.Windows.Forms

$dialog =
  New-Object System.Windows.Forms.OpenFileDialog

$dialog.Title =
  "Selecciona tu token.json de Google Drive"

$dialog.Filter =
  "token.json|token.json|Archivos JSON (*.json)|*.json"

if (
  $dialog.ShowDialog() -ne
  [System.Windows.Forms.DialogResult]::OK
) {
  Write-Host "Cancelado."
  exit 0
}

$token =
  Get-Content `
    -Raw `
    -LiteralPath $dialog.FileName |
  ConvertFrom-Json

if (
  -not $token.client_id -or
  -not $token.client_secret -or
  -not $token.refresh_token
) {
  throw "El token.json no contiene client_id, client_secret y refresh_token."
}

$envPath =
  Join-Path $root ".env.local"

@(
  "GOOGLE_CLIENT_ID=$($token.client_id)"
  "GOOGLE_CLIENT_SECRET=$($token.client_secret)"
  "GOOGLE_REFRESH_TOKEN=$($token.refresh_token)"
) |
  Set-Content `
    -LiteralPath $envPath `
    -Encoding UTF8

Write-Host ""
Write-Host ".env.local creado." -ForegroundColor Green
Write-Host "NO lo subas a GitHub."
Write-Host ""
Write-Host "En Vercel debes crear estas 3 variables:"
Write-Host " GOOGLE_CLIENT_ID"
Write-Host " GOOGLE_CLIENT_SECRET"
Write-Host " GOOGLE_REFRESH_TOKEN"
