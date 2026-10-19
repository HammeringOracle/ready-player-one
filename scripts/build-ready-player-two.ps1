$ErrorActionPreference = 'Stop'

$rp1Root = Split-Path -Parent $PSScriptRoot
$rp2Root = Join-Path $rp1Root 'companions\ready-player-two'
$manifest = Join-Path $rp2Root 'src-tauri\Cargo.toml'
$builtExecutable = Join-Path $rp2Root 'src-tauri\target\release\ready-player-two.exe'
$bundledExecutable = Join-Path $rp1Root 'ui\ready-player-two.exe'

if (-not (Test-Path -LiteralPath $manifest -PathType Leaf)) {
    throw "Ready Player Two source is incomplete: $manifest is missing."
}

Write-Host 'Building the embedded Ready Player Two source...'
& cargo build --release --manifest-path $manifest
if ($LASTEXITCODE -ne 0) {
    throw "Ready Player Two build failed with exit code $LASTEXITCODE."
}
if (-not (Test-Path -LiteralPath $builtExecutable -PathType Leaf)) {
    throw "The build completed without producing $builtExecutable."
}

Copy-Item -LiteralPath $builtExecutable -Destination $bundledExecutable -Force
$now = Get-Date
(Get-Item -LiteralPath $bundledExecutable).CreationTime = $now
(Get-Item -LiteralPath $bundledExecutable).LastWriteTime = $now

$hash = (Get-FileHash -LiteralPath $bundledExecutable -Algorithm SHA256).Hash
Write-Host "Ready Player Two is now bundled in RP1: $bundledExecutable"
Write-Host "SHA-256: $hash"
