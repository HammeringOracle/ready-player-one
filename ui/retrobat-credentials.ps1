$ErrorActionPreference = 'Stop'
try {
  $request = [Console]::In.ReadToEnd() | ConvertFrom-Json
  $share = switch ([string]$request.platform) {
    'windows' { 'RP2Status' }
    'retroarch' { 'RetroArch' }
    'esde' { 'ROMs' }
    'emustation' { 'Emu-Station' }
    default { 'RetroBat' }
  }
  $librarySuffix = if ([string]$request.platform -eq 'esde') { '' } else { 'roms' }
  Add-Type -TypeDefinition @'
using System;
using System.Runtime.InteropServices;
public static class RetroBatCredentials {
 [StructLayout(LayoutKind.Sequential, CharSet=CharSet.Unicode)]
 public struct Resource { public int scope,type,displayType,usage; public string local,remote,comment,provider; }
 [DllImport("mpr.dll",CharSet=CharSet.Unicode)] public static extern int WNetAddConnection2(ref Resource resource,string password,string username,int flags);
 [StructLayout(LayoutKind.Sequential,CharSet=CharSet.Unicode)]
 public struct Credential { public int flags,type; public string target,comment; public long written; public int size; public IntPtr blob; public int persist,count; public IntPtr attributes; public string alias,username; }
 [DllImport("advapi32.dll",EntryPoint="CredWriteW",CharSet=CharSet.Unicode,SetLastError=true)] public static extern bool Write(ref Credential credential,int flags);
}
'@
  $resource = New-Object RetroBatCredentials+Resource
  $resource.type = 1
  $resource.remote = '\\' + $request.host + '\' + $share
  $code = [RetroBatCredentials]::WNetAddConnection2([ref]$resource,[string]$request.password,[string]$request.username,0)
  if ($code -ne 0) {
    $message = switch ($code) {
      1219 { 'Windows already has a connection to this machine using another account. Disconnect that machine in File Explorer, then try again.' }
      1326 { 'The username or password was not accepted.' }
      1331 { 'That Windows account is disabled. Use the enabled account shown in Ready Player Two; do not use the disabled built-in Administrator account.' }
      1909 { 'That Windows account is locked. Unlock it on the remote computer before trying again.' }
      5 { "Access denied. Check the account and $share share permissions." }
      53 { 'The machine could not be reached.' }
      67 { "The $share share was not found on this machine." }
      default { "Windows could not connect (error $code)." }
    }
    throw $message
  }
  # A successful network login must also allow reading the library.
  $libraryPath = if ($librarySuffix) { $resource.remote + '\' + $librarySuffix } else { $resource.remote }
  Get-Item -LiteralPath $libraryPath -ErrorAction Stop | Out-Null
  if ($request.remember -eq $true) {
    $cred = New-Object RetroBatCredentials+Credential
    $cred.type=2; $cred.target=[string]$request.host; $cred.username=[string]$request.username; $cred.persist=2
    $cred.size=[Text.Encoding]::Unicode.GetByteCount([string]$request.password)
    $cred.blob=[Runtime.InteropServices.Marshal]::StringToCoTaskMemUni([string]$request.password)
    try {
      if (-not [RetroBatCredentials]::Write([ref]$cred,0)) { throw 'Connected, but Windows could not save this credential. Uncheck Remember and connect for this session only.' }
    } finally { [Runtime.InteropServices.Marshal]::ZeroFreeCoTaskMemUnicode($cred.blob) }
  }
  @{ok=$true;remembered=($request.remember -eq $true)} | ConvertTo-Json -Compress
} catch {
  @{ok=$false;error=$_.Exception.Message} | ConvertTo-Json -Compress
} finally { if ($request) { $request.password=$null } }
