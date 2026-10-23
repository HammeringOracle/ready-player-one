param([Parameter(Mandatory)][string]$SetupPath, [Parameter(Mandatory)][string]$WindowsBootIconPath, [Parameter(Mandatory)][string]$BatoceraBootIconPath)
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName PresentationFramework,PresentationCore,WindowsBase

function Invoke-RP2([string]$Action, [object]$Request, [switch]$Elevated) {
    $runRoot = Join-Path ([IO.Path]::GetTempPath()) ('rp2-native-' + [guid]::NewGuid().ToString('N'))
    New-Item -ItemType Directory -Path $runRoot | Out-Null
    $inputPath = Join-Path $runRoot 'request.json'
    $outputPath = Join-Path $runRoot 'result.json'
    $stdoutPath = Join-Path $runRoot 'stdout.log'
    $stderrPath = Join-Path $runRoot 'stderr.log'
    $elevatedRunnerPath = Join-Path $runRoot 'elevated-runner.ps1'
    $Request.action = $Action
    [IO.File]::WriteAllText($inputPath, ($Request | ConvertTo-Json -Depth 6), [Text.UTF8Encoding]::new($false))
    try {
        $arguments = "-NoProfile -ExecutionPolicy Bypass -File `"$SetupPath`" -RequestPath `"$inputPath`" -ResultPath `"$outputPath`" -WindowsBootIconPath `"$WindowsBootIconPath`" -BatoceraBootIconPath `"$BatoceraBootIconPath`""
        if ($Elevated) {
            # Run an elevated wrapper because Start-Process cannot combine
            # -Verb RunAs with stream redirection. The wrapper inherits the
            # elevated token, captures the child output, and always writes a
            # structured result even if setup fails before its own try/catch.
            $runner = @'
param([string]$PowerShellPath,[string]$SetupPath,[string]$RequestPath,[string]$ResultPath,[string]$WindowsBootIconPath,[string]$BatoceraBootIconPath,[string]$LogPath)
$ErrorActionPreference='Continue'
try {
    & $PowerShellPath -NoProfile -ExecutionPolicy Bypass -File $SetupPath -RequestPath $RequestPath -ResultPath $ResultPath -WindowsBootIconPath $WindowsBootIconPath -BatoceraBootIconPath $BatoceraBootIconPath *> $LogPath
    $childExitCode=$LASTEXITCODE
    if(-not (Test-Path -LiteralPath $ResultPath -PathType Leaf)) {
        $detail=if(Test-Path -LiteralPath $LogPath){(Get-Content -LiteralPath $LogPath -Raw).Trim()}else{''}
        if(-not $detail){$detail="Setup stopped before returning a result (child exit code $childExitCode)."}
        $sharedLog=Join-Path $env:ProgramData 'Ready Player Two\status\last-operation-error.txt'
        New-Item -ItemType Directory -Path (Split-Path -Parent $sharedLog) -Force | Out-Null
        [IO.File]::WriteAllText($sharedLog,$detail,[Text.UTF8Encoding]::new($false))
        [IO.File]::WriteAllText($ResultPath,(@{ok=$false;error='Setup stopped before returning a result. Full details were saved to RP2Status\last-operation-error.txt.';log=@()}|ConvertTo-Json -Depth 4),[Text.UTF8Encoding]::new($false))
    }
} catch {
    $sharedLog=Join-Path $env:ProgramData 'Ready Player Two\status\last-operation-error.txt'
    New-Item -ItemType Directory -Path (Split-Path -Parent $sharedLog) -Force | Out-Null
    [IO.File]::WriteAllText($sharedLog,$_.Exception.ToString(),[Text.UTF8Encoding]::new($false))
    [IO.File]::WriteAllText($ResultPath,(@{ok=$false;error='Setup failed. Full details were saved to RP2Status\last-operation-error.txt.';log=@()}|ConvertTo-Json -Depth 4),[Text.UTF8Encoding]::new($false))
}
'@
            [IO.File]::WriteAllText($elevatedRunnerPath,$runner,[Text.UTF8Encoding]::new($false))
            $runnerArguments = "-NoProfile -ExecutionPolicy Bypass -File `"$elevatedRunnerPath`" -PowerShellPath `"$(Join-Path $PSHOME 'powershell.exe')`" -SetupPath `"$SetupPath`" -RequestPath `"$inputPath`" -ResultPath `"$outputPath`" -WindowsBootIconPath `"$WindowsBootIconPath`" -BatoceraBootIconPath `"$BatoceraBootIconPath`" -LogPath `"$stderrPath`""
            $process = Start-Process -FilePath (Join-Path $PSHOME 'powershell.exe') -ArgumentList $runnerArguments -Verb RunAs -WindowStyle Hidden -Wait -PassThru
        } else {
            $process = Start-Process -FilePath (Join-Path $PSHOME 'powershell.exe') -ArgumentList $arguments -WindowStyle Hidden -Wait -PassThru -RedirectStandardOutput $stdoutPath -RedirectStandardError $stderrPath
        }
        if (-not (Test-Path -LiteralPath $outputPath)) {
            $stderr = if(Test-Path -LiteralPath $stderrPath){(Get-Content -LiteralPath $stderrPath -Raw).Trim()}else{''}
            $stdout = if(Test-Path -LiteralPath $stdoutPath){(Get-Content -LiteralPath $stdoutPath -Raw).Trim()}else{''}
            $detail = @($stderr,$stdout) | Where-Object { $_ } | Select-Object -First 1
            $logRoot = Join-Path $env:LOCALAPPDATA 'Ready Player Two'
            New-Item -ItemType Directory -Path $logRoot -Force | Out-Null
            $logPath = Join-Path $logRoot 'last-operation-error.txt'
            [IO.File]::WriteAllText($logPath,"Action: $Action`r`nExit code: $($process.ExitCode)`r`n$($detail -join '')",[Text.UTF8Encoding]::new($false))
            throw $(if($detail){"$detail Details saved to $logPath"}else{"The setup process stopped before returning a result. Details saved to $logPath"})
        }
        return Get-Content -LiteralPath $outputPath -Raw | ConvertFrom-Json
    } finally { Remove-Item -LiteralPath $runRoot -Recurse -Force -ErrorAction SilentlyContinue }
}

function Save-RP2OperationLog([string]$Action,[object]$Result) {
    $logRoot=Join-Path $env:LOCALAPPDATA 'Ready Player Two'
    New-Item -ItemType Directory -Path $logRoot -Force | Out-Null
    $logPath=Join-Path $logRoot 'last-operation.txt'
    $content=@("Action: $Action","Time: $((Get-Date).ToUniversalTime().ToString('o'))","OK: $([bool]$Result.ok)","Error: $([string]$Result.error)",'',(@($Result.log) -join "`r`n")) -join "`r`n"
    [IO.File]::WriteAllText($logPath,$content,[Text.UTF8Encoding]::new($false))
    return $logPath
}

$xaml = @'
<Window xmlns="http://schemas.microsoft.com/winfx/2006/xaml/presentation" Title="Ready Player Two 1.0.56" Width="820" Height="620" MinWidth="680" MinHeight="570" WindowStartupLocation="CenterScreen" ShowActivated="True" SizeToContent="Manual" ResizeMode="CanResize" Background="#111722" Foreground="#EAF2FF">
  <Window.Resources>
    <Style TargetType="TextBox"><Setter Property="Foreground" Value="#101722"/><Setter Property="Background" Value="#F4F7FB"/><Setter Property="CaretBrush" Value="#101722"/><Setter Property="Padding" Value="8,4"/></Style>
    <Style TargetType="ComboBox"><Setter Property="Foreground" Value="#101722"/><Setter Property="Background" Value="#F4F7FB"/><Setter Property="Padding" Value="7,3"/></Style>
    <Style TargetType="ListBox"><Setter Property="Foreground" Value="#F4F7FB"/><Setter Property="Background" Value="#182230"/></Style>
    <Style TargetType="ListBoxItem"><Setter Property="Foreground" Value="#F4F7FB"/><Setter Property="Background" Value="#182230"/><Setter Property="Padding" Value="8,5"/></Style>
    <Style TargetType="CheckBox"><Setter Property="Foreground" Value="#EAF2FF"/><Setter Property="FontSize" Value="14"/></Style>
    <Style TargetType="Button"><Setter Property="Foreground" Value="#101722"/><Setter Property="Background" Value="#EAF2FF"/><Setter Property="BorderBrush" Value="#70B8FF"/><Setter Property="FontSize" Value="15"/></Style>
  </Window.Resources>
  <Grid Margin="20">
    <Grid.RowDefinitions><RowDefinition Height="Auto"/><RowDefinition Height="Auto"/><RowDefinition Height="*"/><RowDefinition Height="Auto"/><RowDefinition Height="Auto"/></Grid.RowDefinitions>
    <StackPanel><TextBlock Text="READY PLAYER ONE COMPANION - VERSION 1.0.56" Foreground="#70B8FF" FontWeight="Bold"/><TextBlock Text="Ready Player Two" FontSize="30" FontWeight="Bold" Margin="0,2,0,0"/></StackPanel>
    <Border Grid.Row="1" Background="#1D2938" BorderBrush="#4F6B8E" BorderThickness="1" CornerRadius="8" Padding="12" Margin="0,10,0,10"><StackPanel><TextBlock Text="Make this Windows PC visible in Ready Player One." FontSize="15" FontWeight="Bold" Margin="0,0,0,3"/><TextBlock Text="Configures Windows discovery and supported frontends." TextWrapping="Wrap" Foreground="#BFD4EC"/></StackPanel></Border>
    <Grid Grid.Row="2"><Grid.ColumnDefinitions><ColumnDefinition Width="1.1*"/><ColumnDefinition Width="0.9*"/></Grid.ColumnDefinitions>
      <StackPanel Margin="0,0,14,0"><TextBlock Text="DETECTED PROGRAMS" FontWeight="Bold" Foreground="#70B8FF"/><ListBox Name="Programs" Margin="0,6,0,10" Height="105" Background="#182230" Foreground="White" BorderBrush="#526C8E" FontSize="16"/><TextBlock Text="HOME NETWORK" FontWeight="Bold" Foreground="#70B8FF"/><ComboBox Name="Networks" Margin="0,6,0,0" Height="32" Background="#EAF2FF" Foreground="#111722"/></StackPanel>
      <StackPanel Grid.Column="1"><TextBlock Text="WINDOWS ACCOUNT" FontWeight="Bold" Foreground="#70B8FF"/><TextBox Name="Account" Margin="0,6,0,7" Height="32" FontSize="14"/><TextBlock Text="Windows Hello/PIN sign-in is supported locally. RP1 network access still uses the account password; Windows does not accept a PIN over SMB." TextWrapping="Wrap" Foreground="#BFD4EC" FontSize="11" Margin="0,0,0,7"/><CheckBox Name="MakePrivate" Content="Confirm selected network is trusted/private" IsChecked="True" Margin="0,0,0,8"/><CheckBox Name="BlankPassword" Content="Allow blank-password network sign-in (PC-wide; less secure)" ToolTip="Applies to all local accounts on this PC. A real account password is safer."/></StackPanel>
    </Grid>
    <Border Grid.Row="3" Height="145" Background="#1D2938" BorderBrush="#4F6B8E" BorderThickness="1" CornerRadius="7" Padding="10" Margin="0,8,0,0"><Grid><Grid.RowDefinitions><RowDefinition Height="Auto"/><RowDefinition Height="*"/></Grid.RowDefinitions><TextBlock Text="SHARED DUAL BOOT ON THIS WINDOWS PC" FontWeight="Bold" Foreground="#70B8FF"/><ScrollViewer Grid.Row="1" VerticalScrollBarVisibility="Auto" HorizontalScrollBarVisibility="Disabled" Margin="0,6,0,0" Focusable="True"><TextBlock Name="DualBootStatus" Text="" TextWrapping="Wrap" Foreground="#BFD4EC" Padding="0,0,8,0"/></ScrollViewer></Grid></Border>
    <StackPanel Grid.Row="4" Orientation="Horizontal" HorizontalAlignment="Right" Margin="0,10,0,0"><Button Name="RepairBoot" Content="Repair Boot Menu" Width="140" Height="38" Margin="0,0,8,0"/><Button Name="InspectBoot" Content="Inspect Boot Menu" Width="140" Height="38" Margin="0,0,8,0"/><Button Name="InspectDrive" Content="Inspect Windows Drive" Width="158" Height="38" Margin="0,0,8,0"/><Button Name="Refresh" Content="Refresh" Width="80" Height="38" Margin="0,0,8,0"/><Button Name="Setup" Content="Configure All" Width="125" Height="38" Background="#72B7FF" FontWeight="Bold"/></StackPanel>
  </Grid>
</Window>
'@
$reader = [Xml.XmlNodeReader]::new([xml]$xaml)
$window = [Windows.Markup.XamlReader]::Load($reader)
$programs = $window.FindName('Programs'); $networks = $window.FindName('Networks'); $account = $window.FindName('Account')
$refresh = $window.FindName('Refresh'); $setup = $window.FindName('Setup')
$inspectDrive = $window.FindName('InspectDrive')
$inspectBoot = $window.FindName('InspectBoot')
$repairBoot = $window.FindName('RepairBoot')
$dualBootStatus = $window.FindName('DualBootStatus')
$status = $dualBootStatus
$makePrivate = $window.FindName('MakePrivate'); $blankPassword = $window.FindName('BlankPassword')

$stageRoot = Join-Path $env:ProgramData 'Ready Player Two\staging'
$script:lastInstallResultStamp = $null
$script:installMonitorStarted = $false
$script:rp2SessionStartedAt = (Get-Date).ToUniversalTime()
function Update-DualBootStatus {
    try {
        $resultPath = Join-Path $stageRoot 'install-result.json'
        $statePath = Join-Path $stageRoot 'install-state.json'
        $result = if (Test-Path -LiteralPath $resultPath -PathType Leaf) { Get-Content -LiteralPath $resultPath -Raw | ConvertFrom-Json } else { $null }
        $state = if (Test-Path -LiteralPath $statePath -PathType Leaf) { Get-Content -LiteralPath $statePath -Raw | ConvertFrom-Json } else { $null }
        $stamp = if ($result) { [string]$result.updatedAt } else { $null }
        $resultTime = if ($result -and $result.updatedAt) { try { [datetime]::Parse([string]$result.updatedAt).ToUniversalTime() } catch { [datetime]::MinValue } } else { [datetime]::MinValue }
        $stateTime = if ($state -and $state.updatedAt) { try { [datetime]::Parse([string]$state.updatedAt).ToUniversalTime() } catch { [datetime]::MinValue } } else { [datetime]::MinValue }
        $activePhases = @('preparing','resizing-windows','creating-partitions','copying-boot-files','awaiting-refind','installing-refind')
        if ($result -and $result.error -and $resultTime -ge $script:rp2SessionStartedAt) {
            $dualBootStatus.Text = "STOPPED: $($result.error)"
            $dualBootStatus.Foreground = [System.Windows.Media.Brushes]::OrangeRed
            if ($script:installMonitorStarted -and $stamp -and $stamp -ne $script:lastInstallResultStamp) {
                [Windows.MessageBox]::Show($dualBootStatus.Text,'Shared Dual Boot stopped','OK','Warning') | Out-Null
            }
        } elseif ($state -and $state.phase -in $activePhases) {
            $dualBootStatus.Text = "$($state.phase): $($state.detail)"
            $dualBootStatus.Foreground = [System.Windows.Media.Brushes]::LightSkyBlue
        } elseif ($result -and -not $result.error -and $resultTime -ge $script:rp2SessionStartedAt) {
            $dualBootStatus.Text = "$($result.phase): $($result.detail)"
            $dualBootStatus.Foreground = [System.Windows.Media.Brushes]::LightSkyBlue
        } else {
            return
        }
        $script:lastInstallResultStamp = $stamp
        $script:installMonitorStarted = $true
    } catch { $dualBootStatus.Text = "Could not read local install status: $($_.Exception.Message)" }
}
$installTimer = [Windows.Threading.DispatcherTimer]::new()
$installTimer.Interval = [TimeSpan]::FromSeconds(2)
$installTimer.Add_Tick({ Update-DualBootStatus })

function Refresh-Status([switch]$Silent) {
    if(-not $Silent){$status.Text='Checking this computer...';$status.Foreground=[System.Windows.Media.Brushes]::LightSkyBlue;$window.Dispatcher.Invoke([action]{}, 'Background')}
    $account.Text = [Security.Principal.WindowsIdentity]::GetCurrent().Name
    $networks.Items.Clear()
    foreach($profile in @(Get-NetConnectionProfile -ErrorAction SilentlyContinue)) {
        $addresses = @(Get-NetIPAddress -InterfaceIndex $profile.InterfaceIndex -AddressFamily IPv4 -ErrorAction SilentlyContinue | Where-Object { $_.IPAddress -notlike '169.254.*' } | Select-Object -ExpandProperty IPAddress)
        if(-not $addresses.Count){continue}
        $item=[pscustomobject]@{index=[int]$profile.InterfaceIndex;label="$($profile.Name) - $($addresses -join ', ') - $($profile.NetworkCategory)";preferred=($profile.NetworkCategory -eq 'Private')}
        [void]$networks.Items.Add($item)
    }
    $networks.DisplayMemberPath='label';$networks.SelectedValuePath='index'
    if($networks.Items.Count){
        $preferredIndex=0
        for($i=0;$i -lt $networks.Items.Count;$i++){if($networks.Items[$i].preferred){$preferredIndex=$i;break}}
        $networks.SelectedIndex=$preferredIndex
    }
    $programs.Items.Clear()
    [void]$programs.Items.Add('Configured when you run Configure All')
    if(-not $Silent){$status.Text=if($networks.Items.Count){'Account and network refreshed.'}else{'No active IPv4 network was found. Connect this PC to your home Wi-Fi or Ethernet, then choose Refresh.'};$status.Foreground=if($networks.Items.Count){[System.Windows.Media.Brushes]::LightSkyBlue}else{[System.Windows.Media.Brushes]::OrangeRed}}
}
$refresh.Add_Click({ Refresh-Status })
$repairBoot.Add_Click({
    $answer=[Windows.MessageBox]::Show('Back up the current boot-menu configuration and change only that file to a clean graphical, two-choice menu with Batocera as the 30-second default? This does not repartition or reinstall Batocera.','Repair Boot Menu','YesNo','Warning')
    if ($answer -ne [Windows.MessageBoxResult]::Yes) { return }
    $repairBoot.IsEnabled=$false; $status.Text='Checking boot files and backing up the menu configuration...';$status.Foreground=[System.Windows.Media.Brushes]::LightSkyBlue; $window.Dispatcher.Invoke([action]{}, 'Background')
    try {
        $result=Invoke-RP2 'dual-boot-repair-menu' ([ordered]@{platform='all';folder='';account='';interfaceIndex=0;makePrivate=$false;allowBlankPassword=$false}) -Elevated
        if (-not $result.ok) { throw [string]$result.error }
        $status.Text=[string]$result.detail
        [Windows.MessageBox]::Show($status.Text,'Boot Menu Repair','OK','Information')|Out-Null
    } catch { $status.Text="Boot menu repair stopped: $($_.Exception.Message)";$status.Foreground=[System.Windows.Media.Brushes]::OrangeRed; [Windows.MessageBox]::Show($status.Text,'Boot Menu Repair','OK','Warning')|Out-Null }
    finally { $repairBoot.IsEnabled=$true }
})
$inspectBoot.Add_Click({
    $inspectBoot.IsEnabled=$false; $status.Text='Inspecting boot menu without changing it...';$status.Foreground=[System.Windows.Media.Brushes]::LightSkyBlue; $window.Dispatcher.Invoke([action]{}, 'Background')
    try {
        $report=Invoke-RP2 'dual-boot-diagnostic' ([ordered]@{platform='all';folder='';account='';interfaceIndex=0;makePrivate=$false;allowBlankPassword=$false}) -Elevated
        if (-not $report.ok) { throw [string]$report.error }
        $status.Text="Boot report saved to RP2Status\\boot-diagnostic.json. rEFInd loader: $($report.refindLoaderExists); config: $($report.refindConfigExists); Windows loader: $($report.windowsLoaderExists). No boot settings were changed."
        [Windows.MessageBox]::Show($status.Text,'Boot Menu Inspection','OK','Information')|Out-Null
    } catch { $status.Text="Boot inspection failed: $($_.Exception.Message)";$status.Foreground=[System.Windows.Media.Brushes]::OrangeRed }
    finally { $inspectBoot.IsEnabled=$true }
})
$inspectDrive.Add_Click({
    $inspectDrive.IsEnabled=$false; $status.Text='Inspecting the Windows drive without changing it...';$status.Foreground=[System.Windows.Media.Brushes]::LightSkyBlue; $window.Dispatcher.Invoke([action]{}, 'Background')
    try {
        $report=Invoke-RP2 'dual-boot-preflight' ([ordered]@{platform='all';folder='';account='';interfaceIndex=0;makePrivate=$false;allowBlankPassword=$false}) -Elevated
        if (-not $report.ok) { throw [string]$report.error }
        $gb=1GB
        $lines=@(
            "Computer: $($report.computer)",
            "Windows drive: $($report.windowsDrive) on disk $($report.diskNumber)",
            "Disk: $([math]::Round($report.diskSizeBytes/$gb,1)) GB, $($report.partitionStyle), $($report.busType)",
            "Windows partition: $([math]::Round($report.windowsPartitionSizeBytes/$gb,1)) GB",
            "Windows used: $([math]::Round($report.windowsUsedBytes/$gb,1)) GB; free: $([math]::Round($report.windowsFreeBytes/$gb,1)) GB",
            "Smallest Windows can shrink to: $([math]::Round($report.smallestSupportedWindowsSizeBytes/$gb,1)) GB",
            "Minimum Windows size with RP2 safety margin: $($report.minimumSafeWindowsGb) GB",
            "Existing BATOCERA volumes: $(if(@($report.batoceraVolumes | Where-Object { $_ }).Count){(@($report.batoceraVolumes) | ForEach-Object { 'disk ' + $_.diskNumber + ' (' + $_.busType + ')' }) -join ', '}else{'none'})",
            "BitLocker protection: $($report.bitLockerProtection); Secure Boot: $($report.secureBoot)",
            'Partitions: ' + ((@($report.partitions) | ForEach-Object { "#$($_.number) $($_.type) $([math]::Round($_.sizeBytes/$gb,1)) GB" }) -join '; '),
            'Inspection only. No partition, image, or boot changes were made.'
        )
        $status.Text=$lines -join "`n"
        [Windows.MessageBox]::Show($status.Text,'Shared Dual Boot - Drive Inspection','OK','Information')|Out-Null
    } catch { $status.Text="Drive inspection failed: $($_.Exception.Message)";$status.Foreground=[System.Windows.Media.Brushes]::OrangeRed }
    finally { $inspectDrive.IsEnabled=$true }
})
$setup.Add_Click({
    if ($networks.SelectedIndex -lt 0 -or -not $account.Text.Trim()) { $status.Text='Choose a network and Windows account first.';$status.Foreground=[System.Windows.Media.Brushes]::OrangeRed; return }
    $setup.IsEnabled=$false; $refresh.IsEnabled=$false; $status.Text='Approve the Windows administrator prompt. Setup may take a minute...';$status.Foreground=[System.Windows.Media.Brushes]::LightSkyBlue; $window.Dispatcher.Invoke([action]{}, 'Background')
    try {
        $request=[ordered]@{platform='all';folder='';account=$account.Text.Trim();interfaceIndex=[int]$networks.SelectedValue;makePrivate=[bool]$makePrivate.IsChecked;allowBlankPassword=[bool]$blankPassword.IsChecked}
        $result=Invoke-RP2 'setup' $request -Elevated
        $operationLog=Save-RP2OperationLog 'Configure All' $result
        if($result.ok){$status.Text="Setup complete. RP1 discovery, RP2Stage, and the protected dual-boot worker are active.`nDetails: $operationLog";$status.Foreground=[System.Windows.Media.Brushes]::LightSkyBlue;$script:rp2SessionStartedAt=(Get-Date).ToUniversalTime();$installTimer.Start();[Windows.MessageBox]::Show('Setup complete. RP1 discovery and the protected dual-boot worker are active.','Ready Player Two - Configure All','OK','Information')|Out-Null}
        else{$status.Text="Setup needs attention: $($result.error)`nDetails: $operationLog";$status.Foreground=[System.Windows.Media.Brushes]::OrangeRed}
    } catch {$status.Text="Setup failed: $($_.Exception.Message)";$status.Foreground=[System.Windows.Media.Brushes]::OrangeRed}
    finally {$setup.IsEnabled=$true;$refresh.IsEnabled=$true}
})
$window.Add_ContentRendered({
    $window.WindowState = [System.Windows.WindowState]::Normal
    $window.Topmost = $true
    [void]$window.Activate()
    $window.Topmost = $false
    [void]$window.Focus()
    $window.Dispatcher.BeginInvoke([action]{
        Refresh-Status -Silent
    }, [System.Windows.Threading.DispatcherPriority]::Background) | Out-Null
})
$window.Add_Closed({ $installTimer.Stop() })
[void]$window.ShowDialog()
