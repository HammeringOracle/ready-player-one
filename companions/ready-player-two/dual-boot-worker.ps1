$ErrorActionPreference = 'Stop'
$stageRoot = Join-Path $env:ProgramData 'Ready Player Two\staging'
$binRoot = Join-Path $env:ProgramData 'Ready Player Two\bin'
$setupPath = Join-Path $binRoot 'setup.ps1'
$windowsBootIconPath = Join-Path $binRoot 'windows11.png'
$batoceraBootIconPath = Join-Path $binRoot 'batocera.png'
$requestPath = Join-Path $stageRoot 'install-request.json'
$resultPath = Join-Path $stageRoot 'install-result.json'
while ($true) {
    try {
        if (Test-Path -LiteralPath $requestPath -PathType Leaf) {
            $raw = [IO.File]::ReadAllText($requestPath)
            if ($raw.Length -gt 8192) { throw 'The RP1 install request is too large.' }
            $request = $raw | ConvertFrom-Json
            if ($request.schema -ne 1 -or $request.action -cne 'dual-boot-remote-install' -or [string]$request.targetComputerName -ine $env:COMPUTERNAME -or [string]$request.requestId -cnotmatch '^[0-9a-f-]{36}$') { throw 'The RP1 install request does not match this Windows PC.' }
            $privateRequest = Join-Path $binRoot ('request-' + $request.requestId + '.json')
            [IO.File]::WriteAllText($privateRequest,$raw,[Text.UTF8Encoding]::new($false))
            Move-Item -LiteralPath $requestPath -Destination (Join-Path $stageRoot ('request-' + $request.requestId + '.accepted.json')) -ErrorAction Stop
            [IO.File]::WriteAllText($resultPath,(@{ok=$false;phase='accepted';detail='RP2 accepted the install request and is rechecking the drive.';requestId=$request.requestId;updatedAt=(Get-Date).ToUniversalTime().ToString('o')} | ConvertTo-Json),[Text.UTF8Encoding]::new($false))
            try {
                & (Join-Path $PSHOME 'powershell.exe') -NoProfile -ExecutionPolicy Bypass -File $setupPath -RequestPath $privateRequest -ResultPath $resultPath -WindowsBootIconPath $windowsBootIconPath -BatoceraBootIconPath $batoceraBootIconPath | Out-Null
                if (-not (Test-Path -LiteralPath $resultPath -PathType Leaf)) { throw 'The RP2 installer returned no result.' }
                $result = Get-Content -LiteralPath $resultPath -Raw | ConvertFrom-Json
                $result | Add-Member -NotePropertyName requestId -NotePropertyValue $request.requestId -Force
                $result | Add-Member -NotePropertyName updatedAt -NotePropertyValue (Get-Date).ToUniversalTime().ToString('o') -Force
                [IO.File]::WriteAllText($resultPath,($result | ConvertTo-Json -Depth 8),[Text.UTF8Encoding]::new($false))
            } finally {
                Remove-Item -LiteralPath $privateRequest -Force -ErrorAction SilentlyContinue
            }
        }
    } catch {
        if (Test-Path -LiteralPath $requestPath -PathType Leaf) {
            try { Move-Item -LiteralPath $requestPath -Destination (Join-Path $stageRoot ('request-rejected-' + [guid]::NewGuid().ToString('N') + '.json')) -ErrorAction Stop } catch {}
        }
        try {
            [IO.File]::WriteAllText($resultPath,(@{ok=$false;phase='failed';error=$_.Exception.Message;updatedAt=(Get-Date).ToUniversalTime().ToString('o')} | ConvertTo-Json),[Text.UTF8Encoding]::new($false))
        } catch {}
    }
    Start-Sleep -Seconds 3
}
