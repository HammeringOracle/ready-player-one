$ErrorActionPreference='Stop'
$root=Split-Path -Parent $PSScriptRoot
$project=Join-Path $root 'companions\dual-boot-undo'
& cargo build --release --manifest-path (Join-Path $project 'Cargo.toml')
if($LASTEXITCODE -ne 0){throw "Dual Boot Undo build failed with exit code $LASTEXITCODE."}
$source=Join-Path $project 'target\release\dual-boot-undo.exe'
$destination=Join-Path $root 'ui\dual-boot-undo.exe'
if(-not(Test-Path -LiteralPath $source -PathType Leaf)){throw 'Dual Boot Undo executable was not produced.'}
Copy-Item -LiteralPath $source -Destination $destination -Force
Write-Host "Dual Boot Undo is now bundled in RP1: $destination"
