$ErrorActionPreference = "Stop"

$root =
  Split-Path -Parent $MyInvocation.MyCommand.Path

Add-Type -AssemblyName System.Windows.Forms

$dialog =
  New-Object System.Windows.Forms.OpenFileDialog

$dialog.Title =
  "Selecciona el NUEVO catalogo generado por la reorganizacion SHA-256"

$dialog.Filter =
  "Catalogo CSV (*.csv)|*.csv"

if (
  $dialog.ShowDialog() -ne
  [System.Windows.Forms.DialogResult]::OK
) {
  Write-Host "Cancelado."
  exit 0
}

$source = $dialog.FileName
$destination =
  Join-Path $root "data\catalogo_carrusel.csv"

Write-Host ""
Write-Host "Archivo seleccionado:" -ForegroundColor Cyan
Write-Host $source
Write-Host ""

$firstLine =
  Get-Content `
    -LiteralPath $source `
    -TotalCount 1

$required = @(
  "foto_id",
  "drive_file_id",
  "tipo_asociacion",
  "municipio",
  "localidad",
  "localidades_relacionadas",
  "tipo_reporte",
  "usuario_origen",
  "mostrar_carrusel"
)

$missing = @()

foreach ($column in $required) {
  if ($firstLine -notmatch "(^|,)$column(,|$)") {
    $missing += $column
  }
}

if ($missing.Count -gt 0) {
  Write-Host "ERROR: El archivo no parece ser el catalogo esperado." -ForegroundColor Red
  Write-Host "Faltan columnas:"
  $missing | ForEach-Object {
    Write-Host " - $_"
  }
  exit 1
}

Copy-Item `
  -LiteralPath $source `
  -Destination $destination `
  -Force

Write-Host "Catalogo copiado correctamente." -ForegroundColor Green
Write-Host ""
Write-Host "Generando indice para Vercel..."

Push-Location $root

try {
  npm run build

  if ($LASTEXITCODE -ne 0) {
    throw "npm run build termino con error."
  }
}
finally {
  Pop-Location
}

Write-Host ""
Write-Host "NUEVO CATALOGO LISTO PARA GITHUB / VERCEL." -ForegroundColor Green
