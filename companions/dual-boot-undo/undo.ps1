param([string]$IconPath)
$ErrorActionPreference='Stop'
Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Drawing
[Windows.Forms.Application]::EnableVisualStyles()

function Show-Message([string]$Text,[string]$Title='Dual Boot Undo',[Windows.Forms.MessageBoxIcon]$Icon=[Windows.Forms.MessageBoxIcon]::Information) {
    [Windows.Forms.MessageBox]::Show($Text,$Title,[Windows.Forms.MessageBoxButtons]::OK,$Icon) | Out-Null
}
function Relaunch-Elevated {
    $principal=[Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()
    if ($principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) { return $false }
    $args=@('-NoProfile','-STA','-ExecutionPolicy','Bypass','-File',('"'+$PSCommandPath+'"'),'-IconPath',('"'+$IconPath+'"'))
    Start-Process powershell.exe -Verb RunAs -ArgumentList ($args -join ' ')
    return $true
}
if (Relaunch-Elevated) { exit }

$journalPath=Join-Path $env:ProgramData 'Ready Player Two\staging\install-state.json'
$form=New-Object Windows.Forms.Form
$form.Text='Dual Boot Undo 1.0.0';$form.StartPosition='CenterScreen';$form.Size=New-Object Drawing.Size(720,510);$form.MinimumSize=$form.Size;$form.MaximumSize=$form.Size;$form.BackColor=[Drawing.Color]::FromArgb(13,18,28);$form.ForeColor=[Drawing.Color]::White;$form.Font=New-Object Drawing.Font('Segoe UI',11)
if(Test-Path -LiteralPath $IconPath){$picture=New-Object Windows.Forms.PictureBox;$picture.Location=New-Object Drawing.Point(28,25);$picture.Size=New-Object Drawing.Size(128,128);$picture.SizeMode='Zoom';$picture.Image=[Drawing.Image]::FromFile($IconPath);$form.Controls.Add($picture)}
$title=New-Object Windows.Forms.Label;$title.Text='DUAL BOOT UNDO';$title.Font=New-Object Drawing.Font('Segoe UI Semibold',24,[Drawing.FontStyle]::Bold);$title.AutoSize=$true;$title.Location=New-Object Drawing.Point(175,31);$form.Controls.Add($title)
$subtitle=New-Object Windows.Forms.Label;$subtitle.Text='Safely return this RP2-managed computer to Windows only.';$subtitle.AutoSize=$true;$subtitle.ForeColor=[Drawing.Color]::FromArgb(121,183,255);$subtitle.Location=New-Object Drawing.Point(179,83);$form.Controls.Add($subtitle)
$status=New-Object Windows.Forms.TextBox;$status.Multiline=$true;$status.ReadOnly=$true;$status.ScrollBars='Vertical';$status.Location=New-Object Drawing.Point(28,175);$status.Size=New-Object Drawing.Size(648,190);$status.BackColor=[Drawing.Color]::FromArgb(23,30,43);$status.ForeColor=[Drawing.Color]::White;$status.BorderStyle='FixedSingle';$form.Controls.Add($status)
$inspect=New-Object Windows.Forms.Button;$inspect.Text='Inspect';$inspect.Location=New-Object Drawing.Point(351,393);$inspect.Size=New-Object Drawing.Size(140,46);$inspect.FlatStyle='Flat';$inspect.BackColor=[Drawing.Color]::FromArgb(36,50,72);$inspect.ForeColor=[Drawing.Color]::White;$form.Controls.Add($inspect)
$undo=New-Object Windows.Forms.Button;$undo.Text='Undo Dual Boot';$undo.Location=New-Object Drawing.Point(506,393);$undo.Size=New-Object Drawing.Size(170,46);$undo.FlatStyle='Flat';$undo.BackColor=[Drawing.Color]::FromArgb(191,52,61);$undo.ForeColor=[Drawing.Color]::White;$undo.Enabled=$false;$form.Controls.Add($undo)

$script:journal=$null;$script:bootPartition=$null;$script:sharePartition=$null
function Inspect-ManagedInstall {
    if(-not(Test-Path -LiteralPath $journalPath -PathType Leaf)){throw 'RP2 installation journal not found. Nothing will be removed.'}
    $journal=Get-Content -LiteralPath $journalPath -Raw | ConvertFrom-Json
    if([string]$journal.targetComputerName -and [string]$journal.targetComputerName -ine $env:COMPUTERNAME){throw 'The journal belongs to a different computer. Nothing will be removed.'}
    if(@($journal.createdPartitions).Count -ne 2){throw 'The journal does not identify exactly two RP2-created partitions.'}
    $disk=[int]$journal.diskNumber;$boot=Get-Partition -DiskNumber $disk -PartitionNumber ([int]$journal.createdPartitions[0]) -ErrorAction Stop;$share=Get-Partition -DiskNumber $disk -PartitionNumber ([int]$journal.createdPartitions[1]) -ErrorAction Stop
    $bootVolume=Get-Volume -Partition $boot -ErrorAction Stop;$shareVolume=Get-Volume -Partition $share -ErrorAction Stop
    if($bootVolume.FileSystemLabel -ne 'BATOCERA' -or $bootVolume.FileSystem -ne 'FAT32'){throw 'The recorded boot partition no longer matches the RP2-managed BATOCERA partition.'}
    if($shareVolume.FileSystemLabel -ne 'SHARE'){throw 'The recorded userdata partition no longer matches the RP2-managed SHARE partition.'}
    $windows=Get-Partition -DiskNumber $disk -PartitionNumber ([int]$journal.windowsPartitionNumber) -ErrorAction Stop
    if(-not $windows.DriveLetter){throw 'The recorded Windows partition is not mounted.'}
    $script:journal=$journal;$script:bootPartition=$boot;$script:sharePartition=$share
    return "Verified RP2 journal on $env:COMPUTERNAME.`r`nDisk $disk`r`nWindows: $($windows.DriveLetter): (partition $($windows.PartitionNumber))`r`nBatocera: partition $($boot.PartitionNumber)`r`nSHARE: partition $($share.PartitionNumber)`r`n`r`nReady to restore Windows Boot Manager, remove RP2 rEFInd, delete these two recorded partitions, and return their free space to Windows."
}
$inspect.Add_Click({try{$status.Text=Inspect-ManagedInstall;$status.ForeColor=[Drawing.Color]::White;$undo.Enabled=$true}catch{$status.Text=$_.Exception.Message;$status.ForeColor=[Drawing.Color]::FromArgb(255,105,105);$undo.Enabled=$false}})
$undo.Add_Click({
    try {
        $status.Text=Inspect-ManagedInstall
        $answer=[Windows.Forms.MessageBox]::Show("This permanently removes the RP2-managed Batocera and SHARE partitions and their contents, restores Windows Boot Manager, and expands Windows into the recovered space.`r`n`r`nContinue?",'Confirm Dual Boot Undo',[Windows.Forms.MessageBoxButtons]::YesNo,[Windows.Forms.MessageBoxIcon]::Warning)
        if($answer -ne [Windows.Forms.DialogResult]::Yes){return}
        $undo.Enabled=$false;$inspect.Enabled=$false;$form.UseWaitCursor=$true;$form.Refresh()
        $backupRoot=Join-Path $env:ProgramData ('Ready Player Two\undo-backup\'+(Get-Date).ToUniversalTime().ToString('yyyyMMdd-HHmmss'));New-Item -ItemType Directory -Path $backupRoot -Force | Out-Null
        Copy-Item -LiteralPath $journalPath -Destination (Join-Path $backupRoot 'install-state.before-undo.json') -Force
        & bcdedit.exe /export (Join-Path $backupRoot 'BCD-before-undo') | Out-Null;if($LASTEXITCODE -ne 0){throw 'Could not back up the current Windows boot configuration.'}
        $letter=$null;foreach($candidate in @('R','S','T','U','V','W','X','Y','Z')){if(-not(Test-Path "$candidate`:")){$letter=$candidate;break}};if(-not $letter){throw 'No free drive letter is available to inspect EFI.'}
        & mountvol.exe "$letter`:" /S | Out-Null;if($LASTEXITCODE -ne 0){throw 'Could not mount the EFI System partition.'}
        try{$refind=Join-Path "$letter`:" 'EFI\refind';if(-not(Test-Path -LiteralPath $refind)){throw 'The recorded RP2 rEFInd folder is missing.'};$config=Join-Path $refind 'refind.conf';if(-not(Test-Path -LiteralPath $config) -or (Get-Content -LiteralPath $config -Raw) -notmatch 'volume BATOCERA'){throw 'The EFI rEFInd folder is not verified as RP2-managed.'};Copy-Item -LiteralPath $refind -Destination (Join-Path $backupRoot 'refind') -Recurse -Force;& bcdedit.exe /set '{bootmgr}' path '\EFI\Microsoft\Boot\bootmgfw.efi' | Out-Null;if($LASTEXITCODE -ne 0){throw 'Windows rejected restoration of Windows Boot Manager.'};Remove-Item -LiteralPath $refind -Recurse -Force}finally{& mountvol.exe "$letter`:" /D | Out-Null}
        Remove-Partition -DiskNumber ([int]$script:journal.diskNumber) -PartitionNumber ([int]$script:sharePartition.PartitionNumber) -Confirm:$false -ErrorAction Stop
        Remove-Partition -DiskNumber ([int]$script:journal.diskNumber) -PartitionNumber ([int]$script:bootPartition.PartitionNumber) -Confirm:$false -ErrorAction Stop
        $windows=Get-Partition -DiskNumber ([int]$script:journal.diskNumber) -PartitionNumber ([int]$script:journal.windowsPartitionNumber) -ErrorAction Stop;$supported=Get-PartitionSupportedSize -DiskNumber $windows.DiskNumber -PartitionNumber $windows.PartitionNumber -ErrorAction Stop;Resize-Partition -DiskNumber $windows.DiskNumber -PartitionNumber $windows.PartitionNumber -Size $supported.SizeMax -ErrorAction Stop
        $script:journal.phase='undone';$script:journal.detail='Dual Boot Undo restored Windows-only boot and reclaimed RP2-created partitions.';$script:journal | Add-Member -NotePropertyName undoneAt -NotePropertyValue (Get-Date).ToUniversalTime().ToString('o') -Force;$script:journal | Add-Member -NotePropertyName undoBackupPath -NotePropertyValue $backupRoot -Force;[IO.File]::WriteAllText($journalPath,($script:journal|ConvertTo-Json -Depth 12),[Text.UTF8Encoding]::new($false))
        $status.Text="Dual Boot Undo completed successfully.`r`n`r`nWindows Boot Manager restored.`r`nRP2 rEFInd removed.`r`nBATOCERA and SHARE removed.`r`nWindows expanded.`r`nRecovery record: $backupRoot";$status.ForeColor=[Drawing.Color]::FromArgb(105,224,139);Show-Message 'Dual Boot Undo completed. Restart the PC to verify that it boots directly into Windows.'
    }catch{$status.Text="Undo stopped safely: $($_.Exception.Message)";$status.ForeColor=[Drawing.Color]::FromArgb(255,105,105);Show-Message $status.Text 'Dual Boot Undo' ([Windows.Forms.MessageBoxIcon]::Error)}finally{$form.UseWaitCursor=$false;$inspect.Enabled=$true}
})
$inspect.PerformClick();[void]$form.ShowDialog()
