param([string]$IconPath)
$ErrorActionPreference='Stop'
Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Drawing
[Windows.Forms.Application]::EnableVisualStyles()
trap {
    $message=$_.Exception.Message
    try { [IO.File]::WriteAllText((Join-Path $env:TEMP 'Ready-Player-Two-Dual-Boot-Undo-error.txt'),$_.Exception.ToString(),[Text.UTF8Encoding]::new($false)) } catch {}
    [Windows.Forms.MessageBox]::Show("Dual Boot Undo could not start.`r`n`r`n$message`r`n`r`nA diagnostic was saved in the Windows temporary folder.",'Dual Boot Undo',[Windows.Forms.MessageBoxButtons]::OK,[Windows.Forms.MessageBoxIcon]::Error) | Out-Null
    exit 1
}

function Show-Message([string]$Text,[string]$Title='Dual Boot Undo',[Windows.Forms.MessageBoxIcon]$Icon=[Windows.Forms.MessageBoxIcon]::Information) {
    [Windows.Forms.MessageBox]::Show($Text,$Title,[Windows.Forms.MessageBoxButtons]::OK,$Icon) | Out-Null
}
function Confirm-DeleteAll {
    $dialog=New-Object Windows.Forms.Form
    $dialog.Text='Confirm Permanent Data Deletion';$dialog.StartPosition='CenterParent';$dialog.Size=New-Object Drawing.Size(650,360);$dialog.MinimumSize=$dialog.Size;$dialog.MaximumSize=$dialog.Size;$dialog.BackColor=[Drawing.Color]::FromArgb(13,18,28);$dialog.ForeColor=[Drawing.Color]::White;$dialog.Font=New-Object Drawing.Font('Segoe UI',11);$dialog.FormBorderStyle='FixedDialog';$dialog.MaximizeBox=$false;$dialog.MinimizeBox=$false
    $heading=New-Object Windows.Forms.Label;$heading.Text='THIS DELETES ALL BATOCERA DATA';$heading.Font=New-Object Drawing.Font('Segoe UI Semibold',18,[Drawing.FontStyle]::Bold);$heading.ForeColor=[Drawing.Color]::FromArgb(255,105,105);$heading.AutoSize=$true;$heading.Location=New-Object Drawing.Point(28,24);$dialog.Controls.Add($heading)
    $warning=New-Object Windows.Forms.Label;$warning.Text="Dual Boot Undo permanently deletes the Batocera and SHARE partitions, including all games, saves, artwork, BIOS files, settings, and other data stored there. Windows remains and its partition is expanded into the recovered space.`r`n`r`nTo continue, type Delete All below (capitalization does not matter).";$warning.Location=New-Object Drawing.Point(30,72);$warning.Size=New-Object Drawing.Size(580,122);$warning.ForeColor=[Drawing.Color]::FromArgb(244,226,176);$dialog.Controls.Add($warning)
    $entry=New-Object Windows.Forms.TextBox;$entry.Location=New-Object Drawing.Point(30,207);$entry.Size=New-Object Drawing.Size(580,34);$entry.Font=New-Object Drawing.Font('Segoe UI Semibold',13);$dialog.Controls.Add($entry)
    $cancel=New-Object Windows.Forms.Button;$cancel.Text='Cancel';$cancel.DialogResult=[Windows.Forms.DialogResult]::Cancel;$cancel.Location=New-Object Drawing.Point(330,263);$cancel.Size=New-Object Drawing.Size(125,42);$cancel.FlatStyle='Flat';$cancel.BackColor=[Drawing.Color]::FromArgb(36,50,72);$cancel.ForeColor=[Drawing.Color]::White;$dialog.Controls.Add($cancel)
    $confirm=New-Object Windows.Forms.Button;$confirm.Text='Delete All';$confirm.DialogResult=[Windows.Forms.DialogResult]::OK;$confirm.Location=New-Object Drawing.Point(470,263);$confirm.Size=New-Object Drawing.Size(140,42);$confirm.FlatStyle='Flat';$confirm.BackColor=[Drawing.Color]::FromArgb(191,52,61);$confirm.ForeColor=[Drawing.Color]::White;$confirm.Enabled=$false;$dialog.Controls.Add($confirm)
    $entry.Add_TextChanged({$confirm.Enabled=[string]::Equals($entry.Text.Trim(),'Delete All',[StringComparison]::OrdinalIgnoreCase)})
    $dialog.AcceptButton=$confirm;$dialog.CancelButton=$cancel;$dialog.Add_Shown({$entry.Focus()})
    return $dialog.ShowDialog($form) -eq [Windows.Forms.DialogResult]::OK
}
function Relaunch-Elevated {
    $principal=[Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()
    if ($principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) { return $false }
    $args=@('-NoProfile','-STA','-ExecutionPolicy','Bypass','-File',('"'+$PSCommandPath+'"'),'-IconPath',('"'+$IconPath+'"'))
    $elevated=Start-Process powershell.exe -Verb RunAs -ArgumentList ($args -join ' ') -Wait -PassThru
    if($elevated.ExitCode -ne 0){throw "The administrator process stopped with exit code $($elevated.ExitCode)."}
    return $true
}
if (Relaunch-Elevated) { exit }

$journalPath=Join-Path $env:ProgramData 'Ready Player Two\staging\install-state.json'
$form=New-Object Windows.Forms.Form
$form.Text='Dual Boot Undo 1.0.3';$form.StartPosition='CenterScreen';$form.Size=New-Object Drawing.Size(720,510);$form.MinimumSize=$form.Size;$form.MaximumSize=$form.Size;$form.BackColor=[Drawing.Color]::FromArgb(13,18,28);$form.ForeColor=[Drawing.Color]::White;$form.Font=New-Object Drawing.Font('Segoe UI',11)
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
    if([int]$journal.schema -ne 2 -or [string]$journal.managedBy -cne 'Ready Player Two' -or $journal.undoSupported -ne $true){throw 'This is not a verified RP2 dual-boot journal. Nothing will be removed.'}
    if([string]$journal.installationId -notmatch '^[0-9a-fA-F-]{36}$' -or [string]$journal.efiManagedPath -cne 'EFI\refind' -or [string]$journal.windowsBootPath -cne '\EFI\Microsoft\Boot\bootmgfw.efi'){throw 'The RP2 ownership record is incomplete or unfamiliar. Nothing will be removed.'}
    if([string]$journal.phase -notin @('awaiting-first-boot','complete','verified')){throw "The RP2 installation is in phase '$($journal.phase)' and cannot be safely undone."}
    if([string]$journal.targetComputerName -and [string]$journal.targetComputerName -ine $env:COMPUTERNAME){throw 'The journal belongs to a different computer. Nothing will be removed.'}
    if(@($journal.createdPartitions).Count -ne 2){throw 'The journal does not identify exactly two RP2-created partitions.'}
    if([int]$journal.createdPartitions[0] -eq [int]$journal.createdPartitions[1] -or [int]$journal.windowsPartitionNumber -eq [int]$journal.createdPartitions[0] -or [int]$journal.windowsPartitionNumber -eq [int]$journal.createdPartitions[1]){throw 'The RP2 partition ownership record is unsafe. Nothing will be removed.'}
    $disk=[int]$journal.diskNumber;$boot=Get-Partition -DiskNumber $disk -PartitionNumber ([int]$journal.createdPartitions[0]) -ErrorAction Stop;$share=Get-Partition -DiskNumber $disk -PartitionNumber ([int]$journal.createdPartitions[1]) -ErrorAction Stop
    $bootVolume=Get-Volume -Partition $boot -ErrorAction Stop;$shareVolume=Get-Volume -Partition $share -ErrorAction Stop
    if($bootVolume.FileSystemLabel -ne 'BATOCERA' -or $bootVolume.FileSystem -ne 'FAT32'){throw 'The recorded boot partition no longer matches the RP2-managed BATOCERA partition.'}
    if($shareVolume.FileSystemLabel -ne 'SHARE'){throw 'The recorded userdata partition no longer matches the RP2-managed SHARE partition.'}
    $windows=Get-Partition -DiskNumber $disk -PartitionNumber ([int]$journal.windowsPartitionNumber) -ErrorAction Stop
    if(-not $windows.DriveLetter){throw 'The recorded Windows partition is not mounted.'}
    $ordered=@(@($windows,$boot,$share) | Sort-Object Offset)
    if($ordered[0].PartitionNumber -ne $windows.PartitionNumber -or $ordered[1].PartitionNumber -ne $boot.PartitionNumber -or $ordered[2].PartitionNumber -ne $share.PartitionNumber){throw 'The recorded RP2 partitions are no longer immediately after Windows in the expected order. Nothing will be removed.'}
    $alignment=16MB
    if([math]::Abs(([int64]$windows.Offset+[int64]$windows.Size)-[int64]$boot.Offset) -gt $alignment -or [math]::Abs(([int64]$boot.Offset+[int64]$boot.Size)-[int64]$share.Offset) -gt $alignment){throw 'Other disk space or partitions now separate Windows from the RP2 partitions. Nothing will be removed.'}
    $expectedRecovery=[int64]$boot.Size+[int64]$share.Size;$recordedRecovery=[int64]$journal.originalWindowsBytes-[int64]$windows.Size
    if($recordedRecovery -le 0 -or [math]::Abs($recordedRecovery-$expectedRecovery) -gt $alignment){throw 'The current disk sizes do not match the space recorded by RP2. Nothing will be removed.'}
    $script:journal=$journal;$script:bootPartition=$boot;$script:sharePartition=$share
    return "Verified RP2 journal on $env:COMPUTERNAME.`r`nDisk $disk`r`nWindows: $($windows.DriveLetter): (partition $($windows.PartitionNumber))`r`nBatocera: partition $($boot.PartitionNumber)`r`nSHARE: partition $($share.PartitionNumber)`r`n`r`nReady to restore Windows Boot Manager, remove RP2 rEFInd, delete these two recorded partitions, and return their free space to Windows."
}
$inspect.Add_Click({try{$status.Text=Inspect-ManagedInstall;$status.ForeColor=[Drawing.Color]::White;$undo.Enabled=$true}catch{$status.Text=$_.Exception.Message;$status.ForeColor=[Drawing.Color]::FromArgb(255,105,105);$undo.Enabled=$false}})
$undo.Add_Click({
    try {
        $status.Text=Inspect-ManagedInstall
        if(-not (Confirm-DeleteAll)){return}
        $undo.Enabled=$false;$inspect.Enabled=$false;$form.UseWaitCursor=$true;$form.Refresh()
        $backupRoot=Join-Path $env:ProgramData ('Ready Player Two\undo-backup\'+(Get-Date).ToUniversalTime().ToString('yyyyMMdd-HHmmss'));New-Item -ItemType Directory -Path $backupRoot -Force | Out-Null
        Copy-Item -LiteralPath $journalPath -Destination (Join-Path $backupRoot 'install-state.before-undo.json') -Force
        & bcdedit.exe /export (Join-Path $backupRoot 'BCD-before-undo') | Out-Null;if($LASTEXITCODE -ne 0){throw 'Could not back up the current Windows boot configuration.'}
        $letter=$null;foreach($candidate in @('R','S','T','U','V','W','X','Y','Z')){if(-not(Test-Path "$candidate`:")){$letter=$candidate;break}};if(-not $letter){throw 'No free drive letter is available to inspect EFI.'}
        & mountvol.exe "$letter`:" /S | Out-Null;if($LASTEXITCODE -ne 0){throw 'Could not mount the EFI System partition.'}
        try{$refind=Join-Path "$letter`:" 'EFI\refind';$windowsLoader=Join-Path "$letter`:" 'EFI\Microsoft\Boot\bootmgfw.efi';if(-not(Test-Path -LiteralPath $refind)){throw 'The recorded RP2 rEFInd folder is missing.'};if(-not(Test-Path -LiteralPath $windowsLoader -PathType Leaf)){throw 'The Windows EFI loader is missing. Nothing was deleted.'};$config=Join-Path $refind 'refind.conf';if(-not(Test-Path -LiteralPath $config) -or (Get-Content -LiteralPath $config -Raw) -notmatch 'volume BATOCERA'){throw 'The EFI rEFInd folder is not verified as RP2-managed.'};Copy-Item -LiteralPath $refind -Destination (Join-Path $backupRoot 'refind') -Recurse -Force;& bcdedit.exe /set '{bootmgr}' path '\EFI\Microsoft\Boot\bootmgfw.efi' | Out-Null;if($LASTEXITCODE -ne 0){throw 'Windows rejected restoration of Windows Boot Manager.'};$verifiedBoot=(& bcdedit.exe /enum '{bootmgr}' 2>&1|Out-String);if($LASTEXITCODE -ne 0 -or $verifiedBoot -notmatch [regex]::Escape('\EFI\Microsoft\Boot\bootmgfw.efi')){throw 'Windows Boot Manager restoration did not verify. Nothing was deleted.'};Remove-Item -LiteralPath $refind -Recurse -Force}finally{& mountvol.exe "$letter`:" /D | Out-Null}
        Remove-Partition -DiskNumber ([int]$script:journal.diskNumber) -PartitionNumber ([int]$script:sharePartition.PartitionNumber) -Confirm:$false -ErrorAction Stop
        Remove-Partition -DiskNumber ([int]$script:journal.diskNumber) -PartitionNumber ([int]$script:bootPartition.PartitionNumber) -Confirm:$false -ErrorAction Stop
        $windows=Get-Partition -DiskNumber ([int]$script:journal.diskNumber) -PartitionNumber ([int]$script:journal.windowsPartitionNumber) -ErrorAction Stop;$supported=Get-PartitionSupportedSize -DiskNumber $windows.DiskNumber -PartitionNumber $windows.PartitionNumber -ErrorAction Stop;Resize-Partition -DiskNumber $windows.DiskNumber -PartitionNumber $windows.PartitionNumber -Size $supported.SizeMax -ErrorAction Stop
        $script:journal.phase='undone';$script:journal.detail='Dual Boot Undo restored Windows-only boot and reclaimed RP2-created partitions.';$script:journal | Add-Member -NotePropertyName undoneAt -NotePropertyValue (Get-Date).ToUniversalTime().ToString('o') -Force;$script:journal | Add-Member -NotePropertyName undoBackupPath -NotePropertyValue $backupRoot -Force;[IO.File]::WriteAllText($journalPath,($script:journal|ConvertTo-Json -Depth 12),[Text.UTF8Encoding]::new($false))
        $status.Text="Dual Boot Undo completed successfully.`r`n`r`nWindows Boot Manager restored.`r`nRP2 rEFInd removed.`r`nBATOCERA and SHARE removed.`r`nWindows expanded.`r`nRecovery record: $backupRoot";$status.ForeColor=[Drawing.Color]::FromArgb(105,224,139);Show-Message 'Dual Boot Undo completed. Restart the PC to verify that it boots directly into Windows.'
    }catch{$status.Text="Undo stopped safely: $($_.Exception.Message)";$status.ForeColor=[Drawing.Color]::FromArgb(255,105,105);Show-Message $status.Text 'Dual Boot Undo' ([Windows.Forms.MessageBoxIcon]::Error)}finally{$form.UseWaitCursor=$false;$inspect.Enabled=$true}
})
$inspect.PerformClick();[void]$form.ShowDialog()
