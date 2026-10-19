param([Parameter(Mandatory)][string]$SetupPath)
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName PresentationFramework,PresentationCore,WindowsBase

function Invoke-RP2([string]$Action, [object]$Request, [switch]$Elevated) {
    $runRoot = Join-Path ([IO.Path]::GetTempPath()) ('rp2-native-' + [guid]::NewGuid().ToString('N'))
    New-Item -ItemType Directory -Path $runRoot | Out-Null
    $inputPath = Join-Path $runRoot 'request.json'
    $outputPath = Join-Path $runRoot 'result.json'
    $Request.action = $Action
    [IO.File]::WriteAllText($inputPath, ($Request | ConvertTo-Json -Depth 6), [Text.UTF8Encoding]::new($false))
    try {
        $arguments = "-NoProfile -ExecutionPolicy Bypass -File `"$SetupPath`" -RequestPath `"$inputPath`" -ResultPath `"$outputPath`""
        if ($Elevated) {
            $process = Start-Process -FilePath (Join-Path $PSHOME 'powershell.exe') -ArgumentList $arguments -Verb RunAs -WindowStyle Hidden -Wait -PassThru
        } else {
            $process = Start-Process -FilePath (Join-Path $PSHOME 'powershell.exe') -ArgumentList $arguments -WindowStyle Hidden -Wait -PassThru
        }
        if (-not (Test-Path -LiteralPath $outputPath)) { throw "Setup returned no result (exit code $($process.ExitCode))." }
        return Get-Content -LiteralPath $outputPath -Raw | ConvertFrom-Json
    } finally { Remove-Item -LiteralPath $runRoot -Recurse -Force -ErrorAction SilentlyContinue }
}

$xaml = @'
<Window xmlns="http://schemas.microsoft.com/winfx/2006/xaml/presentation" Title="Ready Player Two 1.0.12" Width="900" Height="650" MinWidth="700" MinHeight="520" WindowStartupLocation="CenterScreen" Background="#111722" Foreground="#EAF2FF">
  <Window.Resources>
    <Style TargetType="TextBox"><Setter Property="Foreground" Value="#101722"/><Setter Property="Background" Value="#F4F7FB"/><Setter Property="CaretBrush" Value="#101722"/><Setter Property="Padding" Value="8,4"/></Style>
    <Style TargetType="ComboBox"><Setter Property="Foreground" Value="#101722"/><Setter Property="Background" Value="#F4F7FB"/><Setter Property="Padding" Value="7,3"/></Style>
    <Style TargetType="ListBox"><Setter Property="Foreground" Value="#F4F7FB"/><Setter Property="Background" Value="#182230"/></Style>
    <Style TargetType="ListBoxItem"><Setter Property="Foreground" Value="#F4F7FB"/><Setter Property="Background" Value="#182230"/><Setter Property="Padding" Value="8,5"/></Style>
    <Style TargetType="CheckBox"><Setter Property="Foreground" Value="#EAF2FF"/><Setter Property="FontSize" Value="14"/></Style>
    <Style TargetType="Button"><Setter Property="Foreground" Value="#101722"/><Setter Property="Background" Value="#EAF2FF"/><Setter Property="BorderBrush" Value="#70B8FF"/><Setter Property="FontSize" Value="15"/></Style>
  </Window.Resources>
  <Grid Margin="28">
    <Grid.RowDefinitions><RowDefinition Height="Auto"/><RowDefinition Height="Auto"/><RowDefinition Height="*"/><RowDefinition Height="Auto"/></Grid.RowDefinitions>
    <StackPanel><TextBlock Text="READY PLAYER ONE COMPANION - VERSION 1.0.12" Foreground="#70B8FF" FontWeight="Bold"/><TextBlock Text="Ready Player Two" FontSize="36" FontWeight="Bold" Margin="0,4,0,0"/></StackPanel>
    <Border Grid.Row="1" Background="#1D2938" BorderBrush="#4F6B8E" BorderThickness="1" CornerRadius="12" Padding="18" Margin="0,20,0,16"><StackPanel><TextBlock Text="Install your emulation programs before running setup." FontSize="17" FontWeight="Bold" Margin="0,0,0,6"/><TextBlock Text="RP2 automatically configures every supported program found on this computer: RetroBat, RetroArch, ES-DE, and Emu-Station." TextWrapping="Wrap" Foreground="#BFD4EC"/></StackPanel></Border>
    <Grid Grid.Row="2"><Grid.ColumnDefinitions><ColumnDefinition Width="1.1*"/><ColumnDefinition Width="0.9*"/></Grid.ColumnDefinitions>
      <StackPanel Margin="0,0,18,0"><TextBlock Text="DETECTED PROGRAMS" FontWeight="Bold" Foreground="#70B8FF"/><ListBox Name="Programs" Margin="0,10,0,18" Height="145" Background="#182230" Foreground="White" BorderBrush="#526C8E" FontSize="18"/><TextBlock Text="HOME NETWORK" FontWeight="Bold" Foreground="#70B8FF"/><ComboBox Name="Networks" Margin="0,10,0,0" Height="36" Background="#EAF2FF" Foreground="#111722"/></StackPanel>
      <StackPanel Grid.Column="1"><TextBlock Text="WINDOWS ACCOUNT" FontWeight="Bold" Foreground="#70B8FF"/><TextBox Name="Account" Margin="0,10,0,18" Height="36" FontSize="15"/><CheckBox Name="MakePrivate" Content="Confirm selected network is trusted/private" IsChecked="True" Margin="0,0,0,12"/><CheckBox Name="BlankPassword" Content="Allow an account with no password (less secure)"/><TextBlock Name="Status" Margin="0,22,0,0" TextWrapping="Wrap" Foreground="#BFD4EC"/></StackPanel>
    </Grid>
    <StackPanel Grid.Row="3" Orientation="Horizontal" HorizontalAlignment="Right" Margin="0,20,0,0"><Button Name="Refresh" Content="Refresh" Width="120" Height="44" Margin="0,0,12,0"/><Button Name="Setup" Content="Configure All" Width="160" Height="44" Background="#72B7FF" FontWeight="Bold"/></StackPanel>
  </Grid>
</Window>
'@
$reader = [Xml.XmlNodeReader]::new([xml]$xaml)
$window = [Windows.Markup.XamlReader]::Load($reader)
$programs = $window.FindName('Programs'); $networks = $window.FindName('Networks'); $account = $window.FindName('Account')
$status = $window.FindName('Status'); $refresh = $window.FindName('Refresh'); $setup = $window.FindName('Setup')
$makePrivate = $window.FindName('MakePrivate'); $blankPassword = $window.FindName('BlankPassword')

function Refresh-Status {
    $status.Text = 'Checking this computer...'; $window.Dispatcher.Invoke([action]{}, 'Background')
    try {
        $result = Invoke-RP2 'status' ([ordered]@{platform='all';folder='';account='';interfaceIndex=0;makePrivate=$false;allowBlankPassword=$false})
        $programs.Items.Clear(); foreach ($name in @($result.detected)) { [void]$programs.Items.Add($name) }
        if (-not $programs.Items.Count) { [void]$programs.Items.Add('No supported programs detected') }
        $account.Text = [string]$result.account
        $networks.Items.Clear()
        foreach ($network in @($result.networks)) {
            $item = [pscustomobject]@{index=[int]$network.index;label="$($network.name) - $(@($network.addresses) -join ', ') - $($network.category)";preferred=($network.category -eq 'Private' -and @($network.addresses).Count)}
            [void]$networks.Items.Add($item)
        }
        $networks.DisplayMemberPath='label'; $networks.SelectedValuePath='index'
        $preferred = @($networks.Items | Where-Object preferred | Select-Object -First 1)
        if ($preferred.Count) { $networks.SelectedItem=$preferred[0] } elseif ($networks.Items.Count) { $networks.SelectedIndex=0 }
        $status.Text = 'Ready. Choose the home Wi-Fi or Ethernet adapter, then configure all detected programs.'
    } catch { $status.Text = "Status failed: $($_.Exception.Message)" }
}
$refresh.Add_Click({ Refresh-Status })
$setup.Add_Click({
    if ($networks.SelectedIndex -lt 0 -or -not $account.Text.Trim()) { $status.Text='Choose a network and Windows account first.'; return }
    $setup.IsEnabled=$false; $refresh.IsEnabled=$false; $status.Text='Approve the Windows administrator prompt. Setup may take a minute...'; $window.Dispatcher.Invoke([action]{}, 'Background')
    try {
        $request=[ordered]@{platform='all';folder='';account=$account.Text.Trim();interfaceIndex=[int]$networks.SelectedValue;makePrivate=[bool]$makePrivate.IsChecked;allowBlankPassword=[bool]$blankPassword.IsChecked}
        $result=Invoke-RP2 'setup' $request -Elevated
        $lines=@($result.log) -join "`n"
        if($result.ok){$status.Text="Setup complete. RP1 discovery is active.`n$lines";[Windows.MessageBox]::Show('All detected supported programs were configured. Ready Player One discovery is now active.','Ready Player Two','OK','Information')|Out-Null}
        else{$status.Text="Setup needs attention: $($result.error)`n$lines"}
    } catch {$status.Text="Setup failed: $($_.Exception.Message)"}
    finally {$setup.IsEnabled=$true;$refresh.IsEnabled=$true}
})
$window.Add_ContentRendered({ Refresh-Status })
[void]$window.ShowDialog()
