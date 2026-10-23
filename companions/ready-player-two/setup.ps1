param([Parameter(Mandatory)][string]$RequestPath, [Parameter(Mandatory)][string]$ResultPath, [string]$WindowsBootIconPath='', [string]$BatoceraBootIconPath='')
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
    $statusRoot = Join-Path $env:ProgramData 'Ready Player Two\status'
    if (Test-Path -LiteralPath $statusRoot -PathType Container) {
        [IO.File]::WriteAllText((Join-Path $statusRoot 'dual-boot-worker.json'),(@{schema=1;version='1.0.56';computer=$env:COMPUTERNAME;configuredAt=(Get-Date).ToUniversalTime().ToString('o')} | ConvertTo-Json),[Text.UTF8Encoding]::new($false))
    }
}
function Get-FirmwareType {
    if (-not ('RP2FirmwareType' -as [type])) {
        Add-Type -TypeDefinition @'
using System;
using System.ComponentModel;
using System.Runtime.InteropServices;
public static class RP2FirmwareType {
  [DllImport("kernel32.dll", SetLastError=true)]
  private static extern bool GetFirmwareType(out uint firmwareType);
  public static uint Read() {
    uint value;
    if (!GetFirmwareType(out value)) throw new Win32Exception(Marshal.GetLastWin32Error());
    return value;
  }
}
'@
    }
    try {
        $code = [RP2FirmwareType]::Read()
        switch ($code) { 1 { return 'BIOS' } 2 { return 'UEFI' } default { return 'Unknown' } }
    } catch { return 'Unknown' }
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
        $firmwareType = Get-FirmwareType
        $batoceraVolumes = @(
            foreach ($disk in @(Get-Disk -ErrorAction SilentlyContinue)) {
                foreach ($partition in @(Get-Partition -DiskNumber $disk.Number -ErrorAction SilentlyContinue)) {
                    $volume = Get-Volume -Partition $partition -ErrorAction SilentlyContinue
                    if ($volume -and $volume.FileSystemLabel -eq 'BATOCERA') {
                        [pscustomobject]@{diskNumber=[int]$disk.Number; busType=[string]$disk.BusType; driveLetter=[string]$volume.DriveLetter; sizeBytes=[int64]$volume.Size}
                    }
                }
            }
        )
        $minimumSafeWindowsGb = [math]::Ceiling(([double]$supportedSize.SizeMin + 5GB) / 1GB)
        return @{ok=$true; capturedAt=(Get-Date).ToUniversalTime().ToString('o'); computer=$env:COMPUTERNAME; windowsDrive="$windowsLetter`:"; diskNumber=[int]$windowsDisk.Number; diskSizeBytes=[int64]$windowsDisk.Size; partitionStyle=[string]$windowsDisk.PartitionStyle; busType=[string]$windowsDisk.BusType; logicalSectorSize=[int]$windowsDisk.LogicalSectorSize; physicalSectorSize=[int]$windowsDisk.PhysicalSectorSize; diskReadOnly=[bool]$windowsDisk.IsReadOnly; diskOffline=[bool]$windowsDisk.IsOffline; firmwareType=$firmwareType; windowsFileSystem=[string]$windowsVolume.FileSystem; windowsPartitionNumber=[int]$windowsPartition.PartitionNumber; windowsPartitionSizeBytes=[int64]$windowsPartition.Size; windowsUsedBytes=[int64]($windowsVolume.Size - $windowsVolume.SizeRemaining); windowsFreeBytes=[int64]$windowsVolume.SizeRemaining; smallestSupportedWindowsSizeBytes=[int64]$supportedSize.SizeMin; minimumSafeWindowsGb=[int]$minimumSafeWindowsGb; largestSupportedWindowsSizeBytes=[int64]$supportedSize.SizeMax; batoceraVolumes=$batoceraVolumes; bitLockerProtection=$encryption; secureBoot=$secureBoot; partitions=$diskPartitions; installReady=$false; reason='Drive inspection only. Shared Dual Boot is started from RP1 after its protected RP2 worker is configured.'}
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
function Install-RP2StageShare([string]$Account) {
    if (-not ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) { throw 'Administrator approval is required to prepare the dual-boot staging share.' }
    $sid = ([Security.Principal.NTAccount]::new($Account)).Translate([Security.Principal.SecurityIdentifier])
    if ($sid.Value -in @('S-1-1-0','S-1-5-11','S-1-5-32-545','S-1-5-32-546')) { throw 'Choose a specific Windows account for RP2 staging.' }
    $folder = Join-Path $env:ProgramData 'Ready Player Two\staging'
    New-Item -ItemType Directory -Path $folder -Force | Out-Null
    $acl = Get-Acl -LiteralPath $folder
    $acl.SetAccessRuleProtection($true,$false)
    foreach ($identity in @([Security.Principal.SecurityIdentifier]::new('S-1-5-18'),[Security.Principal.SecurityIdentifier]::new('S-1-5-32-544'))) {
        $acl.SetAccessRule([Security.AccessControl.FileSystemAccessRule]::new($identity,'FullControl','ContainerInherit,ObjectInherit','None','Allow'))
    }
    $acl.SetAccessRule([Security.AccessControl.FileSystemAccessRule]::new($sid,'Modify','ContainerInherit,ObjectInherit','None','Allow'))
    Set-Acl -LiteralPath $folder -AclObject $acl
    $share = Get-SmbShare -Name 'RP2Stage' -ErrorAction SilentlyContinue
    if ($share -and [IO.Path]::GetFullPath($share.Path).TrimEnd('\') -ine [IO.Path]::GetFullPath($folder).TrimEnd('\')) { throw 'RP2Stage already points to another folder. No share was changed.' }
    if ($share) {
        $broadGrant = @(Get-SmbShareAccess -Name 'RP2Stage' | Where-Object {
            $_.AccessControlType -eq 'Allow' -and $_.AccountName -match '(^Everyone$|Authenticated Users$|\\Users$|\\Guests$)'
        })
        if ($broadGrant.Count) { throw 'RP2Stage has broad share permissions. No staging access was granted.' }
        Grant-SmbShareAccess -Name 'RP2Stage' -AccountName $Account -AccessRight Change -Force | Out-Null
    } else {
        New-SmbShare -Name 'RP2Stage' -Path $folder -ChangeAccess $Account -FolderEnumerationMode AccessBased -CachingMode None | Out-Null
    }
}
function Install-RP2DualBootWorker([string]$Account) {
    if (-not ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) { throw 'Administrator approval is required to install the RP2 dual-boot worker.' }
    if (Test-Path -LiteralPath (Join-Path $env:ProgramData 'Ready Player Two\staging\install-request.json') -PathType Leaf) { throw 'A pending dual-boot request already exists. RP2 will not start a newly installed worker against an old request.' }
    $sid = ([Security.Principal.NTAccount]::new($Account)).Translate([Security.Principal.SecurityIdentifier])
    $adminSid = [Security.Principal.SecurityIdentifier]::new('S-1-5-32-544')
    if (-not @(Get-LocalGroupMember -SID $adminSid -ErrorAction Stop | Where-Object { $_.SID -eq $sid }).Count) { throw 'For remote drive preparation, the RP2 staging account must be a direct member of this Windows PC Administrators group.' }
    $sourceDir = Split-Path -Parent $PSCommandPath
    $binRoot = Join-Path $env:ProgramData 'Ready Player Two\bin'
    New-Item -ItemType Directory -Path $binRoot -Force | Out-Null
    $acl = Get-Acl -LiteralPath $binRoot
    $acl.SetAccessRuleProtection($true,$false)
    foreach ($identity in @([Security.Principal.SecurityIdentifier]::new('S-1-5-18'),$adminSid)) {
        $acl.SetAccessRule([Security.AccessControl.FileSystemAccessRule]::new($identity,'FullControl','ContainerInherit,ObjectInherit','None','Allow'))
    }
    Set-Acl -LiteralPath $binRoot -AclObject $acl
    foreach ($file in @('setup.ps1','dual-boot-worker.ps1','7z.exe','7z.dll','windows11.png','batocera.png')) {
        $source = Join-Path $sourceDir $file
        if (-not (Test-Path -LiteralPath $source -PathType Leaf)) { throw "The bundled RP2 worker component $file is missing." }
        Copy-Item -LiteralPath $source -Destination (Join-Path $binRoot $file) -Force -ErrorAction Stop
    }
    $taskName = 'Ready Player Two Dual Boot Worker'
    $existingTask = Get-ScheduledTask -TaskName $taskName -ErrorAction SilentlyContinue
    if ($existingTask -and $existingTask.State -eq 'Running') { Stop-ScheduledTask -TaskName $taskName -ErrorAction Stop }
    $action = New-ScheduledTaskAction -Execute (Join-Path $PSHOME 'powershell.exe') -Argument "-NoProfile -WindowStyle Hidden -ExecutionPolicy Bypass -File `"$(Join-Path $binRoot 'dual-boot-worker.ps1')`""
    $trigger = New-ScheduledTaskTrigger -AtStartup
    $principal = New-ScheduledTaskPrincipal -UserId 'SYSTEM' -LogonType ServiceAccount -RunLevel Highest
    $settings = New-ScheduledTaskSettingsSet -RestartCount 5 -RestartInterval (New-TimeSpan -Minutes 1) -ExecutionTimeLimit ([TimeSpan]::Zero)
    Register-ScheduledTask -TaskName $taskName -Action $action -Trigger $trigger -Principal $principal -Settings $settings -Force | Out-Null
    Start-ScheduledTask -TaskName $taskName
}
function Get-RP2EfiFreeBytes {
    $letter = $null
    $mounted = $false
    try {
        foreach ($candidate in @('R','S','T','U','V','W','X','Y','Z')) {
            if (-not (Test-Path -LiteralPath "$candidate`:")) { $letter = $candidate; break }
        }
        if (-not $letter) { throw 'No free drive letter is available to inspect the EFI System partition.' }
        & mountvol.exe "$letter`:" /S | Out-Null
        if ($LASTEXITCODE -ne 0) { throw 'Windows could not mount its EFI System partition for a free-space check.' }
        $mounted = $true
        $windowsBoot = Join-Path "$letter`:" 'EFI\Microsoft\Boot\bootmgfw.efi'
        if (-not (Test-Path -LiteralPath $windowsBoot -PathType Leaf)) { throw 'The Windows EFI boot file was not found.' }
        if (Test-Path -LiteralPath (Join-Path "$letter`:" 'EFI\refind')) { throw 'An EFI rEFInd installation already exists; RP2 will not overwrite it.' }
        return [int64]([IO.DriveInfo]::new("$letter`:\")).AvailableFreeSpace
    } finally {
        if ($mounted) { & mountvol.exe "$letter`:" /D | Out-Null }
    }
}
function Get-RP2BootDiagnostic {
    $firmware = (& bcdedit.exe /enum '{fwbootmgr}' 2>&1 | Out-String)
    $firmwareExit = $LASTEXITCODE
    $bootManager = (& bcdedit.exe /enum '{bootmgr}' 2>&1 | Out-String)
    $bootManagerExit = $LASTEXITCODE
    $report = [ordered]@{ ok=$true; schema=1; computer=$env:COMPUTERNAME; capturedAt=(Get-Date).ToUniversalTime().ToString('o'); inspectionOnly=$true; firmwareBootManager=$firmware; firmwareExitCode=$firmwareExit; windowsBootManager=$bootManager; windowsBootManagerExitCode=$bootManagerExit; efiMounted=$false; refindLoaderExists=$false; refindConfigExists=$false; windowsLoaderExists=$false; refindConfig=''; error='' }
    $letter = $null
    try {
        foreach ($candidate in @('R','S','T','U','V','W','X','Y','Z')) {
            if (-not (Test-Path -LiteralPath "$candidate`:")) { $letter=$candidate; break }
        }
        if (-not $letter) { throw 'No free drive letter is available for EFI inspection.' }
        & mountvol.exe "$letter`:" /S | Out-Null
        if ($LASTEXITCODE -ne 0) { throw 'Windows could not mount the EFI System Partition for inspection.' }
        $report.efiMounted=$true
        $efiRoot="$letter`:"
        $report.refindLoaderExists=Test-Path -LiteralPath (Join-Path $efiRoot 'EFI\refind\refind_x64.efi') -PathType Leaf
        $report.windowsLoaderExists=Test-Path -LiteralPath (Join-Path $efiRoot 'EFI\Microsoft\Boot\bootmgfw.efi') -PathType Leaf
        $configPath=Join-Path $efiRoot 'EFI\refind\refind.conf'
        $report.refindConfigExists=Test-Path -LiteralPath $configPath -PathType Leaf
        if ($report.refindConfigExists) { $report.refindConfig=[IO.File]::ReadAllText($configPath) }
    } catch { $report.error=$_.Exception.Message }
    finally { if ($report.efiMounted) { & mountvol.exe "$letter`:" /D | Out-Null } }
    $statusPath=Join-Path $env:ProgramData 'Ready Player Two\status\boot-diagnostic.json'
    [IO.File]::WriteAllText($statusPath,($report | ConvertTo-Json -Depth 5),[Text.UTF8Encoding]::new($false))
    return $report
}
function Add-RP2BootDiagnosticLog([System.Collections.Generic.List[string]]$Log) {
    try {
        $report=Get-RP2BootDiagnostic
        if ($report.error) { $Log.Add("Boot menu inspection needs attention: $($report.error)") }
        else { $Log.Add('Read-only boot menu report saved to RP2Status\\boot-diagnostic.json.') }
    } catch { $Log.Add("Boot menu inspection needs attention: $($_.Exception.Message)") }
}
function Restore-RP2ManagedInstallJournal {
    if (-not ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) { throw 'Administrator approval is required to recover the RP2 installation record.' }
    $stageRoot = Join-Path $env:ProgramData 'Ready Player Two\staging'
    $planPath = Join-Path $stageRoot 'plan.json'
    $plan = if (Test-Path -LiteralPath $planPath -PathType Leaf) { Get-Content -LiteralPath $planPath -Raw -ErrorAction Stop | ConvertFrom-Json } else { $null }
    if ($plan -and ($plan.schema -ne 1 -or $plan.defaultOs -ne 'batocera')) { throw 'The staged plan is not an RP2 Batocera-default plan.' }
    $report = Get-DualBootPreflight
    if ($report.firmwareType -ne 'UEFI' -or $report.partitionStyle -ne 'GPT' -or $report.bitLockerProtection -ne 'Off' -or $report.diskOffline -or $report.diskReadOnly) { throw 'The current Windows disk no longer meets the RP2-managed installation requirements.' }
    $bootDiagnostic = Get-RP2BootDiagnostic
    if ($bootDiagnostic.error -or -not $bootDiagnostic.refindLoaderExists -or -not $bootDiagnostic.windowsLoaderExists) { throw 'The Windows and rEFInd EFI loaders could not both be verified.' }
    if ($bootDiagnostic.refindConfigExists) {
        foreach ($requiredText in @('\EFI\Microsoft\Boot\bootmgfw.efi','volume BATOCERA','\EFI\batocera\bootx64.efi')) {
            if ([string]$bootDiagnostic.refindConfig -notmatch [regex]::Escape($requiredText)) { throw "The existing rEFInd configuration is unfamiliar and is missing the expected RP2 entry: $requiredText" }
        }
    }
    $bootManagerText=[string]$bootDiagnostic.windowsBootManager
    if ($bootManagerText -notmatch [regex]::Escape('\EFI\refind\refind_x64.efi') -and $bootManagerText -notmatch [regex]::Escape('\EFI\Microsoft\Boot\bootmgfw.efi')) { throw 'Windows Boot Manager points to an unfamiliar EFI loader.' }
    $bootVolumes = @(Get-Volume -FileSystemLabel 'BATOCERA' -ErrorAction SilentlyContinue)
    $shareVolumes = @(Get-Volume -FileSystemLabel 'SHARE' -ErrorAction SilentlyContinue)
    if ($bootVolumes.Count -ne 1 -or $shareVolumes.Count -ne 1) { throw 'Exactly one BATOCERA volume and one SHARE volume are required to recover the RP2 record.' }
    $bootPartition = $bootVolumes[0] | Get-Partition -ErrorAction Stop
    $sharePartition = $shareVolumes[0] | Get-Partition -ErrorAction Stop
    if ($bootPartition.DiskNumber -ne [int]$report.diskNumber -or $sharePartition.DiskNumber -ne [int]$report.diskNumber) { throw 'BATOCERA and SHARE are not both on the internal Windows disk.' }
    if ($bootVolumes[0].FileSystem -ne 'FAT32' -or [int64]$bootPartition.Size -ne 10GB -or $shareVolumes[0].FileSystem -ne 'exFAT') { throw 'The BATOCERA or SHARE partition layout does not match the RP2-created layout.' }
    $temporaryLetter = $null
    try {
        $bootLetter = [string]$bootPartition.DriveLetter
        if (-not $bootLetter -or $bootLetter -eq [string][char]0) {
            foreach ($candidate in @('Q','R','S','T','U','V','W','X','Y','Z')) { if (-not (Test-Path -LiteralPath "$candidate`:")) { $bootLetter=$candidate; break } }
            if (-not $bootLetter) { throw 'No free drive letter is available to verify the BATOCERA partition.' }
            Add-PartitionAccessPath -DiskNumber ([int]$bootPartition.DiskNumber) -PartitionNumber ([int]$bootPartition.PartitionNumber) -AccessPath "$bootLetter`:\" -ErrorAction Stop
            $temporaryLetter = $bootLetter
        }
        foreach ($requiredFile in @('EFI\batocera\bootx64.efi','boot\linux','boot\initrd.gz','batocera-boot.conf')) {
            if (-not (Test-Path -LiteralPath (Join-Path "$bootLetter`:\" $requiredFile) -PathType Leaf)) { throw "The existing BATOCERA partition is missing $requiredFile." }
        }
    } finally {
        if ($temporaryLetter) { Remove-PartitionAccessPath -DiskNumber ([int]$bootPartition.DiskNumber) -PartitionNumber ([int]$bootPartition.PartitionNumber) -AccessPath "$temporaryLetter`:\" -ErrorAction SilentlyContinue }
    }
    # Older RP2 versions could leave a valid installation without a usable
    # plan after an update or computer rename. Adopt it only after the live GPT,
    # BitLocker, EFI loaders, rEFInd entries, partition labels/files, and disk
    # placement have all passed the checks above.
    if (-not $plan -or [string]$plan.targetComputerName -ine $env:COMPUTERNAME) {
        if ($plan -and [string]$plan.targetComputerName -ine $env:COMPUTERNAME) {
            $planBackupRoot = Join-Path $env:ProgramData ('Ready Player Two\journal-backup\' + (Get-Date).ToUniversalTime().ToString('yyyyMMdd-HHmmss'))
            New-Item -ItemType Directory -Path $planBackupRoot -Force -ErrorAction Stop | Out-Null
            Copy-Item -LiteralPath $planPath -Destination (Join-Path $planBackupRoot 'plan.json') -ErrorAction Stop
        }
        $plan = [ordered]@{schema=1;targetComputerName=$env:COMPUTERNAME;windowsGb=[int][math]::Round([int64]$report.windowsPartitionSizeBytes/1GB);defaultOs='batocera';status='adopted-existing';createdAt=(Get-Date).ToUniversalTime().ToString('o')}
        [IO.File]::WriteAllText($planPath,($plan | ConvertTo-Json -Depth 5),[Text.UTF8Encoding]::new($false))
    }
    $journalPath = Join-Path $stageRoot 'install-state.json'
    if (Test-Path -LiteralPath $journalPath -PathType Leaf) {
        $backupRoot = Join-Path $env:ProgramData ('Ready Player Two\journal-backup\' + (Get-Date).ToUniversalTime().ToString('yyyyMMdd-HHmmss'))
        New-Item -ItemType Directory -Path $backupRoot -Force -ErrorAction Stop | Out-Null
        Copy-Item -LiteralPath $journalPath -Destination (Join-Path $backupRoot 'install-state.json') -ErrorAction Stop
    }
    $journal = [ordered]@{phase='awaiting-first-boot';detail='RP2 recovered and verified the managed dual-boot installation record from the live disk and EFI configuration.';diskNumber=[int]$report.diskNumber;windowsPartitionNumber=[int]$report.windowsPartitionNumber;originalWindowsBytes=[int64]$report.windowsPartitionSizeBytes;requestedWindowsBytes=[int64]$report.windowsPartitionSizeBytes;createdPartitions=@([int]$bootPartition.PartitionNumber,[int]$sharePartition.PartitionNumber);updatedAt=(Get-Date).ToUniversalTime().ToString('o')}
    [IO.File]::WriteAllText($journalPath,($journal | ConvertTo-Json -Depth 5),[Text.UTF8Encoding]::new($false))
    return $journal
}
function Invoke-RP2ManagedBootMaintenance([System.Collections.Generic.List[string]]$Log) {
    $report = Get-RP2BootDiagnostic
    if ($report.error) { throw "Boot menu inspection failed: $($report.error)" }
    $Log.Add("EFI verification - rEFInd loader: $($report.refindLoaderExists); configuration: $($report.refindConfigExists); Windows loader: $($report.windowsLoaderExists).")
    if (-not $report.refindLoaderExists) {
        $Log.Add('No existing rEFInd installation was found; no boot-menu repair was needed.')
        return
    }
    $batocera = @(Get-Volume -FileSystemLabel 'BATOCERA' -ErrorAction SilentlyContinue)
    if ($batocera.Count -ne 1) {
        throw "rEFInd exists, but exactly one BATOCERA volume was not found. Configure All will not overwrite an unverified boot setup."
    }
    try { $repair = Repair-RP2BootMenu }
    catch {
        $configurationWasMissing = -not $report.refindConfigExists
        $null = Restore-RP2ManagedInstallJournal
        $repair = Repair-RP2BootMenu
        $Log.Add('Recovered the RP2 installation record after validating the live Windows, BATOCERA, SHARE, and EFI layout.')
        if ($configurationWasMissing) { $Log.Add('The rEFInd configuration was missing and RP2 recreated the verified Windows 11 and Batocera boot menu.') }
    }
    if (-not $repair.ok) { throw [string]$repair.error }
    $Log.Add($(if ($repair.changed) { 'Verified the existing RP2-managed Batocera installation and repaired its boot menu.' } else { 'Verified the existing RP2-managed Batocera installation and boot menu; no repair was needed.' }))
    if (Install-RP2BatoceraRuntimeBootstrap) { $Log.Add('Installed the Batocera shared-drive Xbox 360 runtime storage preflight.') }
}
function Install-RP2BatoceraRuntimeBootstrap {
    $shareVolumes = @(Get-Volume -FileSystemLabel 'SHARE' -ErrorAction SilentlyContinue)
    if ($shareVolumes.Count -ne 1) { return $false }
    $partition = $shareVolumes[0] | Get-Partition -ErrorAction Stop
    $temporaryLetter = $null
    try {
        $letter = [string]$partition.DriveLetter
        if (-not $letter -or $letter -eq [string][char]0) {
            foreach ($candidate in @('Q','R','S','T','U','V','W','X','Y','Z')) { if (-not (Test-Path -LiteralPath "$candidate`:")) { $letter=$candidate; break } }
            if (-not $letter) { throw 'No free drive letter is available to prepare Batocera shared-drive runtime support.' }
            Add-PartitionAccessPath -DiskNumber ([int]$partition.DiskNumber) -PartitionNumber ([int]$partition.PartitionNumber) -AccessPath "$letter`:\" -ErrorAction Stop
            $temporaryLetter = $letter
        }
        $systemRoot = Join-Path "$letter`:\" 'system'
        $rp1Root = Join-Path $systemRoot 'ready-player-one'
        New-Item -ItemType Directory -Path $rp1Root -Force -ErrorAction Stop | Out-Null
        $helper = @'
#!/bin/bash
set -eu
prefix=/userdata/system/wine-bottles/xbox360
container=/userdata/system/xbox360-wine.ext4
log=/userdata/system/logs/rp1-xenia-storage.log
mkdir -p /userdata/system/logs /userdata/system/wine-bottles
fstype=$(findmnt -n -o FSTYPE /userdata 2>/dev/null || true)
case "$fstype" in ext2|ext3|ext4|btrfs|xfs|f2fs) exit 0;; esac
if grep -qs " $prefix ext4 " /proc/mounts; then exit 0; fi
if [ ! -f "$container" ]; then
  temporary="$container.partial"
  rm -f "$temporary"
  truncate -s 8G "$temporary"
  /sbin/mkfs.ext4 -F -m 0 -L RP1_XENIA "$temporary" >"$log" 2>&1
  mv "$temporary" "$container"
fi
if [ -d "$prefix" ] && [ "$(find "$prefix" -mindepth 1 -maxdepth 1 -print -quit 2>/dev/null)" ]; then
  mv "$prefix" "$prefix.nonlinux-$(date +%Y%m%d-%H%M%S)"
fi
mkdir -p "$prefix"
mount -t ext4 -o loop,rw,noatime "$container" "$prefix" >>"$log" 2>&1
chmod 777 "$prefix"
grep -qs " $prefix ext4 " /proc/mounts
'@
        $helperPath = Join-Path $rp1Root 'xenia-storage.sh'
        [IO.File]::WriteAllText($helperPath,($helper -replace "`r`n","`n"),[Text.UTF8Encoding]::new($false))
        $customPath = Join-Path $systemRoot 'custom.sh'
        $existing = if (Test-Path -LiteralPath $customPath -PathType Leaf) { [IO.File]::ReadAllText($customPath) -replace "`r`n","`n" } else { "#!/bin/bash`n" }
        $existing = [regex]::Replace($existing,'(?ms)^# READY PLAYER TWO XENIA STORAGE BEGIN\n.*?^# READY PLAYER TWO XENIA STORAGE END\n?','')
        $block = @'
# READY PLAYER TWO XENIA STORAGE BEGIN
if [ -f /userdata/system/ready-player-one/xenia-storage.sh ]; then
  /bin/bash /userdata/system/ready-player-one/xenia-storage.sh prepare
fi
# READY PLAYER TWO XENIA STORAGE END
'@
        [IO.File]::WriteAllText($customPath,($existing.TrimEnd()+"`n"+($block -replace "`r`n","`n").Trim()+"`n"),[Text.UTF8Encoding]::new($false))
        return $true
    } finally {
        if ($temporaryLetter) { Remove-PartitionAccessPath -DiskNumber ([int]$partition.DiskNumber) -PartitionNumber ([int]$partition.PartitionNumber) -AccessPath "$temporaryLetter`:\" -ErrorAction SilentlyContinue }
    }
}
function Repair-RP2BootMenu {
    if (-not ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) { throw 'Administrator approval is required to repair the boot menu.' }
    $stageRoot=Join-Path $env:ProgramData 'Ready Player Two\staging'
    $journal=Get-Content -LiteralPath (Join-Path $stageRoot 'install-state.json') -Raw -ErrorAction Stop | ConvertFrom-Json
    $plan=Get-Content -LiteralPath (Join-Path $stageRoot 'plan.json') -Raw -ErrorAction Stop | ConvertFrom-Json
    if ($journal.phase -ne 'awaiting-first-boot' -or $plan.schema -ne 1 -or [string]$plan.targetComputerName -ine $env:COMPUTERNAME -or $plan.defaultOs -ne 'batocera') { throw 'This PC does not match a completed RP2 Batocera-default installation. No boot setting was changed.' }
    if (@($journal.createdPartitions).Count -ne 2) { throw 'The Batocera partition journal is incomplete. No boot setting was changed.' }
    $bootCandidates=@(foreach ($partition in @(Get-Partition -DiskNumber ([int]$journal.diskNumber) -ErrorAction Stop)) {
        $volume=$partition | Get-Volume -ErrorAction SilentlyContinue
        if ($volume -and $volume.FileSystemLabel -eq 'BATOCERA' -and $volume.FileSystem -eq 'FAT32' -and [int64]$partition.Size -eq 10GB) {
            [pscustomobject]@{partition=$partition;volume=$volume}
        }
    })
    if ($bootCandidates.Count -ne 1) { throw 'The RP2-installed 10 GB FAT32 BATOCERA boot volume was not uniquely found on the internal Windows disk. No boot setting was changed.' }
    $bootPartition=$bootCandidates[0].partition
    $bootManager=(& bcdedit.exe /enum '{bootmgr}' 2>&1 | Out-String)
    if ($LASTEXITCODE -ne 0) { throw 'Windows Boot Manager could not be inspected. No boot setting was changed.' }
    $bootPathIsRefind=$bootManager -match [regex]::Escape('\EFI\refind\refind_x64.efi')
    $bootPathIsWindows=$bootManager -match [regex]::Escape('\EFI\Microsoft\Boot\bootmgfw.efi')
    if (-not $bootPathIsRefind -and -not $bootPathIsWindows) { throw 'Windows Boot Manager points to an unfamiliar EFI loader. No boot setting was changed.' }
    $workerBinRoot=Join-Path $env:ProgramData 'Ready Player Two\bin'
    $windowsIconSource=if ([string]::IsNullOrWhiteSpace([string]$WindowsBootIconPath)) { Join-Path $workerBinRoot 'windows11.png' } else { [string]$WindowsBootIconPath }
    $batoceraIconSource=if ([string]::IsNullOrWhiteSpace([string]$BatoceraBootIconPath)) { Join-Path $workerBinRoot 'batocera.png' } else { [string]$BatoceraBootIconPath }
    if ([string]::IsNullOrWhiteSpace($windowsIconSource) -or [string]::IsNullOrWhiteSpace($batoceraIconSource) -or -not (Test-Path -LiteralPath $windowsIconSource -PathType Leaf) -or -not (Test-Path -LiteralPath $batoceraIconSource -PathType Leaf)) { throw 'The protected RP2 worker is missing its boot-menu logos. Install the current RP2 and run Configure All once; no boot setting was changed.' }
    $target=@(
        'timeout 30', 'textonly false', 'big_icon_size 384', 'scanfor manual', 'showtools', 'hideui banner,hints,badges', 'default_selection "Batocera"',
        'menuentry "Windows 11" {', '    icon \EFI\refind\themes\rp1\windows11.png', '    loader \EFI\Microsoft\Boot\bootmgfw.efi', '}',
        'menuentry "Batocera" {', '    icon \EFI\refind\themes\rp1\batocera.png', '    volume BATOCERA', '    loader \EFI\batocera\bootx64.efi', '}'
    )
    $graphicalCustomV1=@(
        'timeout 30', 'textonly false', 'scanfor manual', 'showtools', 'hideui banner,hints,badges', 'default_selection "Batocera"',
        'menuentry "Windows 11" {', '    icon \EFI\refind\themes\rp1\windows11.png', '    loader \EFI\Microsoft\Boot\bootmgfw.efi', '}',
        'menuentry "Batocera" {', '    icon \EFI\refind\themes\rp1\batocera.png', '    volume BATOCERA', '    loader \EFI\batocera\bootx64.efi', '}'
    )
    $graphicalV1=@(
        'timeout 30', 'textonly false', 'scanfor manual', 'showtools', 'hideui banner,hints,badges', 'default_selection "Batocera"',
        'menuentry "Windows 11" {', '    icon \EFI\refind\icons\os_win.png', '    loader \EFI\Microsoft\Boot\bootmgfw.efi', '}',
        'menuentry "Batocera" {', '    icon \EFI\refind\icons\os_linux.png', '    volume BATOCERA', '    loader \EFI\batocera\bootx64.efi', '}'
    )
    $plainText=@(
        'timeout 30', 'textonly true', 'scanfor manual', 'showtools', 'default_selection "Batocera"',
        'menuentry "Windows 11" {', '    loader \EFI\Microsoft\Boot\bootmgfw.efi', '}',
        'menuentry "Batocera" {', '    volume BATOCERA', '    loader \EFI\batocera\bootx64.efi', '}'
    )
    $legacy=@(
        'timeout 10', 'scanfor manual', 'default_selection Batocera',
        'menuentry "Windows" {', '    loader \EFI\Microsoft\Boot\bootmgfw.efi', '}',
        'menuentry "Batocera" {', '    volume BATOCERA', '    loader \EFI\batocera\bootx64.efi', '}'
    )
    $letter=$null; $mounted=$false; $bootTempLetter=$null
    try {
        $bootLetter=[string]$bootPartition.DriveLetter
        if (-not $bootLetter -or $bootLetter -eq [string][char]0) {
            foreach ($candidate in @('Q','R','S','T','U','V','W','X','Y','Z')) { if (-not (Test-Path -LiteralPath "$candidate`:")) { $bootLetter=$candidate; break } }
            if (-not $bootLetter) { throw 'No free drive letter is available to inspect the internal BATOCERA partition.' }
            Add-PartitionAccessPath -DiskNumber ([int]$journal.diskNumber) -PartitionNumber ([int]$bootPartition.PartitionNumber) -AccessPath "$bootLetter`:\" -ErrorAction Stop
            $bootTempLetter=$bootLetter
        }
        if (-not (Test-Path -LiteralPath "$bootLetter`:\EFI\batocera\bootx64.efi" -PathType Leaf)) { throw 'The internal Batocera EFI loader is missing. No boot setting was changed.' }
        foreach ($candidate in @('R','S','T','U','V','W','X','Y','Z')) { if (-not (Test-Path -LiteralPath "$candidate`:")) { $letter=$candidate; break } }
        if (-not $letter) { throw 'No free drive letter is available to inspect EFI.' }
        & mountvol.exe "$letter`:" /S | Out-Null
        if ($LASTEXITCODE -ne 0) { throw 'Windows could not mount the EFI partition.' }
        $mounted=$true
        $efiRoot="$letter`:"
        if (-not (Test-Path -LiteralPath (Join-Path $efiRoot 'EFI\Microsoft\Boot\bootmgfw.efi') -PathType Leaf) -or -not (Test-Path -LiteralPath (Join-Path $efiRoot 'EFI\refind\refind_x64.efi') -PathType Leaf)) { throw 'A required Windows or rEFInd EFI loader is missing. No boot setting was changed.' }
        $configPath=Join-Path $efiRoot 'EFI\refind\refind.conf'
        $configExists=Test-Path -LiteralPath $configPath -PathType Leaf
        $current=if($configExists){([IO.File]::ReadAllText($configPath) -replace "`r`n","`n").Trim()}else{''}
        $targetText=($target -join "`n").Trim()
        $installedThemeDir=Join-Path $efiRoot 'EFI\refind\themes\rp1'
        $themeComplete=(Test-Path -LiteralPath (Join-Path $installedThemeDir 'windows11.png') -PathType Leaf) -and (Test-Path -LiteralPath (Join-Path $installedThemeDir 'batocera.png') -PathType Leaf)
        if ($current -eq $targetText -and $themeComplete -and $bootPathIsRefind) { return @{ok=$true;changed=$false;detail='The two-choice graphical menu with high-resolution Windows and Batocera logos is already configured. No files changed.'} }
        if ($current -and $current -ne $targetText -and $current -ne (($legacy -join "`n").Trim()) -and $current -ne (($plainText -join "`n").Trim()) -and $current -ne (($graphicalV1 -join "`n").Trim()) -and $current -ne (($graphicalCustomV1 -join "`n").Trim())) { throw 'The rEFInd configuration differs from the RP2-installed version. No boot setting was changed.' }
        $backupRoot=Join-Path $env:ProgramData ('Ready Player Two\boot-backup\menu-repair-' + (Get-Date).ToUniversalTime().ToString('yyyyMMdd-HHmmss'))
        New-Item -ItemType Directory -Path $backupRoot -Force -ErrorAction Stop | Out-Null
        $backupPath=Join-Path $backupRoot 'refind.conf.before-repair'
        $bcdBackup=Join-Path $backupRoot 'bcd.before-repair'
        & bcdedit.exe /export $bcdBackup | Out-Null
        if ($LASTEXITCODE -ne 0 -or -not (Test-Path -LiteralPath $bcdBackup -PathType Leaf)) { throw 'Windows boot configuration could not be backed up. No boot setting was changed.' }
        if($configExists){
            Copy-Item -LiteralPath $configPath -Destination $backupPath -ErrorAction Stop
            if ((Get-FileHash -LiteralPath $configPath -Algorithm SHA256).Hash -ne (Get-FileHash -LiteralPath $backupPath -Algorithm SHA256).Hash) { throw 'The boot menu backup did not verify. No boot setting was changed.' }
        }
        try {
            $themeDir=Join-Path $efiRoot 'EFI\refind\themes\rp1'
            New-Item -ItemType Directory -Path $themeDir -Force -ErrorAction Stop | Out-Null
            Copy-Item -LiteralPath $windowsIconSource -Destination (Join-Path $themeDir 'windows11.png') -Force -ErrorAction Stop
            Copy-Item -LiteralPath $batoceraIconSource -Destination (Join-Path $themeDir 'batocera.png') -Force -ErrorAction Stop
            foreach ($icon in @('windows11.png','batocera.png')) { if (-not (Test-Path -LiteralPath (Join-Path $themeDir $icon) -PathType Leaf)) { throw "The $icon boot-menu logo did not verify." } }
            [IO.File]::WriteAllLines($configPath,$target,[Text.UTF8Encoding]::new($false))
            if (([IO.File]::ReadAllText($configPath) -replace "`r`n","`n").Trim() -ne $targetText) { throw 'The repaired boot menu did not verify.' }
            if (-not $bootPathIsRefind) {
                & bcdedit.exe /set '{bootmgr}' path '\EFI\refind\refind_x64.efi' | Out-Null
                if ($LASTEXITCODE -ne 0) { throw 'Windows rejected the repaired rEFInd boot path.' }
                $verifiedBootManager=(& bcdedit.exe /enum '{bootmgr}' 2>&1 | Out-String)
                if ($LASTEXITCODE -ne 0 -or $verifiedBootManager -notmatch [regex]::Escape('\EFI\refind\refind_x64.efi')) { throw 'The repaired rEFInd boot path did not verify.' }
            }
        } catch {
            if(Test-Path -LiteralPath $backupPath -PathType Leaf){Copy-Item -LiteralPath $backupPath -Destination $configPath -Force -ErrorAction Stop}else{Remove-Item -LiteralPath $configPath -Force -ErrorAction SilentlyContinue}
            if(-not $bootPathIsRefind){& bcdedit.exe /set '{bootmgr}' path '\EFI\Microsoft\Boot\bootmgfw.efi' | Out-Null}
            throw "Boot menu repair failed; original configuration restored. $($_.Exception.Message)"
        }
        return @{ok=$true;changed=$true;detail='Two-choice graphical menu configured with a 30-second Batocera default. Reboot and verify both choices on the actual display.';backupPath=$backupPath}
    } finally {
        if ($mounted) { & mountvol.exe "$letter`:" /D | Out-Null }
        if ($bootTempLetter) { Remove-PartitionAccessPath -DiskNumber ([int]$journal.diskNumber) -PartitionNumber ([int]$bootPartition.PartitionNumber) -AccessPath "$bootTempLetter`:\" -ErrorAction Stop }
    }
}
function Get-DualBootStagedPlan {
    $folder = Join-Path $env:ProgramData 'Ready Player Two\staging'
    $planPath = Join-Path $folder 'plan.json'
    if (-not (Test-Path -LiteralPath $planPath -PathType Leaf)) { throw 'No Batocera image has been staged by RP1.' }
    $plan = Get-Content -LiteralPath $planPath -Raw | ConvertFrom-Json
    if ($plan.schema -ne 1 -or $plan.status -ne 'staged-only' -or $plan.imageName -cnotin @('batocera-x86_64-43.1-20260529.img','batocera-x86_64-43.1-20260529.img.gz')) { throw 'The staged plan has an unsupported format.' }
    if ([string]$plan.targetComputerName -ine $env:COMPUTERNAME) { throw 'This image was staged for a different Windows computer.' }
    if ([string]$plan.imageSha256 -cnotmatch '^[0-9a-f]{64}$' -or $plan.defaultOs -notin @('windows','batocera')) { throw 'The staged plan is invalid.' }
    $imagePath = Join-Path $folder $plan.imageName
    $image = Get-Item -LiteralPath $imagePath -ErrorAction Stop
    if ($image.Length -ne [int64]$plan.imageBytes) { throw 'The staged image size does not match the RP1 plan.' }
    $actualHash = (Get-FileHash -LiteralPath $imagePath -Algorithm SHA256).Hash.ToLowerInvariant()
    if ($actualHash -cne $plan.imageSha256) { throw 'The staged image SHA-256 does not match the RP1 plan.' }
    if ($plan.refindName -cne 'refind-bin-0.14.2.zip' -or $plan.refindSha256 -cne '410c7828c4fec2f2179bd956073522415831d27c00416381b8f71153c190a311') { throw 'The staged plan does not include the approved, pinned rEFInd package.' }
    $refindPath = Join-Path $folder $plan.refindName
    if (-not (Test-Path -LiteralPath $refindPath -PathType Leaf)) { throw 'The rEFInd package is missing from the staged plan.' }
    if ((Get-FileHash -LiteralPath $refindPath -Algorithm SHA256).Hash.ToLowerInvariant() -cne $plan.refindSha256) { throw 'The staged rEFInd package failed SHA-256 verification.' }
    $report = Get-DualBootPreflight
    $gb = 1GB
    $windowsBytes = [int64]$plan.windowsGb * $gb
    $batoceraBytes = [int64]$report.windowsPartitionSizeBytes - $windowsBytes
    $blockers = [System.Collections.Generic.List[string]]::new()
    if ($report.firmwareType -ne 'UEFI') { $blockers.Add('Windows must boot in UEFI mode.') }
    if ($report.partitionStyle -ne 'GPT') { $blockers.Add('The Windows drive must use GPT.') }
    if ($report.windowsFileSystem -ne 'NTFS') { $blockers.Add('The Windows partition must be NTFS.') }
    if ($report.bitLockerProtection -ne 'Off') { $blockers.Add('BitLocker must be off on the Windows partition.') }
    if ($report.secureBoot -ne 'False') { $blockers.Add('Secure Boot must be disabled or separately configured for Batocera and rEFInd.') }
    if ($report.diskOffline -or $report.diskReadOnly) { $blockers.Add('The Windows disk must be online and writable.') }
    if ($report.busType -in @('USB','SD','MMC')) { $blockers.Add('The Windows boot disk must be an internal drive, not USB or removable media.') }
    if (@(Get-Volume -FileSystemLabel 'BATOCERA' -ErrorAction SilentlyContinue).Count) {
        $where = @($report.batoceraVolumes | ForEach-Object { "disk $($_.diskNumber) ($($_.busType))" }) -join ', '
        $blockers.Add("Disconnect the existing BATOCERA volume$(if($where){' on ' + $where}) before preparing this installation.")
    }
    if ($windowsBytes -lt [int64]$report.smallestSupportedWindowsSizeBytes + 5GB) { $blockers.Add("Keep at least $($report.minimumSafeWindowsGb) GB for Windows; the current live shrink limit plus 5 GB exceeds the requested $($plan.windowsGb) GB.") }
    if ($batoceraBytes -lt 12GB) { $blockers.Add('Batocera needs at least 12 GB of space, including the 10 GB boot partition.') }
    if (@($report.partitions | Where-Object { $_.type -eq 'System' }).Count -ne 1) { $blockers.Add('Expected exactly one EFI System partition.') }
    try { if ((Get-RP2EfiFreeBytes) -lt 15MB) { $blockers.Add('The Windows EFI System partition needs at least 15 MB free for rEFInd.') } }
    catch { $blockers.Add("EFI free-space check failed: $($_.Exception.Message)") }
    return @{ok=($blockers.Count -eq 0); plan=$plan; imagePath=$imagePath; imageSha256=$actualHash; refindPath=$refindPath; report=$report; blockers=[string[]]$blockers.ToArray(); diskWillChange=$false}
}
function Invoke-RP2SevenZip([string[]]$Arguments) {
    $exe = Join-Path (Split-Path -Parent $PSCommandPath) '7z.exe'
    if (-not $exe -or -not (Test-Path -LiteralPath $exe -PathType Leaf)) { throw 'The RP2 image extractor is missing. Install the newly built RP2 package again.' }
    & $exe @Arguments | Out-Null
    if ($LASTEXITCODE -ne 0) { throw "Batocera image extraction failed (7-Zip exit code $LASTEXITCODE)." }
}
function Install-DualBootBatocera {
    if (-not ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) { throw 'Administrator approval is required for partition changes.' }
    $stageRoot = Join-Path $env:ProgramData 'Ready Player Two\staging'
    $journalPath = Join-Path $stageRoot 'install-state.json'
    $previous = if (Test-Path -LiteralPath $journalPath -PathType Leaf) { Get-Content -LiteralPath $journalPath -Raw | ConvertFrom-Json } else { $null }
    $review = Get-DualBootStagedPlan
    $report = $review.report
    $plan = $review.plan
    $diskNumber = [int]$report.diskNumber
    $windowsNumber = [int]$report.windowsPartitionNumber
    $resumePrepared = $false
    $resumeBoot = $null
    $resumeShare = $null
    if ($previous -and $previous.phase -eq 'failed' -and @($previous.createdPartitions | Where-Object { $_ }).Count -eq 2 -and
        [int]$previous.diskNumber -eq $diskNumber -and [int]$previous.windowsPartitionNumber -eq $windowsNumber -and
        [int64]$report.windowsPartitionSizeBytes -eq [int64]$previous.requestedWindowsBytes -and
        [int64]$previous.requestedWindowsBytes -eq ([int64]$plan.windowsGb * 1GB)) {
        $resumeBoot = Get-Partition -DiskNumber $diskNumber -PartitionNumber ([int]$previous.createdPartitions[0]) -ErrorAction SilentlyContinue
        $resumeShare = Get-Partition -DiskNumber $diskNumber -PartitionNumber ([int]$previous.createdPartitions[1]) -ErrorAction SilentlyContinue
        $bootVolume = if ($resumeBoot) { Get-Volume -Partition $resumeBoot -ErrorAction SilentlyContinue } else { $null }
        $shareVolume = if ($resumeShare) { Get-Volume -Partition $resumeShare -ErrorAction SilentlyContinue } else { $null }
        $resumePrepared = [bool]($resumeBoot -and $resumeShare -and $bootVolume.FileSystemLabel -eq 'BATOCERA' -and
            $bootVolume.FileSystem -eq 'FAT32' -and $shareVolume.FileSystemLabel -eq 'SHARE' -and
            $report.firmwareType -eq 'UEFI' -and $report.partitionStyle -eq 'GPT' -and
            $report.bitLockerProtection -eq 'Off' -and $report.secureBoot -eq 'False' -and
            -not $report.diskOffline -and -not $report.diskReadOnly)
    }
    if (-not $review.ok -and -not $resumePrepared) { throw ('Drive preflight blocked installation: ' + ($review.blockers -join '; ')) }
    $efiBefore = @($report.partitions | Where-Object { $_.type -eq 'System' })[0]
    $recoveryBefore = @($report.partitions | Where-Object { $_.type -eq 'Recovery' })
    $windowsBytes = [int64]$plan.windowsGb * 1GB
    $workRoot = Join-Path $env:ProgramData ('Ready Player Two\work\' + [guid]::NewGuid().ToString('N'))
    $bootTree = Join-Path $workRoot 'boot-files'
    $imageFile = Join-Path $workRoot 'batocera-x86_64-43.1-20260529.img'
    $fatFile = Join-Path $workRoot '0.vfat.fat'
    $phase = 'preparing'
    $createdPartitions = [System.Collections.Generic.List[int]]::new()
    function Save-State([string]$CurrentPhase,[string]$Detail) {
        $state = @{phase=$CurrentPhase;detail=$Detail;diskNumber=$diskNumber;windowsPartitionNumber=$windowsNumber;originalWindowsBytes=[int64]$report.windowsPartitionSizeBytes;requestedWindowsBytes=$windowsBytes;createdPartitions=@($createdPartitions);updatedAt=(Get-Date).ToUniversalTime().ToString('o')}
        [IO.File]::WriteAllText($journalPath,($state | ConvertTo-Json -Depth 5),[Text.UTF8Encoding]::new($false))
    }
    if ($previous -and -not $resumePrepared) {
        if ($previous.phase -ne 'preparing') {
            $currentWindows = Get-Partition -DiskNumber $diskNumber -PartitionNumber $windowsNumber
            if ($previous.phase -ne 'failed' -or @($previous.createdPartitions | Where-Object { $_ }).Count -gt 0 -or [int64]$currentWindows.Size -ne [int64]$previous.originalWindowsBytes) {
                throw "A previous install stopped at '$($previous.phase)' after drive changes may have begun. Inspect install-state.json before trying again; RP2 will not repeat partition changes blindly."
            }
        }
    }
    $existing = @(Get-Partition -DiskNumber $diskNumber | ForEach-Object { Get-Volume -Partition $_ -ErrorAction SilentlyContinue } | Where-Object { $_.FileSystemLabel -in @('BATOCERA','SHARE') })
    if ($existing.Count -and -not $resumePrepared) { throw 'A BATOCERA or SHARE partition already exists on this disk. RP2 will not overwrite it.' }
    $volume = Get-Volume -DriveLetter $report.windowsDrive.TrimEnd(':')
    if ([int64]$volume.SizeRemaining -lt 32GB) { throw 'Windows needs at least 32 GB free to unpack and prepare this image before shrinking.' }
    New-Item -ItemType Directory -Path $bootTree -Force | Out-Null
    try {
        Save-State 'preparing' 'Extracting the verified Batocera image. Windows partitions are unchanged.'
        if ($plan.imageName -like '*.gz') { Invoke-RP2SevenZip @('x','-y',"-o$workRoot",$review.imagePath) }
        else { Copy-Item -LiteralPath $review.imagePath -Destination $imageFile -ErrorAction Stop }
        if (-not (Test-Path -LiteralPath $imageFile -PathType Leaf)) { throw 'The expected Batocera disk image was not extracted.' }
        Invoke-RP2SevenZip @('x','-y',"-o$workRoot",$imageFile,'0.vfat.fat')
        if (-not (Test-Path -LiteralPath $fatFile -PathType Leaf)) { throw 'The expected FAT32 boot partition was not extracted.' }
        Invoke-RP2SevenZip @('x','-y',"-o$bootTree",$fatFile)
        foreach ($required in @('EFI\batocera\bootx64.efi','boot\linux','boot\initrd.gz','batocera-boot.conf')) {
            if (-not (Test-Path -LiteralPath (Join-Path $bootTree $required) -PathType Leaf)) { throw "The Batocera boot tree is missing $required." }
        }
        foreach ($temporaryImage in @($imageFile,$fatFile)) { if (-not [string]::IsNullOrWhiteSpace($temporaryImage) -and (Test-Path -LiteralPath $temporaryImage)) { Remove-Item -LiteralPath $temporaryImage -Force } }
        if ($resumePrepared) {
            $boot = $resumeBoot
            $share = $resumeShare
            foreach ($partitionNumber in @([int]$boot.PartitionNumber,[int]$share.PartitionNumber)) { $createdPartitions.Add($partitionNumber) }
        } else {
            $fresh = Get-DualBootPreflight
            if ($fresh.diskNumber -ne $diskNumber -or $fresh.windowsPartitionNumber -ne $windowsNumber -or $fresh.firmwareType -ne 'UEFI' -or $fresh.partitionStyle -ne 'GPT' -or $fresh.bitLockerProtection -ne 'Off' -or $fresh.secureBoot -ne 'False') { throw 'The Windows drive changed or its safety checks no longer pass. No partition was changed.' }
            if ($windowsBytes -lt [int64]$fresh.smallestSupportedWindowsSizeBytes + 5GB -or $windowsBytes -ge [int64]$fresh.windowsPartitionSizeBytes - 12GB) { throw 'The selected Windows size is no longer safe or leaves less than 12 GB for Batocera.' }
            $currentEfi = @($fresh.partitions | Where-Object { $_.type -eq 'System' })[0]
            if ($currentEfi.offsetBytes -ne $efiBefore.offsetBytes -or $currentEfi.sizeBytes -ne $efiBefore.sizeBytes) { throw 'The EFI System partition changed. No partition was changed.' }
            foreach ($original in $recoveryBefore) {
                if (-not @($fresh.partitions | Where-Object { $_.type -eq 'Recovery' -and $_.offsetBytes -eq $original.offsetBytes -and $_.sizeBytes -eq $original.sizeBytes }).Count) { throw 'The Windows Recovery partition changed. No partition was changed.' }
            }
            Save-State 'resizing-windows' 'Shrinking only the verified Windows partition. EFI and Recovery partitions are not selected.'
            Resize-Partition -DiskNumber $diskNumber -PartitionNumber $windowsNumber -Size $windowsBytes -ErrorAction Stop
            $windowsNow = Get-Partition -DiskNumber $diskNumber -PartitionNumber $windowsNumber
            if ([int64]$windowsNow.Size -ne $windowsBytes) { throw 'Windows did not shrink to the requested size. No Batocera partition was created.' }
            $gapStart = [int64]$windowsNow.Offset + [int64]$windowsNow.Size
            $nextPartition = @(Get-Partition -DiskNumber $diskNumber | Where-Object { $_.Offset -gt $windowsNow.Offset } | Sort-Object Offset | Select-Object -First 1)
            $gapEnd = if ($nextPartition.Count) { [int64]$nextPartition[0].Offset } else { [int64](Get-Disk -Number $diskNumber).Size - 1MB }
            if ($gapEnd - $gapStart -lt 12GB) { throw 'The free area after Windows is smaller than 12 GB. Windows was shrunk, but no Batocera partition was created.' }
            Save-State 'creating-partitions' 'Creating Batocera partitions only in the free area after Windows.'
            $boot = New-Partition -DiskNumber $diskNumber -Offset $gapStart -Size 10GB -AssignDriveLetter -ErrorAction Stop
            $createdPartitions.Add([int]$boot.PartitionNumber)
            Format-Volume -Partition $boot -FileSystem FAT32 -NewFileSystemLabel 'BATOCERA' -Confirm:$false -Force -ErrorAction Stop | Out-Null
            $shareStart = [int64]$boot.Offset + [int64]$boot.Size
            $shareSize = [int64]([math]::Floor(($gapEnd - $shareStart - 1MB) / 1MB) * 1MB)
            if ($shareSize -lt 2GB) { throw 'Less than 2 GB remains for Batocera userdata. Windows and boot partitions were changed; no userdata partition was created.' }
            $share = New-Partition -DiskNumber $diskNumber -Offset $shareStart -Size $shareSize -AssignDriveLetter -ErrorAction Stop
            $createdPartitions.Add([int]$share.PartitionNumber)
            Format-Volume -Partition $share -FileSystem exFAT -NewFileSystemLabel 'SHARE' -Confirm:$false -Force -ErrorAction Stop | Out-Null
        }
        Save-State 'copying-boot-files' 'Copying the verified Batocera boot files. The boot menu has not been changed.'
        $boot = Get-Partition -DiskNumber $diskNumber -PartitionNumber $boot.PartitionNumber
        if (-not $boot.DriveLetter) { throw 'The BATOCERA partition has no drive letter for copying boot files.' }
        foreach ($entryPath in [IO.Directory]::EnumerateFileSystemEntries($bootTree)) {
            if ([string]::IsNullOrWhiteSpace($entryPath)) { throw 'The extracted Batocera boot tree returned an empty source path.' }
            Copy-Item -LiteralPath $entryPath -Destination "$($boot.DriveLetter):\" -Recurse -Force -ErrorAction Stop
        }
        $bootConfig = "$($boot.DriveLetter):\batocera-boot.conf"
        $configText = Get-Content -LiteralPath $bootConfig -Raw
        $configText = [regex]::Replace($configText,'(?m)^autoresize=true\s*$','autoresize=false')
        [IO.File]::WriteAllText($bootConfig,$configText,[Text.UTF8Encoding]::new($false))
        foreach ($required in @('EFI\batocera\bootx64.efi','boot\linux','boot\initrd.gz')) {
            if (-not (Test-Path -LiteralPath (Join-Path "$($boot.DriveLetter):\" $required) -PathType Leaf)) { throw "Boot file copy did not verify: $required." }
        }
        if (-not (Install-RP2BatoceraRuntimeBootstrap)) { throw 'The SHARE partition could not be prepared with the Batocera shared-drive runtime preflight.' }
        Save-State 'awaiting-refind' 'Batocera boot and userdata partitions prepared. rEFInd has not yet been installed.'
        return @{ok=$true;diskNumber=$diskNumber;batoceraPartition=$boot.PartitionNumber;sharePartition=$share.PartitionNumber;defaultOs=$plan.defaultOs;bootMenuInstalled=$false}
    } catch {
        $message = $_.Exception.Message
        if ($_.InvocationInfo.ScriptLineNumber) { $message += " (RP2 setup line $($_.InvocationInfo.ScriptLineNumber))" }
        Save-State 'failed' $message
        throw
    } finally {
        $fullWork = [IO.Path]::GetFullPath($workRoot)
        $allowedRoot = [IO.Path]::GetFullPath((Join-Path $env:ProgramData 'Ready Player Two\work'))
        if ($fullWork.StartsWith($allowedRoot.TrimEnd('\') + '\',[StringComparison]::OrdinalIgnoreCase)) { Remove-Item -LiteralPath $fullWork -Recurse -Force -ErrorAction SilentlyContinue }
    }
}
function Set-RP2InstallState([string]$Phase,[string]$Detail) {
    $statePath = Join-Path $env:ProgramData 'Ready Player Two\staging\install-state.json'
    if (-not (Test-Path -LiteralPath $statePath -PathType Leaf)) { throw 'The Batocera partition journal is missing. The boot manager will not be changed.' }
    $state = Get-Content -LiteralPath $statePath -Raw | ConvertFrom-Json
    $state.phase = $Phase
    $state.detail = $Detail
    $state.updatedAt = (Get-Date).ToUniversalTime().ToString('o')
    [IO.File]::WriteAllText($statePath,($state | ConvertTo-Json -Depth 6),[Text.UTF8Encoding]::new($false))
}
function Install-RP2Refind {
    if (-not ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) { throw 'Administrator approval is required to install the boot menu.' }
    $stageRoot = Join-Path $env:ProgramData 'Ready Player Two\staging'
    $journalPath = Join-Path $stageRoot 'install-state.json'
    if (-not (Test-Path -LiteralPath $journalPath -PathType Leaf)) { throw 'The partition journal is missing. rEFInd was not installed.' }
    $journal = Get-Content -LiteralPath $journalPath -Raw | ConvertFrom-Json
    if ($journal.phase -ne 'awaiting-refind') { throw "The partition journal is at '$($journal.phase)', not awaiting-refind. rEFInd was not installed." }
    $plan = Get-Content -LiteralPath (Join-Path $stageRoot 'plan.json') -Raw | ConvertFrom-Json
    if ($plan.schema -ne 1 -or [string]$plan.targetComputerName -ine $env:COMPUTERNAME -or $plan.defaultOs -notin @('windows','batocera')) { throw 'The staged boot plan does not match this Windows PC.' }
    $zipPath = Join-Path $stageRoot 'refind-bin-0.14.2.zip'
    if (-not (Test-Path -LiteralPath $zipPath -PathType Leaf) -or (Get-FileHash -LiteralPath $zipPath -Algorithm SHA256).Hash.ToLowerInvariant() -cne '410c7828c4fec2f2179bd956073522415831d27c00416381b8f71153c190a311') { throw 'The approved rEFInd 0.14.2 package is missing or failed SHA-256 verification.' }
    $report = Get-DualBootPreflight
    if ($report.firmwareType -ne 'UEFI' -or $report.partitionStyle -ne 'GPT' -or $report.secureBoot -ne 'False' -or $report.bitLockerProtection -ne 'Off' -or $report.diskNumber -ne [int]$journal.diskNumber -or $report.windowsPartitionNumber -ne [int]$journal.windowsPartitionNumber) { throw 'The Windows boot environment changed since partition preparation. rEFInd was not installed.' }
    if ([int64]$report.windowsPartitionSizeBytes -ne [int64]$journal.requestedWindowsBytes -or @($journal.createdPartitions).Count -ne 2) { throw 'The prepared Windows and Batocera partition layout does not match the install journal.' }
    $batocera = @(Get-Volume -FileSystemLabel 'BATOCERA' -ErrorAction SilentlyContinue)
    if ($batocera.Count -ne 1 -or -not $batocera[0].DriveLetter) { throw 'Exactly one mounted BATOCERA volume is required before installing rEFInd.' }
    $bootPartition = Get-Partition -DriveLetter $batocera[0].DriveLetter -ErrorAction Stop
    if ($bootPartition.DiskNumber -ne [int]$journal.diskNumber -or $bootPartition.PartitionNumber -ne [int]$journal.createdPartitions[0]) { throw 'The BATOCERA volume is not the partition RP2 created.' }
    $shareVolumes = @(Get-Volume -FileSystemLabel 'SHARE' -ErrorAction SilentlyContinue)
    if ($shareVolumes.Count -ne 1 -or -not $shareVolumes[0].DriveLetter) { throw 'The Batocera userdata volume is missing.' }
    $sharePartition = Get-Partition -DriveLetter $shareVolumes[0].DriveLetter -ErrorAction Stop
    if ($sharePartition.DiskNumber -ne [int]$journal.diskNumber -or $sharePartition.PartitionNumber -ne [int]$journal.createdPartitions[1]) { throw 'The SHARE volume is not the partition RP2 created.' }
    if (-not (Test-Path -LiteralPath "$($batocera[0].DriveLetter):\EFI\batocera\bootx64.efi" -PathType Leaf)) { throw 'The Batocera EFI boot file is missing. rEFInd was not installed.' }
    $workRoot = Join-Path $env:ProgramData ('Ready Player Two\work\refind-' + [guid]::NewGuid().ToString('N'))
    $backupRoot = Join-Path $env:ProgramData ('Ready Player Two\boot-backup\' + (Get-Date).ToUniversalTime().ToString('yyyyMMdd-HHmmss'))
    $mountedLetter = $null
    $efiMounted = $false
    $bootPathChanged = $false
    try {
        New-Item -ItemType Directory -Path $workRoot,$backupRoot -Force | Out-Null
        Expand-Archive -LiteralPath $zipPath -DestinationPath $workRoot -ErrorAction Stop
        $sourceDir = Join-Path $workRoot 'refind-bin-0.14.2\refind'
        $sourceEfi = Join-Path $sourceDir 'refind_x64.efi'
        if (-not (Test-Path -LiteralPath $sourceEfi -PathType Leaf)) { throw 'The verified rEFInd package lacks its x64 EFI loader.' }
        foreach ($candidate in @('R','S','T','U','V','W','X','Y','Z')) {
            if (-not (Test-Path -LiteralPath "$candidate`:")) { $mountedLetter = $candidate; break }
        }
        if (-not $mountedLetter) { throw 'No free drive letter is available to inspect the EFI System partition.' }
        & mountvol.exe "$mountedLetter`:" /S | Out-Null
        if ($LASTEXITCODE -ne 0) { throw 'Windows could not mount its EFI System partition.' }
        $efiMounted = $true
        $efiRoot = "$mountedLetter`:"
        $windowsBoot = Join-Path $efiRoot 'EFI\Microsoft\Boot\bootmgfw.efi'
        if (-not (Test-Path -LiteralPath $windowsBoot -PathType Leaf)) { throw 'The Windows EFI boot file was not found. rEFInd was not installed.' }
        $targetDir = Join-Path $efiRoot 'EFI\refind'
        if (Test-Path -LiteralPath $targetDir) { throw 'An EFI rEFInd installation already exists. RP2 will not overwrite it.' }
        $efiDrive = [IO.DriveInfo]::new("$mountedLetter`:\")
        if ([int64]$efiDrive.AvailableFreeSpace -lt 15MB) { throw 'The EFI System partition has less than 15 MB free. rEFInd was not installed.' }
        $bcdBackup = Join-Path $backupRoot 'BCD-before-refind'
        & bcdedit.exe /export $bcdBackup | Out-Null
        if ($LASTEXITCODE -ne 0 -or -not (Test-Path -LiteralPath $bcdBackup -PathType Leaf)) { throw 'Windows boot configuration could not be backed up. rEFInd was not installed.' }
        Set-RP2InstallState 'installing-refind' 'Installing verified rEFInd files; original Windows boot configuration backed up.'
        New-Item -ItemType Directory -Path $targetDir -ErrorAction Stop | Out-Null
        Copy-Item -LiteralPath $sourceEfi -Destination (Join-Path $targetDir 'refind_x64.efi') -ErrorAction Stop
        $icons = Join-Path $sourceDir 'icons'
        foreach ($icon in @('os_win.png','os_linux.png')) {
            if (-not (Test-Path -LiteralPath (Join-Path $icons $icon) -PathType Leaf)) { throw "The pinned rEFInd package lacks $icon. The boot menu was not installed." }
        }
        Copy-Item -LiteralPath $icons -Destination $targetDir -Recurse -ErrorAction Stop
        $windowsIconSource=[string]$WindowsBootIconPath
        $batoceraIconSource=[string]$BatoceraBootIconPath
        if (-not (Test-Path -LiteralPath $windowsIconSource -PathType Leaf) -or -not (Test-Path -LiteralPath $batoceraIconSource -PathType Leaf)) { throw 'The embedded RP2 boot-menu logos are unavailable. rEFInd was not installed.' }
        $themeDir=Join-Path $targetDir 'themes\rp1'
        New-Item -ItemType Directory -Path $themeDir -Force -ErrorAction Stop | Out-Null
        Copy-Item -LiteralPath $windowsIconSource -Destination (Join-Path $themeDir 'windows11.png') -ErrorAction Stop
        Copy-Item -LiteralPath $batoceraIconSource -Destination (Join-Path $themeDir 'batocera.png') -ErrorAction Stop
        $defaultName = if ($plan.defaultOs -eq 'batocera') { 'Batocera' } else { 'Windows 11' }
        $config = @(
            'timeout 30',
            'textonly false',
            'big_icon_size 384',
            'scanfor manual',
            'showtools',
            'hideui banner,hints,badges',
            "default_selection `"$defaultName`"",
            'menuentry "Windows 11" {',
            '    icon \EFI\refind\themes\rp1\windows11.png',
            '    loader \EFI\Microsoft\Boot\bootmgfw.efi',
            '}',
            'menuentry "Batocera" {',
            '    icon \EFI\refind\themes\rp1\batocera.png',
            '    volume BATOCERA',
            '    loader \EFI\batocera\bootx64.efi',
            '}'
        )
        [IO.File]::WriteAllLines((Join-Path $targetDir 'refind.conf'),$config,[Text.UTF8Encoding]::new($false))
        if ((Get-FileHash -LiteralPath (Join-Path $targetDir 'refind_x64.efi') -Algorithm SHA256).Hash -ne (Get-FileHash -LiteralPath $sourceEfi -Algorithm SHA256).Hash) { throw 'The rEFInd EFI loader copy did not verify.' }
        & bcdedit.exe /set '{bootmgr}' path '\EFI\refind\refind_x64.efi' | Out-Null
        if ($LASTEXITCODE -ne 0) { throw 'Windows rejected the rEFInd boot path.' }
        $bootPathChanged = $true
        $bootManager = (& bcdedit.exe /enum '{bootmgr}' | Out-String)
        if ($LASTEXITCODE -ne 0 -or $bootManager -notmatch [regex]::Escape('\EFI\refind\refind_x64.efi')) { throw 'The new boot path did not verify.' }
        Set-RP2InstallState 'awaiting-first-boot' 'rEFInd and Batocera boot entries installed. Reboot and test both Windows and Batocera before considering dual boot verified.'
        return @{ok=$true;phase='awaiting-first-boot';defaultOs=$plan.defaultOs;backupPath=$bcdBackup;bootMenuInstalled=$true}
    } catch {
        $failure = $_.Exception.Message
        if ($bootPathChanged) {
            & bcdedit.exe /set '{bootmgr}' path '\EFI\Microsoft\Boot\bootmgfw.efi' | Out-Null
            $failure += $(if ($LASTEXITCODE -eq 0) { ' Windows boot path was restored.' } else { ' WARNING: Windows boot path restoration failed; use recovery media before rebooting.' })
        }
        try { Set-RP2InstallState 'failed' $failure } catch {}
        throw $failure
    } finally {
        if ($efiMounted) { & mountvol.exe "$mountedLetter`:" /D | Out-Null }
        $fullWork = [IO.Path]::GetFullPath($workRoot)
        $allowedRoot = [IO.Path]::GetFullPath((Join-Path $env:ProgramData 'Ready Player Two\work'))
        if ($fullWork.StartsWith($allowedRoot.TrimEnd('\') + '\',[StringComparison]::OrdinalIgnoreCase)) { Remove-Item -LiteralPath $fullWork -Recurse -Force -ErrorAction SilentlyContinue }
    }
}
function Enable-BlankPasswordNetworkLogon([string]$Account,[string]$ReadPath) {
    # This is an explicit, machine-wide opt-in. Never change these policies
    # during read-only status/inspection or when the checkbox is not selected.
    $sid = ([Security.Principal.NTAccount]::new($Account)).Translate([Security.Principal.SecurityIdentifier])
    if ($sid.Value -match '-501$') { throw 'Guest cannot be used for RP2 sharing.' }
    $localUser = Get-LocalUser -SID $sid -ErrorAction Stop
    if (-not $localUser.Enabled) { throw 'The selected Windows account is disabled.' }
    if ($localUser.AccountExpires -and $localUser.AccountExpires -lt (Get-Date)) { throw 'The selected Windows account has expired.' }
    $policyPath = 'HKLM:\SYSTEM\CurrentControlSet\Control\Lsa'
    New-ItemProperty -LiteralPath $policyPath -Name ForceGuest -PropertyType DWord -Value 0 -Force | Out-Null
    New-ItemProperty -LiteralPath $policyPath -Name LimitBlankPasswordUse -PropertyType DWord -Value 0 -Force | Out-Null
    if ((Get-ItemPropertyValue -LiteralPath $policyPath -Name LimitBlankPasswordUse) -ne 0) { throw 'Blank-password policy verification failed.' }
    if ((Get-ItemPropertyValue -LiteralPath $policyPath -Name ForceGuest) -ne 0) { throw 'Windows is still mapping local logins to Guest. Organization policy may be overriding setup.' }
    Add-Type -TypeDefinition @'
using System;
using System.ComponentModel;
using System.IO;
using System.Runtime.InteropServices;
using System.Security.Principal;
public static class RP2BlankPasswordLoginCheck {
  [DllImport("advapi32.dll", CharSet=CharSet.Unicode, SetLastError=true)]
  static extern bool LogonUser(string user, string domain, string password, int type, int provider, out IntPtr token);
  [DllImport("kernel32.dll")] static extern bool CloseHandle(IntPtr handle);
  public static void Verify(string user, string domain, string readPath) {
    IntPtr token;
    if (!LogonUser(user, domain, "", 3, 0, out token)) throw new Win32Exception(Marshal.GetLastWin32Error());
    try {
      if (!String.IsNullOrEmpty(readPath)) {
        using (WindowsImpersonationContext context = WindowsIdentity.Impersonate(token)) {
          Directory.GetFileSystemEntries(readPath);
        }
      }
    } finally { CloseHandle(token); }
  }
}
'@
    $result = @{verified=$false; warning=''; log=@('Allowed blank-password network logons for ALL local accounts and selected Classic authentication. No password was changed. This PC-wide setting is less secure.')}
    try {
        [RP2BlankPasswordLoginCheck]::Verify($localUser.Name,$env:COMPUTERNAME,$ReadPath)
        $result.verified = $true
        $result.log += 'One blank-password network login and local read-access check passed. Remote SMB access is not yet verified.'
    } catch {
        $cause = $_.Exception
        while ($cause.InnerException) { $cause = $cause.InnerException }
        $result.warning = switch ($cause.NativeErrorCode) {
            1326 { 'Windows rejected an empty password. A PIN or automatic sign-in does not mean the account password is blank; use its real password in RP1.' }
            1327 { 'Windows still restricts this account from network sign-in. Check local security policy or use a password-protected account.' }
            1385 { 'Windows policy denies network logon for this account. Use an account permitted network access.' }
            1909 { 'This account is locked. Stop login attempts and unlock it before retrying.' }
            default { "Blank-password login or report access was not verified: $($cause.Message)" }
        }
        $result.log += $result.warning
        $result.log += 'No automatic login retry was attempted; explicitly enabled PC-wide policies remain in effect.'
    }
    return $result
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
    if ($request.action -eq 'dual-boot-diagnostic') {
        Finish (Get-RP2BootDiagnostic)
        exit
    }
    if ($request.action -eq 'dual-boot-repair-menu') {
        try { $repairResult=Repair-RP2BootMenu }
        catch { $repairResult=@{ok=$false;changed=$false;error=$_.Exception.Message} }
        $repairResult.capturedAt=(Get-Date).ToUniversalTime().ToString('o')
        [IO.File]::WriteAllText((Join-Path $env:ProgramData 'Ready Player Two\status\boot-repair.json'),($repairResult | ConvertTo-Json -Depth 5),[Text.UTF8Encoding]::new($false))
        Finish $repairResult
        exit
    }
    if ($request.action -eq 'dual-boot-review-stage') {
        Finish (Get-DualBootStagedPlan)
        exit
    }
    if ($request.action -eq 'dual-boot-remote-install') {
        if ($request.schema -ne 1 -or $request.backupConfirmed -ne $true -or $request.recoveryMediaConfirmed -ne $true -or [string]$request.targetComputerName -ine $env:COMPUTERNAME) { throw 'The RP1 install request lacks the required target and backup confirmation.' }
        if ([string]$request.requestId -cnotmatch '^[0-9a-f-]{36}$' -or [string]$request.planSha256 -cnotmatch '^[0-9a-f]{64}$') { throw 'The RP1 install request identifiers are invalid.' }
        $created = [datetime]::Parse([string]$request.createdAt).ToUniversalTime()
        if ([math]::Abs(((Get-Date).ToUniversalTime() - $created).TotalMinutes) -gt 120) { throw 'The RP1 install request expired. No drive change was made.' }
        $stageRoot = Join-Path $env:ProgramData 'Ready Player Two\staging'
        $planPath = Join-Path $stageRoot 'plan.json'
        if ((Get-FileHash -LiteralPath $planPath -Algorithm SHA256).Hash.ToLowerInvariant() -cne [string]$request.planSha256) { throw 'The staged plan changed after RP1 confirmation.' }
        $existingBoot = Get-RP2BootDiagnostic
        $existingBatocera = @(Get-Volume -FileSystemLabel 'BATOCERA' -ErrorAction SilentlyContinue)
        if (-not $existingBoot.error -and $existingBoot.refindLoaderExists -and $existingBatocera.Count -eq 1) {
            try {
                try { $repair = Repair-RP2BootMenu }
                catch {
                    $null = Restore-RP2ManagedInstallJournal
                    $repair = Repair-RP2BootMenu
                }
                Finish @{ok=$true; existingInstall=$true; changed=[bool]$repair.changed; phase='complete'; detail=$(if($repair.changed){'The existing RP2-managed dual boot was verified and its boot menu was repaired.'}else{'The existing RP2-managed dual boot was verified; no disk or boot-menu change was needed.'})}
                exit
            } catch {
                throw "An existing Batocera and rEFInd installation was found, but RP2 could not verify it as the matching managed installation. No partition or boot file was overwritten. $($_.Exception.Message)"
            }
        }
        $review = Get-DualBootStagedPlan
        if ([int]$request.diskNumber -ne [int]$review.report.diskNumber -or [int]$request.windowsGb -ne [int]$review.plan.windowsGb -or [string]$request.defaultOs -cne [string]$review.plan.defaultOs) { throw 'The live disk or requested options differ from the confirmed RP1 plan.' }
        $partitions = Install-DualBootBatocera
        Finish (Install-RP2Refind)
        exit
    }
    if ([string]$request.platform -eq 'all') {
        $programs = @(Get-InstalledPrograms)
        if (-not $programs.Count) {
            if ($request.action -eq 'status') {
                $networks = @(Get-HomeNetworks)
                $blankPolicy = Get-ItemPropertyValue -LiteralPath 'HKLM:\SYSTEM\CurrentControlSet\Control\Lsa' -Name LimitBlankPasswordUse -ErrorAction SilentlyContinue
                Finish @{ok=$true; computer=$env:COMPUTERNAME; account=[Security.Principal.WindowsIdentity]::GetCurrent().Name; detected=@(); shares=@(); networks=$networks; blankPasswordAllowed=($null -ne $blankPolicy -and $blankPolicy -eq 0)}
            } else {
                $account = ([string]$request.account).Trim()
                Install-RP2StatusShare $account ([int]$request.interfaceIndex) ([bool]$request.makePrivate)
                Install-RP2StageShare $account
                Install-RP2DualBootWorker $account
                $bootLog=[System.Collections.Generic.List[string]]::new()
                Invoke-RP2ManagedBootMaintenance $bootLog
                $blankResult = $null
                if ($request.allowBlankPassword -eq $true) {
                    $blankResult = Enable-BlankPasswordNetworkLogon $account (Join-Path $env:ProgramData 'Ready Player Two\status')
                }
                Install-RP1Beacon @() $account
                Send-RP1Announcement @() ([int]$request.interfaceIndex) $account
                Finish @{ok=$true; computer=$env:COMPUTERNAME; account=$account; loginVerified=$(if($null -ne $blankResult){$blankResult.verified}else{$null}); warning=$(if($null -ne $blankResult){$blankResult.warning}else{''}); log=@('Windows discovery and the protected RP2 dual-boot worker are installed.','RP2Status and RP2Stage shares installed for this account.') + $bootLog.ToArray() + $(if($null -ne $blankResult){@($blankResult.log)}else{@()}); paths=@(); detected=@(); shares=@()}
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
                Install-RP2StageShare ([string]$results[0].account)
                Install-RP2DualBootWorker ([string]$results[0].account)
                $bootLog=[System.Collections.Generic.List[string]]::new()
                Invoke-RP2ManagedBootMaintenance $bootLog
                $allLogs += $bootLog.ToArray()
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
        $blankResult = Enable-BlankPasswordNetworkLogon $account $libraryPath
        $loginVerified = $blankResult.verified
        $loginWarning = $blankResult.warning
        foreach ($line in $blankResult.log) { $log.Add([string]$line) }
    }
    $addresses = @(Get-NetIPAddress -InterfaceIndex $profile.InterfaceIndex -AddressFamily IPv4 | Where-Object IPAddress -notlike '169.254.*' | Select-Object -ExpandProperty IPAddress)
    $paths = @($addresses | ForEach-Object { "\\$_\$shareName" })
    $log.Add('Local share setup verified. A connection from the Ready Player One PC is still needed to verify network access.')
    Finish @{ok=$true; shareConfigured=$true; loginVerified=$loginVerified; warning=$loginWarning; remoteVerified=$false; log=@($log); paths=$paths; account=$account; sharePath=$verified.Path}
} catch {
    Finish @{ok=$false; error=$_.Exception.Message; log=@($log)}
    exit 1
}
