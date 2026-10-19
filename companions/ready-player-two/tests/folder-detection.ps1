$ErrorActionPreference='Stop'
$ast=[System.Management.Automation.Language.Parser]::ParseFile((Join-Path $PSScriptRoot '..\setup.ps1'),[ref]$null,[ref]$null)
$fn=$ast.Find({param($n) $n -is [System.Management.Automation.Language.FunctionDefinitionAst] -and $n.Name -eq 'Resolve-InstallationFolder'},$true)
. ([scriptblock]::Create($fn.Extent.Text))
function Test-Path { param($LiteralPath,$PathType) return $LiteralPath -in $script:available }
$script:available=@('C:\RetroArch-Win64\retroarch.exe')
if ((Resolve-InstallationFolder retroarch 'C:\RetroArch') -ne 'C:\RetroArch-Win64') { throw 'Win64 detection failed' }
if ((Resolve-InstallationFolder retroarch 'D:\My Games') -ne 'D:\My Games') { throw 'Custom path was overridden' }
if ((Resolve-InstallationFolder retrobat 'C:\RetroBat') -ne 'C:\RetroBat') { throw 'RetroBat changed' }
if ((Resolve-InstallationFolder esde '') -ne (Join-Path $env:USERPROFILE 'ROMs')) { throw 'ES-DE default failed' }
if ((Resolve-InstallationFolder esde 'D:\Arcade\ROMs') -ne 'D:\Arcade\ROMs') { throw 'ES-DE custom path was overridden' }
if ((Resolve-InstallationFolder emustation '') -ne 'C:\Emu-Station') { throw 'Emu-Station default failed' }
if ((Resolve-InstallationFolder emustation 'D:\Emu Station') -ne 'D:\Emu Station') { throw 'Emu-Station custom path was overridden' }
$script:available+= 'C:\RetroArch\retroarch.exe'
if ((Resolve-InstallationFolder retroarch 'C:\RetroArch') -ne 'C:\RetroArch') { throw 'Valid default was overridden' }
$script:available=@()
if ((Resolve-InstallationFolder retroarch 'C:\RetroArch') -ne 'C:\RetroArch') { throw 'Missing installation was invented' }
'PASS: Win64 detection, all platform defaults, custom paths, RetroBat isolation, missing installation'
