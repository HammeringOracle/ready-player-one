param([string]$Archive, [string]$Destination)
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.IO.Compression.FileSystem
$root = [IO.Path]::GetFullPath($Destination).TrimEnd('\') + '\'
[IO.Directory]::CreateDirectory($root) | Out-Null
$zip = [IO.Compression.ZipFile]::OpenRead($Archive)
try {
  $total = 0L
  foreach ($entry in $zip.Entries) {
    $target = [IO.Path]::GetFullPath([IO.Path]::Combine($root, $entry.FullName))
    if (!$target.StartsWith($root, [StringComparison]::OrdinalIgnoreCase) -or $entry.FullName.Contains(':')) { throw 'Unsafe archive path' }
    $total += $entry.Length
    if ($total -gt 1073741824) { throw 'Archive exceeds size limit' }
    if ($entry.Name -eq '') { continue }
    [IO.Directory]::CreateDirectory([IO.Path]::GetDirectoryName($target)) | Out-Null
    [IO.Compression.ZipFileExtensions]::ExtractToFile($entry, $target, $false)
  }
} finally { $zip.Dispose() }
