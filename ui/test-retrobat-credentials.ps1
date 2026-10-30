$ErrorActionPreference='Stop'
$errors=$null
$ast=[System.Management.Automation.Language.Parser]::ParseFile((Join-Path $PSScriptRoot 'retrobat-credentials.ps1'),[ref]$null,[ref]$errors)
if($errors){throw ($errors|Out-String)}
$source=$ast.FindAll({param($n) $n -is [System.Management.Automation.Language.StringConstantExpressionAst] -and $n.Value -like '*public static class RetroBatCredentials*'},$true)[0].Value
Add-Type -TypeDefinition $source
'PASS: native helper compiled; no credentials saved or connections made.'
