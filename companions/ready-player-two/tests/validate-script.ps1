$ErrorActionPreference = 'Stop'
$parseErrors = $null
$ast = [System.Management.Automation.Language.Parser]::ParseFile((Join-Path $PSScriptRoot '..\setup.ps1'), [ref]$null, [ref]$parseErrors)
if ($parseErrors) { throw ($parseErrors | Out-String) }
$source = $ast.FindAll({param($node) $node -is [System.Management.Automation.Language.StringConstantExpressionAst] -and $node.Value -like '*public static class RetroSharingLoginCheck*'}, $true)[0].Value
Add-Type -TypeDefinition $source -ErrorAction Stop
Write-Output 'PASS: PowerShell parsed and login-check C# compiled under Windows PowerShell. No logon or settings changes executed.'
