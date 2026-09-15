<#
Run ONLY on the target computer. Creates a local venv, installs CUDA wheels and
downloads explicitly selected models. Requires an installed CPython 3.11/3.12 x64.
This venv depends on that Python installation; do not move it between computers.
#>
[CmdletBinding()]
param(
    [Parameter(Mandatory=$true)][string]$RuntimeRoot,
    [Parameter(Mandatory=$true)][string]$PythonExe,
    [Parameter(Mandatory=$true)][string]$MediaBin,
    [ValidateSet('fast','quality','both')][string]$Profile = 'fast',
    [switch]$WithTextIndex,
    [switch]$SkipModels
)
$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest
$taskRoot = [IO.Path]::GetFullPath($RuntimeRoot)
$basePython = (Resolve-Path -LiteralPath $PythonExe).Path
$mediaFolder = (Resolve-Path -LiteralPath $MediaBin).Path
if ($taskRoot -eq [IO.Path]::GetPathRoot($taskRoot)) { throw 'Choose a dedicated runtime directory, not a drive root.' }
foreach ($binaryName in @('ffmpeg.exe','ffprobe.exe')) {
    if (-not (Test-Path -LiteralPath (Join-Path $mediaFolder $binaryName) -PathType Leaf)) { throw "Missing $binaryName in MediaBin." }
}
$pythonIdentity = & $basePython -c 'import sys,struct;print(sys.version_info.major,sys.version_info.minor,struct.calcsize(bytes([80]).decode()))'
if ($LASTEXITCODE -ne 0 -or $pythonIdentity -notmatch '^3 (11|12) 8$') { throw 'CPython 3.11/3.12 x64 is required.' }
New-Item -ItemType Directory -Path $taskRoot -Force | Out-Null
$runtimePython = Join-Path $taskRoot 'python/Scripts/python.exe'
if (-not (Test-Path -LiteralPath $runtimePython)) {
    & $basePython -m venv (Join-Path $taskRoot 'python')
    if ($LASTEXITCODE -ne 0) { throw 'Cannot create the runtime venv.' }
}
function Install-RuntimePackages([string[]]$Arguments) {
    & $runtimePython -m pip @Arguments
    if ($LASTEXITCODE -ne 0) { throw 'Package installation failed. Fix the reported error and rerun setup.' }
}
Install-RuntimePackages @('install','pip==25.2')
Install-RuntimePackages @('install','torch==2.7.1','torchvision==0.22.1','torchaudio==2.7.1','--index-url','https://download.pytorch.org/whl/cu126')
Install-RuntimePackages @('install','-r',(Join-Path $PSScriptRoot 'requirements.txt'))
& $runtimePython -m pip check
if ($LASTEXITCODE -ne 0) { throw 'Runtime has conflicting dependencies.' }
$binTarget = Join-Path $taskRoot 'bin'
New-Item -ItemType Directory -Path $binTarget -Force | Out-Null
foreach ($binaryName in @('ffmpeg.exe','ffprobe.exe')) {
    $sourceBinary = Join-Path $mediaFolder $binaryName
    $targetBinary = Join-Path $binTarget $binaryName
    if ([IO.Path]::GetFullPath($sourceBinary) -ne [IO.Path]::GetFullPath($targetBinary)) { Copy-Item -LiteralPath $sourceBinary -Destination $targetBinary -Force }
}
# Static FFmpeg builds are recommended. Shared builds need their companion DLLs.
Get-ChildItem -LiteralPath $mediaFolder -Filter '*.dll' -File | ForEach-Object {
    $targetDll = Join-Path $binTarget $_.Name
    if ($_.FullName -ne [IO.Path]::GetFullPath($targetDll)) { Copy-Item -LiteralPath $_.FullName -Destination $targetDll -Force }
}
& $runtimePython -m pip freeze | Set-Content -LiteralPath (Join-Path $taskRoot 'installed-requirements.txt') -Encoding utf8
if (-not $SkipModels) {
    $modelArgs = @((Join-Path $PSScriptRoot 'manage_models.py'),'install','--root',$taskRoot,'--profile',$Profile)
    if ($WithTextIndex) { $modelArgs += '--with-text' }
    & $runtimePython @modelArgs
    if ($LASTEXITCODE -ne 0) { throw 'Model installation incomplete. Rerun setup to resume downloads.' }
}
Write-Host "Runtime prepared at $taskRoot"
Write-Host 'Next: run customer-check.ps1 on this machine, then choose this folder in SyncCut > Runtime.'
