param([Parameter(Mandatory)][string]$RequestPath, [Parameter(Mandatory)][string]$ResultPath)
$ErrorActionPreference = 'Stop'
$log = [System.Collections.Generic.List[string]]::new()
$loginVerified = $null
$loginWarning = ''
function Finish($value) {
    [IO.File]::WriteAllText($ResultPath, ($value | ConvertTo-Json -Depth 8), [Text.UTF8Encoding]::new($false))
}
function Get-HomeNetworks {
    $ipv4 = @(Get-NetIPAddress -AddressFamily IPv4 -ErrorAction SilentlyContinue | Where-Object {
        $_.IPAddress -notlike '127.*' -and $_.IPAddress -notlike '169.254.*' -and
        $_.IPAddress -ne '0.0.0.0' -and $_.InterfaceIndex -gt 0
    })
    $profiles = @(Get-NetConnectionProfile -ErrorAction SilentlyContinue)
    $adapters = @(Get-NetAdapter -ErrorAction SilentlyContinue | Where-Object Status -eq 'Up')
    $networks = foreach ($group in ($ipv4 | Group-Object InterfaceIndex)) {
        $index = [int]$group.Name
        $adapter = $adapters | Where-Object InterfaceIndex -eq $index | Select-Object -First 1
        if ($adapters.Count -and -not $adapter) { continue }
        $profile = $profiles | Where-Object InterfaceIndex -eq $index | Select-Object -First 1
        $alias = if ($adapter) { [string]$adapter.Name } else { [string]$group.Group[0].InterfaceAlias }
        [pscustomobject]@{
            index = $index
            name = $alias
            category = if ($profile) { [string]$profile.NetworkCategory } else { 'Unidentified' }
            addresses = @($group.Group | Select-Object -ExpandProperty IPAddress)
        }
    }
    return @($networks | Sort-Object @{Expression={
        $virtual = $_.name -match '(?i)tailscale|vpn|nord|virtual|vEthernet|hyper-v|loopback|docker|wsl'
        $homeAddress = @($_.addresses | Where-Object { $_ -match '^192\.168\.|^10\.|^172\.(1[6-9]|2\d|3[01])\.' }).Count -gt 0
        if ($homeAddress -and -not $virtual) { 0 } elseif (-not $virtual) { 1 } else { 2 }
    }},name)
}
function Resolve-InstallationFolder([string]$Platform, [string]$RequestedFolder) {
    $default = switch ($Platform) {
        'retroarch' { 'C:\RetroArch' }
        'esde' { Join-Path $env:USERPROFILE 'ROMs' }
        'emustation' { 'C:\Emu-Station' }
        default { 'C:\RetroBat' }
    }
    $selected = if ($RequestedFolder) { $RequestedFolder } else { $default }
    # Only auto-resolve the default. Never override a user's custom location.
    if ($Platform -eq 'retroarch' -and $selected.TrimEnd('\') -ieq $default) {
        foreach ($candidate in @('C:\RetroArch','C:\RetroArch-Win64')) {
            if (Test-Path -LiteralPath (Join-Path $candidate 'retroarch.exe') -PathType Leaf) { return $candidate }
        }
    }
    return $selected
}
function Get-PlatformConfig([string]$Platform, [string]$Folder) {
    switch ($Platform) {
        'retrobat' { return @{ shareName='RetroBat'; marker='retrobat.exe'; library=(Join-Path $Folder 'roms'); createLibrary=$false } }
        'retroarch' { return @{ shareName='RetroArch'; marker='retroarch.exe'; library=(Join-Path $Folder 'roms'); createLibrary=$true } }
        'esde' { return @{ shareName='ROMs'; marker='systems.txt'; library=$Folder; createLibrary=$false } }
        'emustation' { return @{ shareName='Emu-Station'; marker=''; library=(Join-Path $Folder 'roms'); createLibrary=$true } }
        default { throw 'Choose RetroBat, RetroArch, ES-DE, or Emu-Station.' }
    }
}
function Find-InstalledExecutable([string]$ExeName, [string]$DisplayPattern, [string[]]$Candidates) {
    foreach ($candidate in $Candidates) {
        if ($candidate -and (Test-Path -LiteralPath $candidate -PathType Leaf)) { return (Resolve-Path -LiteralPath $candidate).ProviderPath }
    }
    $processName = [IO.Path]::GetFileNameWithoutExtension($ExeName)
    $running = Get-Process -Name $processName -ErrorAction SilentlyContinue | Select-Object -First 1
    if ($running.Path -and (Test-Path -LiteralPath $running.Path -PathType Leaf)) { return $running.Path }
    foreach ($registryRoot in @(
        'HKCU:\Software\Microsoft\Windows\CurrentVersion\App Paths',
        'HKLM:\Software\Microsoft\Windows\CurrentVersion\App Paths',
        'HKLM:\Software\WOW6432Node\Microsoft\Windows\CurrentVersion\App Paths'
    )) {
        $appPath = Join-Path $registryRoot $ExeName
        $registered = Get-ItemPropertyValue -LiteralPath $appPath -Name '(default)' -ErrorAction SilentlyContinue
        if ($registered -and (Test-Path -LiteralPath $registered -PathType Leaf)) { return (Resolve-Path -LiteralPath $registered).ProviderPath }
    }
    foreach ($uninstallRoot in @(
        'HKCU:\Software\Microsoft\Windows\CurrentVersion\Uninstall',
        'HKLM:\Software\Microsoft\Windows\CurrentVersion\Uninstall',
        'HKLM:\Software\WOW6432Node\Microsoft\Windows\CurrentVersion\Uninstall'
    )) {
        foreach ($entry in Get-ChildItem -LiteralPath $uninstallRoot -ErrorAction SilentlyContinue) {
            $details = Get-ItemProperty -LiteralPath $entry.PSPath -ErrorAction SilentlyContinue
            if ([string]$details.DisplayName -notmatch $DisplayPattern) { continue }
            foreach ($registered in @($details.DisplayIcon, $(if ($details.InstallLocation) { Join-Path $details.InstallLocation $ExeName }))) {
                $registered = ([string]$registered).Trim('"') -replace ',\d+$',''
                if ($registered -and (Test-Path -LiteralPath $registered -PathType Leaf)) { return (Resolve-Path -LiteralPath $registered).ProviderPath }
            }
        }
    }
    $shell = New-Object -ComObject WScript.Shell
    foreach ($shortcutRoot in @(
        [Environment]::GetFolderPath('Desktop'),
        [Environment]::GetFolderPath('CommonDesktopDirectory'),
        [Environment]::GetFolderPath('StartMenu'),
        [Environment]::GetFolderPath('CommonStartMenu')
    )) {
        foreach ($shortcut in Get-ChildItem -LiteralPath $shortcutRoot -Filter '*.lnk' -File -Recurse -ErrorAction SilentlyContinue) {
            try { $target = $shell.CreateShortcut($shortcut.FullName).TargetPath } catch { continue }
            if ([IO.Path]::GetFileName($target) -ieq $ExeName -and (Test-Path -LiteralPath $target -PathType Leaf)) { return (Resolve-Path -LiteralPath $target).ProviderPath }
        }
    }
    return $null
}
function Get-InstalledPrograms {
    $found = [System.Collections.Generic.List[object]]::new()
    $retrobatExe = Find-InstalledExecutable 'retrobat.exe' '^RetroBat' @('C:\RetroBat\retrobat.exe',(Join-Path $env:LOCALAPPDATA 'RetroBat\retrobat.exe'))
    if ($retrobatExe) { $found.Add([pscustomobject]@{ platform='retrobat'; name='RetroBat'; folder=(Split-Path -Parent $retrobatExe) }) }
    $retroarchExe = Find-InstalledExecutable 'retroarch.exe' '^RetroArch' @(
        'C:\RetroArch\retroarch.exe','C:\RetroArch-Win64\retroarch.exe',
        (Join-Path $env:ProgramFiles 'RetroArch\retroarch.exe'),
        (Join-Path ${env:ProgramFiles(x86)} 'RetroArch\retroarch.exe'),
        (Join-Path $env:LOCALAPPDATA 'Programs\RetroArch\retroarch.exe'),
        (Join-Path $env:LOCALAPPDATA 'RetroArch\retroarch.exe')
    )
    if ($retroarchExe) { $found.Add([pscustomobject]@{ platform='retroarch'; name='RetroArch'; folder=(Split-Path -Parent $retroarchExe) }) }
    $emuExe = Find-InstalledExecutable 'Emu-Station.exe' 'Emu.?Station' @('C:\Emu-Station\Emu-Station.exe','C:\EmulationStation\Emu-Station.exe')
    if ($emuExe) { $found.Add([pscustomobject]@{ platform='emustation'; name='Emu-Station'; folder=(Split-Path -Parent $emuExe) }) }
    $esdeInstalled = Find-InstalledExecutable 'ES-DE.exe' '^ES-DE' @(
        'C:\ES-DE\ES-DE.exe',
        (Join-Path $env:LOCALAPPDATA 'ES-DE\ES-DE.exe'),
        (Join-Path $env:ProgramFiles 'ES-DE\ES-DE.exe')
    )
    $roms = Join-Path $env:USERPROFILE 'ROMs'
    if ($esdeInstalled -and (Test-Path -LiteralPath $roms -PathType Container)) { $found.Add([pscustomobject]@{ platform='esde'; name='ES-DE'; folder=$roms }) }
    return @($found)
}
function Send-RP1Announcement([object[]]$Programs, [int]$InterfaceIndex, [string]$Account='') {
    $payload = @{kind='ready-player-two'; version=2; computer=$env:COMPUTERNAME; platforms=@($Programs.platform); account=$Account} | ConvertTo-Json -Compress
    $bytes = [Text.Encoding]::UTF8.GetBytes($payload)
    $addresses = if ($InterfaceIndex -gt 0) {
        @(Get-NetIPAddress -InterfaceIndex $InterfaceIndex -AddressFamily IPv4 -ErrorAction SilentlyContinue | Where-Object { $_.IPAddress -notlike '169.254.*' -and $_.IPAddress -notlike '127.*' })
    } else {
        @(Get-NetIPAddress -AddressFamily IPv4 -ErrorAction SilentlyContinue | Where-Object { $_.IPAddress -notlike '169.254.*' -and $_.IPAddress -notlike '127.*' -and $_.PrefixOrigin -ne 'WellKnown' })
    }
    foreach ($address in $addresses) {
        $ipBytes = ([Net.IPAddress]::Parse($address.IPAddress)).GetAddressBytes()
        $remaining = [int]$address.PrefixLength
        $broadcastBytes = [byte[]]::new(4)
        for ($index=0; $index -lt 4; $index++) {
            $bits = [Math]::Max(0,[Math]::Min(8,$remaining)); $remaining -= $bits
            $mask = if ($bits -eq 0) { 0 } else { (0xff -shl (8-$bits)) -band 0xff }
            $broadcastBytes[$index] = ($ipBytes[$index] -bor ((-bnot $mask) -band 0xff))
        }
        $broadcast = [Net.IPAddress]::new($broadcastBytes).ToString()
        $client = [Net.Sockets.UdpClient]::new()
        try {
            $client.EnableBroadcast = $true
            $client.Client.Bind([Net.IPEndPoint]::new([Net.IPAddress]::Parse($address.IPAddress),0))
            [void]$client.Send($bytes,$bytes.Length,$broadcast,8790)
        } finally { $client.Dispose() }
    }
}
function Install-RP1Beacon([object[]]$Programs, [string]$Account) {
    $beaconRoot = Join-Path $env:ProgramData 'Ready Player Two'
    $beaconPath = Join-Path $beaconRoot 'discovery-beacon.ps1'
    $configPath = Join-Path $beaconRoot 'discovery.json'
    New-Item -ItemType Directory -Path $beaconRoot -Force | Out-Null
    $config = @{ kind='ready-player-two'; version=2; computer=$env:COMPUTERNAME; platforms=@($Programs.platform | Sort-Object -Unique); account=$Account }
    [IO.File]::WriteAllText($configPath, ($config | ConvertTo-Json -Depth 4), [Text.UTF8Encoding]::new($false))
    $beacon = @'
$ErrorActionPreference = 'SilentlyContinue'
$configPath = Join-Path $env:ProgramData 'Ready Player Two\discovery.json'
while ($true) {
    try {
        $payload = Get-Content -LiteralPath $configPath -Raw | ConvertFrom-Json
        $payload.computer = $env:COMPUTERNAME
        $bytes = [Text.Encoding]::UTF8.GetBytes(($payload | ConvertTo-Json -Compress))
        $addresses = @(Get-NetIPAddress -AddressFamily IPv4 | Where-Object {
            $_.IPAddress -notlike '127.*' -and $_.IPAddress -notlike '169.254.*' -and $_.PrefixOrigin -ne 'WellKnown'
        })
        foreach ($address in $addresses) {
            $ipBytes = ([Net.IPAddress]::Parse($address.IPAddress)).GetAddressBytes()
            $remaining = [int]$address.PrefixLength
            $broadcastBytes = [byte[]]::new(4)
            for ($index=0; $index -lt 4; $index++) {
                $bits = [Math]::Max(0,[Math]::Min(8,$remaining)); $remaining -= $bits
                $mask = if ($bits -eq 0) { 0 } else { (0xff -shl (8-$bits)) -band 0xff }
                $broadcastBytes[$index] = ($ipBytes[$index] -bor ((-bnot $mask) -band 0xff))
            }
            $client = [Net.Sockets.UdpClient]::new()
            try {
                $client.EnableBroadcast = $true
                $client.Client.Bind([Net.IPEndPoint]::new([Net.IPAddress]::Parse($address.IPAddress),0))
                foreach ($destination in @([Net.IPAddress]::new($broadcastBytes).ToString(),'255.255.255.255')) {
                    [void]$client.Send($bytes,$bytes.Length,$destination,8790)
                }
            } finally { $client.Dispose() }
        }
    } catch {}
    Start-Sleep -Seconds 10
}
'@
    [IO.File]::WriteAllText($beaconPath, $beacon, [Text.UTF8Encoding]::new($false))
    $taskName = 'Ready Player Two Discovery Beacon'
    $action = New-ScheduledTaskAction -Execute (Join-Path $PSHOME 'powershell.exe') -Argument "-NoProfile -WindowStyle Hidden -ExecutionPolicy Bypass -File `"$beaconPath`""
    $trigger = New-ScheduledTaskTrigger -AtStartup
    $principal = New-ScheduledTaskPrincipal -UserId 'SYSTEM' -LogonType ServiceAccount -RunLevel Highest
    $settings = New-ScheduledTaskSettingsSet -RestartCount 5 -RestartInterval (New-TimeSpan -Minutes 1) -ExecutionTimeLimit ([TimeSpan]::Zero)
    Register-ScheduledTask -TaskName $taskName -Action $action -Trigger $trigger -Principal $principal -Settings $settings -Force | Out-Null
    Start-ScheduledTask -TaskName $taskName
}
function Get-DualBootPreflight {
        $windowsLetter = $env:SystemDrive.TrimEnd(':')
        $windowsPartition = Get-Partition -DriveLetter $windowsLetter -ErrorAction Stop
        $windowsDisk = Get-Disk -Number $windowsPartition.DiskNumber -ErrorAction Stop
        $windowsVolume = Get-Volume -DriveLetter $windowsLetter -ErrorAction Stop
        $supportedSize = Get-PartitionSupportedSize -DriveLetter $windowsLetter -ErrorAction Stop
        $diskPartitions = @(Get-Partition -DiskNumber $windowsDisk.Number -ErrorAction Stop | Sort-Object Offset | ForEach-Object {
            [pscustomobject]@{number=$_.PartitionNumber;driveLetter=[string]$_.DriveLetter;type=[string]$_.Type;gptType=[string]$_.GptType;offsetBytes=[int64]$_.Offset;sizeBytes=[int64]$_.Size;isBoot=[bool]$_.IsBoot;isSystem=[bool]$_.IsSystem}
        })
        $encryption = 'Unknown'
        if (Get-Command Get-BitLockerVolume -ErrorAction SilentlyContinue) {
            try {
                $bitlocker = Get-BitLockerVolume -MountPoint "$windowsLetter`:" -ErrorAction Stop
                $encryption = [string]$bitlocker.ProtectionStatus
            } catch { $encryption = "Could not verify: $($_.Exception.Message)" }
        }
        $secureBoot = 'Unknown'
        if (Get-Command Confirm-SecureBootUEFI -ErrorAction SilentlyContinue) {
            try { $secureBoot = [string](Confirm-SecureBootUEFI -ErrorAction Stop) } catch { $secureBoot = "Could not verify: $($_.Exception.Message)" }
        }
        $firmwareCode = (Get-ItemProperty -LiteralPath 'HKLM:\SYSTEM\CurrentControlSet\Control' -Name PEFirmwareType -ErrorAction SilentlyContinue).PEFirmwareType
        $firmwareType = switch ($firmwareCode) { 1 {'BIOS'} 2 {'UEFI'} default {'Unknown'} }
        return @{ok=$true; capturedAt=(Get-Date).ToUniversalTime().ToString('o'); computer=$env:COMPUTERNAME; windowsDrive="$windowsLetter`:"; diskNumber=[int]$windowsDisk.Number; diskSizeBytes=[int64]$windowsDisk.Size; partitionStyle=[string]$windowsDisk.PartitionStyle; busType=[string]$windowsDisk.BusType; logicalSectorSize=[int]$windowsDisk.LogicalSectorSize; physicalSectorSize=[int]$windowsDisk.PhysicalSectorSize; diskReadOnly=[bool]$windowsDisk.IsReadOnly; diskOffline=[bool]$windowsDisk.IsOffline; firmwareType=$firmwareType; windowsFileSystem=[string]$windowsVolume.FileSystem; windowsPartitionNumber=[int]$windowsPartition.PartitionNumber; windowsPartitionSizeBytes=[int64]$windowsPartition.Size; windowsUsedBytes=[int64]($windowsVolume.Size - $windowsVolume.SizeRemaining); windowsFreeBytes=[int64]$windowsVolume.SizeRemaining; smallestSupportedWindowsSizeBytes=[int64]$supportedSize.SizeMin; largestSupportedWindowsSizeBytes=[int64]$supportedSize.SizeMax; bitLockerProtection=$encryption; secureBoot=$secureBoot; partitions=$diskPartitions; installReady=$false; reason='Inspection only. Shared-drive installation is not available in this RP2 build.'}
}
function Install-RP2StatusShare([string]$Account,[int]$InterfaceIndex,[bool]$MakePrivate) {
    if (-not ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) { throw 'Administrator approval is required to publish the RP2 status report.' }
    $profile = Get-NetConnectionProfile -InterfaceIndex $InterfaceIndex -ErrorAction Stop
    if ($profile.NetworkCategory -eq 'DomainAuthenticated') { throw 'A domain network cannot be configured by RP2.' }
    if ($profile.NetworkCategory -ne 'Private') {
        if (-not $MakePrivate) { throw 'Confirm this is a trusted private network before sharing RP2 status.' }
        Set-NetConnectionProfile -InterfaceIndex $InterfaceIndex -NetworkCategory Private
    }
    $sid = ([Security.Principal.NTAccount]::new($Account)).Translate([Security.Principal.SecurityIdentifier])
    if ($sid.Value -in @('S-1-1-0','S-1-5-11','S-1-5-32-545','S-1-5-32-546')) { throw 'Choose a specific Windows account for RP2 status access.' }
    $folder = Join-Path $env:ProgramData 'Ready Player Two\status'
    New-Item -ItemType Directory -Path $folder -Force | Out-Null
    $report = Get-DualBootPreflight
    [IO.File]::WriteAllText((Join-Path $folder 'preflight.json'),($report | ConvertTo-Json -Depth 8),[Text.UTF8Encoding]::new($false))
    $share = Get-SmbShare -Name 'RP2Status' -ErrorAction SilentlyContinue
    if ($share -and [IO.Path]::GetFullPath($share.Path).TrimEnd('\') -ine [IO.Path]::GetFullPath($folder).TrimEnd('\')) { throw 'The RP2Status share name is already used by another folder. No share was changed.' }
    if ($share) {
        $broadGrant = @(Get-SmbShareAccess -Name 'RP2Status' | Where-Object {
            $_.AccessControlType -eq 'Allow' -and $_.AccountName -match '(^Everyone$|Authenticated Users$|\\Users$|\\Guests$)'
        })
        if ($broadGrant.Count) { throw 'RP2Status has broad share permissions. Remove those permissions before RP2 can use it for a drive report.' }
    }
    if (-not $share) { New-SmbShare -Name 'RP2Status' -Path $folder -ReadAccess $Account -FolderEnumerationMode AccessBased -CachingMode None | Out-Null }
    else { Grant-SmbShareAccess -Name 'RP2Status' -AccountName $Account -AccessRight Read -Force | Out-Null }
    $acl = Get-Acl -LiteralPath $folder
    $rule = [Security.AccessControl.FileSystemAccessRule]::new($sid,'ReadAndExecute','ContainerInherit,ObjectInherit','None','Allow')
    $acl.SetAccessRule($rule)
    Set-Acl -LiteralPath $folder -AclObject $acl
    $reportPath = Join-Path $folder 'preflight.json'
    $reportAcl = Get-Acl -LiteralPath $reportPath
    $reportAcl.SetAccessRule([Security.AccessControl.FileSystemAccessRule]::new($sid,'Read','Allow'))
    Set-Acl -LiteralPath $reportPath -AclObject $reportAcl
    $ruleName = 'ReadyPlayerTwo-Status-SMB'
    if (-not (Get-NetFirewallRule -Name $ruleName -ErrorAction SilentlyContinue)) {
        New-NetFirewallRule -Name $ruleName -DisplayName 'Ready Player Two - status report - Private LAN' -Direction Inbound -Action Allow -Protocol TCP -LocalPort 445 -Profile Private -RemoteAddress LocalSubnet | Out-Null
    }
}
try {
    $request = Get-Content -LiteralPath $RequestPath -Raw | ConvertFrom-Json
    if ($request.action -eq 'dual-boot-preflight') {
        $report = Get-DualBootPreflight
        $statusFile = Join-Path $env:ProgramData 'Ready Player Two\status\preflight.json'
        if (Test-Path -LiteralPath (Split-Path -Parent $statusFile) -PathType Container) { [IO.File]::WriteAllText($statusFile,($report | ConvertTo-Json -Depth 8),[Text.UTF8Encoding]::new($false)) }
        Finish $report
        exit
    }
    if ([string]$request.platform -eq 'all') {
        $programs = @(Get-InstalledPrograms)
        if (-not $programs.Count) {
            if ($request.action -eq 'status') {
                $networks = @(Get-HomeNetworks)
                Finish @{ok=$true; computer=$env:COMPUTERNAME; account=[Security.Principal.WindowsIdentity]::GetCurrent().Name; detected=@(); shares=@(); networks=$networks; blankPasswordAllowed=$false}
            } else {
                $account = ([string]$request.account).Trim()
                Install-RP2StatusShare $account ([int]$request.interfaceIndex) ([bool]$request.makePrivate)
                Install-RP1Beacon @() $account
                Send-RP1Announcement @() ([int]$request.interfaceIndex) $account
                Finish @{ok=$true; computer=$env:COMPUTERNAME; account=$account; log=@('Windows discovery installed. This PC now announces its name to Ready Player One.','Read-only RP2Status share installed for this account. Shared Dual Boot installation is not enabled.'); paths=@(); detected=@(); shares=@()}
            }
            exit
        }
        $results = [System.Collections.Generic.List[object]]::new()
        $batchDir = Join-Path ([IO.Path]::GetTempPath()) ('ready-player-two-all-' + [guid]::NewGuid().ToString('N'))
        New-Item -ItemType Directory -Path $batchDir | Out-Null
        try {
            foreach ($program in $programs) {
                $childRequest = [ordered]@{ action=$request.action; platform=$program.platform; folder=$program.folder; account=$request.account; interfaceIndex=$request.interfaceIndex; makePrivate=$request.makePrivate; allowBlankPassword=$request.allowBlankPassword }
                $childInput = Join-Path $batchDir ($program.platform + '-request.json')
                $childOutput = Join-Path $batchDir ($program.platform + '-result.json')
                [IO.File]::WriteAllText($childInput, ($childRequest | ConvertTo-Json -Depth 5), [Text.UTF8Encoding]::new($false))
                & (Join-Path $PSHOME 'powershell.exe') -NoProfile -ExecutionPolicy Bypass -File $PSCommandPath -RequestPath $childInput -ResultPath $childOutput | Out-Null
                if (Test-Path -LiteralPath $childOutput) { $results.Add((Get-Content -LiteralPath $childOutput -Raw | ConvertFrom-Json)) }
                else { $results.Add([pscustomobject]@{ok=$false; error="$($program.name) did not return a result."; log=@()}) }
            }
        } finally { Remove-Item -LiteralPath $batchDir -Recurse -Force -ErrorAction SilentlyContinue }
        if ($request.action -eq 'status') {
            $first = $results[0]
            $shares = for ($index=0; $index -lt $programs.Count; $index++) { "$($programs[$index].name): " + $(if ($results[$index].sharePath) { $results[$index].sharePath } else { 'Not configured' }) }
            Send-RP1Announcement $programs 0 ([string]$first.account)
            Finish @{ok=$true; computer=$env:COMPUTERNAME; account=[Security.Principal.WindowsIdentity]::GetCurrent().Name; detected=@($programs.name); shares=@($shares); networks=@(Get-HomeNetworks); blankPasswordAllowed=$first.blankPasswordAllowed}
        } else {
            $failed = @($results | Where-Object { -not $_.ok })
            $allLogs = for ($index=0; $index -lt $programs.Count; $index++) { "[$($programs[$index].name)]"; @($results[$index].log); if (-not $results[$index].ok) { $results[$index].error } }
            if ($failed.Count -eq 0) {
                Install-RP2StatusShare ([string]$results[0].account) ([int]$request.interfaceIndex) ([bool]$request.makePrivate)
                Install-RP1Beacon $programs ([string]$results[0].account)
                Send-RP1Announcement $programs ([int]$request.interfaceIndex) ([string]$results[0].account)
                $allLogs += 'Installed persistent discovery. This PC now announces every supported program to Ready Player One at startup and every 10 seconds on every active LAN adapter.'
            }
            Finish @{ok=($failed.Count -eq 0); error=$(if ($failed.Count) { "$($failed.Count) supported program setup(s) need attention." } else { '' }); log=@($allLogs); paths=@($results.paths); account=$results[0].account; loginVerified=($results.loginVerified -notcontains $false)}
        }
        exit
    }
    $platform = if ($request.platform) { [string]$request.platform } else { 'retrobat' }
    if ($platform -notin @('retrobat','retroarch','esde','emustation')) { throw 'Choose RetroBat, RetroArch, ES-DE, or Emu-Station.' }
    $folder = Resolve-InstallationFolder $platform ([string]$request.folder)
    $platformConfig = Get-PlatformConfig $platform $folder
    $shareName = $platformConfig.shareName
    $libraryPath = $platformConfig.library
    if ($request.action -eq 'status') {
        $networks = @(Get-HomeNetworks)
        $share = Get-SmbShare -Name $shareName -ErrorAction SilentlyContinue
        $access = if ($share) { @(Get-SmbShareAccess -Name $shareName | Select-Object AccountName,AccessControlType,AccessRight) } else { @() }
        $blankPolicy = Get-ItemPropertyValue -LiteralPath 'HKLM:\SYSTEM\CurrentControlSet\Control\Lsa' -Name LimitBlankPasswordUse -ErrorAction SilentlyContinue
        $folderExists = if ($platformConfig.marker) { Test-Path -LiteralPath (Join-Path $folder $platformConfig.marker) -PathType Leaf } elseif ($platform -eq 'emustation') { [bool](Get-ChildItem -LiteralPath $folder -Filter '*.exe' -File -ErrorAction SilentlyContinue | Where-Object Name -Match 'emu.?station') } else { Test-Path -LiteralPath $libraryPath -PathType Container }
        Finish @{ok=$true; computer=$env:COMPUTERNAME; account=[Security.Principal.WindowsIdentity]::GetCurrent().Name; folder=$folder; folderExists=$folderExists; networks=@($networks); sharePath=$share.Path; access=@($access); blankPasswordAllowed=($null -ne $blankPolicy -and $blankPolicy -eq 0)}
        exit
    }
    if ($request.action -ne 'setup') { throw 'Unknown action.' }
    if (-not ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) { throw 'Administrator approval is required.' }
    if (-not [IO.Path]::IsPathRooted($folder) -or $folder.StartsWith('\\')) { throw 'Choose a local installation folder, not a network path.' }
    $folder = (Resolve-Path -LiteralPath $folder).ProviderPath.TrimEnd('\')
    if ($folder -eq [IO.Path]::GetPathRoot($folder).TrimEnd('\') -or $folder -ieq $env:SystemRoot -or $folder -ieq $env:USERPROFILE) { throw 'A drive root or system/user folder cannot be shared by this app.' }
    if ($platformConfig.marker -and -not (Test-Path -LiteralPath (Join-Path $folder $platformConfig.marker) -PathType Leaf)) { throw "The selected folder must contain $($platformConfig.marker)." }
    if ($platform -eq 'emustation' -and -not (Get-ChildItem -LiteralPath $folder -Filter '*.exe' -File -ErrorAction SilentlyContinue | Where-Object Name -Match 'emu.?station')) { throw 'The selected folder must contain the Emu-Station application executable.' }
    if ($platformConfig.createLibrary -and -not (Test-Path -LiteralPath $libraryPath -PathType Container)) { New-Item -ItemType Directory -Path $libraryPath | Out-Null; $log.Add("Created $libraryPath for Ready Player One transfers. Existing content was not moved.") }
    if (-not (Test-Path -LiteralPath $libraryPath -PathType Container)) { throw "$shareName must contain its expected ROM library folder." }
    $account = ([string]$request.account).Trim()
    $sid = ([Security.Principal.NTAccount]::new($account)).Translate([Security.Principal.SecurityIdentifier])
    if ($sid.Value -in @('S-1-1-0','S-1-5-11','S-1-5-32-545','S-1-5-32-546') -or $sid.Value -match '-501$') { throw 'Use a specific Windows user account, not Everyone, Users, or Guest.' }
    # Resolve the actual local user rather than assuming the built-in Administrator is enabled.
    $localUser = Get-LocalUser -SID $sid -ErrorAction Stop
    if (-not $localUser.Enabled) { throw "The account $account is disabled. Choose the Windows account you actually sign in with. No changes made." }
    if ($localUser.AccountExpires -and $localUser.AccountExpires -lt (Get-Date)) { throw "The account $account has expired. No changes made." }
    $account = "$env:COMPUTERNAME\$($localUser.Name)"
    $profile = Get-NetConnectionProfile -InterfaceIndex ([int]$request.interfaceIndex)
    if ($profile.NetworkCategory -eq 'DomainAuthenticated') { throw 'Domain networks must be configured by your administrator.' }
    if ($profile.NetworkCategory -ne 'Private' -and $request.makePrivate -ne $true) { throw 'Confirm that this is a trusted private network before setup.' }
    $share = Get-SmbShare -Name $shareName -ErrorAction SilentlyContinue
    if ($share -and [IO.Path]::GetFullPath($share.Path).TrimEnd('\') -ine $folder) { throw "A share named $shareName points to another folder. No changes made; resolve that conflict first." }
    if ($profile.NetworkCategory -ne 'Private') {
        Set-NetConnectionProfile -InterfaceIndex $profile.InterfaceIndex -NetworkCategory Private
        $log.Add("Set $($profile.InterfaceAlias) to Private.")
    }
    $acl = Get-Acl -LiteralPath $folder
    $rule = [Security.AccessControl.FileSystemAccessRule]::new($sid,'Modify','ContainerInherit,ObjectInherit','None','Allow')
    $acl.SetAccessRule($rule)
    Set-Acl -LiteralPath $folder -AclObject $acl
    $log.Add("Granted $account Modify access to the $shareName folder (inherited by its files).")
    Set-Service -Name LanmanServer -StartupType Automatic
    Start-Service -Name LanmanServer
    if (-not $share) {
        New-SmbShare -Name $shareName -Path $folder -ChangeAccess $account -FolderEnumerationMode AccessBased -CachingMode None | Out-Null
        $log.Add("Created $shareName share.")
    } else {
        # A deny entry for this exact selected user defeats a new Allow grant.
        $selectedDeny = @(Get-SmbShareAccess -Name $shareName | Where-Object {
            $_.AccessControlType -eq 'Deny' -and ([Security.Principal.NTAccount]::new($_.AccountName)).Translate([Security.Principal.SecurityIdentifier]).Value -eq $sid.Value
        })
        if ($selectedDeny.Count) {
            Unblock-SmbShareAccess -Name $shareName -AccountName $account -Force -ErrorAction Stop | Out-Null
            $log.Add('Removed the conflicting share deny for the selected account only.')
        }
        Grant-SmbShareAccess -Name $shareName -AccountName $account -AccessRight Change -Force | Out-Null
        $log.Add("Updated existing $shareName share.")
    }
    # Remove broad share grants; preserve other named administrators/users and NTFS rules.
    foreach ($entry in Get-SmbShareAccess -Name $shareName) {
        try { $entrySid = ([Security.Principal.NTAccount]::new($entry.AccountName)).Translate([Security.Principal.SecurityIdentifier]).Value } catch { continue }
        if ($entrySid -in @('S-1-1-0','S-1-5-11','S-1-5-32-545','S-1-5-32-546')) {
            Revoke-SmbShareAccess -Name $shareName -AccountName $entry.AccountName -Force | Out-Null
            $log.Add("Removed broad share access: $($entry.AccountName).")
        }
    }
    $ruleName = "ReadyPlayerTwo-$shareName-SMB-$($profile.InterfaceIndex)"
    if (Get-NetFirewallRule -Name $ruleName -ErrorAction SilentlyContinue) { Remove-NetFirewallRule -Name $ruleName }
    New-NetFirewallRule -Name $ruleName -DisplayName "Ready Player Two - $shareName - Private LAN" -Direction Inbound -Action Allow -Protocol TCP -LocalPort 445 -Profile Private -RemoteAddress LocalSubnet -InterfaceAlias $profile.InterfaceAlias | Out-Null
    $log.Add('Allowed SMB TCP 445 only on the selected Private interface, from the local subnet. Firewall remains enabled.')
    $verified = Get-SmbShare -Name $shareName
    $permissions = @(Get-SmbShareAccess -Name $shareName)
    $grant = @($permissions | Where-Object { $_.AccessControlType -eq 'Allow' -and $_.AccessRight -in @('Change','Full') -and ([Security.Principal.NTAccount]::new($_.AccountName)).Translate([Security.Principal.SecurityIdentifier]).Value -eq $sid.Value })
    if (-not $grant.Count) { throw 'Share permission verification failed.' }
    # Explicit opt-in only. This policy is machine-wide, not scoped to the share.
    if ($request.allowBlankPassword -eq $true) {
        $policyPath = 'HKLM:\SYSTEM\CurrentControlSet\Control\Lsa'
        New-ItemProperty -LiteralPath $policyPath -Name ForceGuest -PropertyType DWord -Value 0 -Force | Out-Null
        New-ItemProperty -LiteralPath $policyPath -Name LimitBlankPasswordUse -PropertyType DWord -Value 0 -Force | Out-Null
        if ((Get-ItemPropertyValue -LiteralPath $policyPath -Name LimitBlankPasswordUse) -ne 0) { throw 'Blank-password policy verification failed.' }
        if ((Get-ItemPropertyValue -LiteralPath $policyPath -Name ForceGuest) -ne 0) { throw 'Windows is still mapping local logins to Guest. Organization policy may be overriding setup.' }
        $log.Add('Allowed blank-password network logons for ALL local accounts. No account password was changed. Organization policy may override this setting.')
        $log.Add('Set Classic authentication: local users authenticate as themselves, not Guest (PC-wide).')
        # One real network-type logon attempt, not an admin-only folder check.
        # Never retry automatically, reset passwords, or weaken network-deny/UAC policies.
        Add-Type -TypeDefinition @'
using System;
using System.ComponentModel;
using System.Runtime.InteropServices;
using System.Security.Principal;
using System.IO;
public static class RetroSharingLoginCheck {
  [DllImport("advapi32.dll", CharSet=CharSet.Unicode, SetLastError=true)]
  static extern bool LogonUser(string user, string domain, string password, int type, int provider, out IntPtr token);
  [DllImport("kernel32.dll")] static extern bool CloseHandle(IntPtr handle);
  public static void Verify(string user, string domain, string folder) {
    IntPtr token;
    if (!LogonUser(user, domain, "", 3, 0, out token)) {
      int code = Marshal.GetLastWin32Error();
      throw new Win32Exception(code);
    }
    try {
      using (WindowsImpersonationContext context = WindowsIdentity.Impersonate(token)) {
        Directory.GetFileSystemEntries(Path.Combine(folder, "roms"));
      }
    } finally { CloseHandle(token); }
  }
}
'@
        try {
            [RetroSharingLoginCheck]::Verify($localUser.Name, $env:COMPUTERNAME, $(if ($platform -eq 'esde') { Split-Path -Parent $folder } else { $folder }))
            $loginVerified = $true
            $log.Add('Blank-password network-type login passed; ROM folder readable as the selected account. Remote SMB access is not yet verified.')
        } catch {
            $loginVerified = $false
            $cause = $_.Exception
            while ($cause.InnerException) { $cause = $cause.InnerException }
            $loginWarning = switch ($cause.NativeErrorCode) {
                1326 { 'Windows rejected an empty password for this account. Signing in automatically or with a PIN does not mean the password is empty. Connect using the actual Windows account password, or use a dedicated password-protected sharing account.' }
                1385 { 'Windows policy denies network login for this account. Use an account permitted network access or ask the PC administrator to review that policy.' }
                1909 { 'This Windows account is locked out. Stop login attempts and have the account unlocked before connecting.' }
                default { "The account login or ROM-folder access test failed: $($cause.Message). Verify this account can access the shared folder." }
            }
            $log.Add('Sharing was configured, but account access was NOT verified. No automatic login retry was attempted. Any explicitly enabled PC-wide policies remain in effect.')
        }
    }
    $addresses = @(Get-NetIPAddress -InterfaceIndex $profile.InterfaceIndex -AddressFamily IPv4 | Where-Object IPAddress -notlike '169.254.*' | Select-Object -ExpandProperty IPAddress)
    $paths = @($addresses | ForEach-Object { "\\$_\$shareName" })
    $log.Add('Local share setup verified. A connection from the Ready Player One PC is still needed to verify network access.')
    Finish @{ok=$true; shareConfigured=$true; loginVerified=$loginVerified; warning=$loginWarning; remoteVerified=$false; log=@($log); paths=$paths; account=$account; sharePath=$verified.Path}
} catch {
    Finish @{ok=$false; error=$_.Exception.Message; log=@($log)}
    exit 1
}
