$ErrorActionPreference = "SilentlyContinue"

Write-Host ""
Write-Host "==============================================" -ForegroundColor Cyan
Write-Host " TPBV - DIAGNOSTICO DE IA LOCAL" -ForegroundColor Cyan
Write-Host "==============================================" -ForegroundColor Cyan

$computer = Get-CimInstance Win32_ComputerSystem
$cpu = Get-CimInstance Win32_Processor | Select-Object -First 1
$ramGB = [math]::Round($computer.TotalPhysicalMemory / 1GB, 1)

Write-Host ("CPU: " + $cpu.Name)
Write-Host ("RAM: " + $ramGB + " GB")

$gpuFound = $false
$gpuMemoryMB = 0
if (Get-Command nvidia-smi -ErrorAction SilentlyContinue) {
    $gpuInfo = & nvidia-smi --query-gpu=name,memory.total --format=csv,noheader,nounits 2>$null | Select-Object -First 1
    if ($gpuInfo) {
        $parts = $gpuInfo -split ",", 2
        $gpuName = $parts[0].Trim()
        [int]::TryParse($parts[1].Trim(), [ref]$gpuMemoryMB) | Out-Null
        $gpuFound = $true
        Write-Host ("GPU NVIDIA: " + $gpuName)
        Write-Host ("VRAM: " + [math]::Round($gpuMemoryMB / 1024, 1) + " GB")
    }
} else {
    Write-Host "GPU NVIDIA: no detectada por nvidia-smi"
}

Write-Host ""
if ($ramGB -ge 16) {
    Write-Host "Recomendacion: Qwen2.5-VL 7B es viable para probar." -ForegroundColor Green
} elseif ($ramGB -ge 8) {
    Write-Host "Recomendacion: Qwen2.5-VL 7B puede ir lento; prueba primero pocas fotos." -ForegroundColor Yellow
} else {
    Write-Host "Recomendacion: la RAM es limitada para Qwen2.5-VL 7B." -ForegroundColor Yellow
}

if ($gpuFound -and $gpuMemoryMB -ge 6000) {
    Write-Host "La GPU puede ayudar bastante con el modelo 7B." -ForegroundColor Green
} elseif ($gpuFound) {
    Write-Host "Ollama puede repartir carga entre GPU y RAM; el proceso puede ser mas lento." -ForegroundColor Yellow
}

Write-Host ""
if (-not (Get-Command ollama -ErrorAction SilentlyContinue)) {
    Write-Host "OLLAMA: NO INSTALADO" -ForegroundColor Red
    Write-Host "Instala Ollama desde su sitio oficial y vuelve a ejecutar este archivo."
    Write-Host "https://ollama.com/download"
    exit 2
}

Write-Host ("Ollama: " + (& ollama --version)) -ForegroundColor Green

try {
    $tags = Invoke-RestMethod -Uri "http://127.0.0.1:11434/api/tags" -Method Get -TimeoutSec 4
} catch {
    Write-Host "Ollama esta instalado, pero el servicio no responde." -ForegroundColor Yellow
    Write-Host "Abre Ollama y vuelve a ejecutar este diagnostico."
    exit 3
}

$modelName = "qwen2.5vl:7b"
$modelInstalled = $false
foreach ($model in $tags.models) {
    if ($model.name -eq $modelName -or $model.model -eq $modelName) {
        $modelInstalled = $true
        break
    }
}

if ($modelInstalled) {
    Write-Host ("Modelo " + $modelName + ": INSTALADO") -ForegroundColor Green
} else {
    Write-Host ("Modelo " + $modelName + ": NO INSTALADO") -ForegroundColor Yellow
    Write-Host "Para descargarlo ejecuta:"
    Write-Host ("ollama pull " + $modelName) -ForegroundColor Cyan
}

Write-Host ""
Write-Host "Diagnostico terminado. No se analizo ni envio ninguna fotografia." -ForegroundColor Green
Write-Host ""
