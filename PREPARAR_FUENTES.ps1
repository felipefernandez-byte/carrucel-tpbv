$ErrorActionPreference = "Stop"

$root = Split-Path -Parent $MyInvocation.MyCommand.Path
$target = Join-Path $root "public\fonts"
New-Item -ItemType Directory -Force -Path $target | Out-Null

$required = @(
  "KarolSans-Regular.otf",
  "KarolSans-SemiBold.otf",
  "KarolSans-Bold.otf",
  "KarolSans-Black.otf",
  "QuetzalliSans-Regular.otf",
  "QuetzalliSans-Medium.otf",
  "QuetzalliSans-Bold.otf",
  "QuetzalliSans-Black.otf",
  "TwogetherSans-Regular.otf",
  "TwogetherSans-Medium.otf",
  "TwogetherSans-Bold.otf"
)

$complete = $true

foreach ($name in $required) {
  if (-not (Test-Path (Join-Path $target $name))) {
    $complete = $false
    break
  }
}

if ($complete) {
  Write-Host "Fuentes TPBV: ya estan preparadas." -ForegroundColor Green
  exit 0
}

$candidates = @(
  (Join-Path $root "fonts.zip"),
  (Join-Path $root "fonts(3).zip"),
  (Join-Path $env:USERPROFILE "Downloads\fonts.zip"),
  (Join-Path $env:USERPROFILE "Downloads\fonts(3).zip"),
  (Join-Path $env:USERPROFILE "Documents\fonts.zip"),
  (Join-Path $env:USERPROFILE "Desktop\fonts.zip")
)

$zipPath = $null

foreach ($candidate in $candidates) {
  if (Test-Path $candidate) {
    $zipPath = $candidate
    break
  }
}

if (-not $zipPath) {
  Add-Type -AssemblyName System.Windows.Forms

  $dialog =
    New-Object System.Windows.Forms.OpenFileDialog

  $dialog.Title =
    "Selecciona el ZIP de tipografias TPBV"

  $dialog.Filter =
    "Archivos ZIP (*.zip)|*.zip"

  if (
    $dialog.ShowDialog() -eq
    [System.Windows.Forms.DialogResult]::OK
  ) {
    $zipPath = $dialog.FileName
  }
}

if (-not $zipPath) {
  Write-Host "No se encontro el ZIP de fuentes." -ForegroundColor Yellow
  Write-Host "Puedes volver a ejecutar este BAT antes de subir a GitHub."
  exit 0
}

Write-Host "Preparando tipografias desde: $zipPath" -ForegroundColor Cyan

$temp =
  Join-Path $env:TEMP (
    "tpbv_v5_fonts_" +
    [guid]::NewGuid().ToString("N")
  )

New-Item -ItemType Directory -Force -Path $temp |
  Out-Null

try {
  Expand-Archive `
    -LiteralPath $zipPath `
    -DestinationPath $temp `
    -Force

  $mapping = @{
    "KarolSans-Regular.otf"       = "*Karol_Sans_Regular.otf"
    "KarolSans-SemiBold.otf"      = "*Karol_Sans_SemiBold.otf"
    "KarolSans-Bold.otf"          = "*Karol_Sans_Bold.otf"
    "KarolSans-Black.otf"         = "*Karol_Sans_Black.otf"
    "QuetzalliSans-Regular.otf"   = "QuetzalliSans-Regular.otf"
    "QuetzalliSans-Medium.otf"    = "QuetzalliSans-Medium.otf"
    "QuetzalliSans-Bold.otf"      = "QuetzalliSans-Bold.otf"
    "QuetzalliSans-Black.otf"     = "QuetzalliSans-Black.otf"
    "TwogetherSans-Regular.otf"   = "TwogetherSans-Regular.otf"
    "TwogetherSans-Medium.otf"    = "TwogetherSans-Medium.otf"
    "TwogetherSans-Bold.otf"      = "TwogetherSans-Bold.otf"
  }

  foreach ($destName in $mapping.Keys) {
    $pattern = $mapping[$destName]

    $source =
      Get-ChildItem $temp -Recurse -File |
      Where-Object {
        $_.Name -like $pattern
      } |
      Select-Object -First 1

    if ($source) {
      Copy-Item `
        -LiteralPath $source.FullName `
        -Destination (
          Join-Path $target $destName
        ) `
        -Force
    }
  }

  Write-Host "Fuentes TPBV: preparadas correctamente." -ForegroundColor Green
}
finally {
  Remove-Item $temp `
    -Recurse `
    -Force `
    -ErrorAction SilentlyContinue
}
