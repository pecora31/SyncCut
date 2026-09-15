[CmdletBinding()]
param([Parameter(Mandatory=$true)][string]$RuntimeRoot, [ValidateSet('fast','quality','both')][string]$Profile='fast', [switch]$WithTextIndex)
$ErrorActionPreference='Stop'
$runtimePython=Join-Path ([IO.Path]::GetFullPath($RuntimeRoot)) 'python/Scripts/python.exe'
if (-not (Test-Path -LiteralPath $runtimePython)) { $runtimePython=Join-Path $RuntimeRoot 'python/python.exe' }
& $runtimePython -m pip check
if ($LASTEXITCODE -ne 0) { throw 'Dependency check failed.' }
& $runtimePython (Join-Path $PSScriptRoot 'preflight.py') --root $RuntimeRoot
if ($LASTEXITCODE -ne 0) { throw 'Hardware/runtime preflight failed.' }
$modelArgs=@((Join-Path $PSScriptRoot 'manage_models.py'),'verify','--root',$RuntimeRoot,'--profile',$Profile)
if ($WithTextIndex) { $modelArgs+='--with-text' }
& $runtimePython @modelArgs
if ($LASTEXITCODE -ne 0) { throw 'Model integrity check failed.' }
& $runtimePython -m unittest discover -s (Join-Path $PSScriptRoot 'tests') -v
if ($LASTEXITCODE -ne 0) { throw 'Engine contract tests failed.' }
Write-Host 'Preflight complete. Continue with an actual project and Premiere round-trip from docs/customer-validation.md.'
