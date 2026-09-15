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
    [string]$ModelRoot,
    [ValidateSet('fast','quality','both')][string]$Profile = 'fast',
    [switch]$WithTextIndex,
    [switch]$SkipModels
)
$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest
$taskRoot = [IO.Path]::GetFullPath($RuntimeRoot)
$taskModelRoot = if ($ModelRoot) { [IO.Path]::GetFullPath($ModelRoot) } else { Join-Path $taskRoot 'models' }
# Rust canonical paths use the Windows extended-path prefix (\\?\). PowerShell's
# filesystem provider does not consistently accept that prefix in Join-Path.
if ($taskRoot.StartsWith('\\?\')) { $taskRoot = $taskRoot.Substring(4) }
if ($taskModelRoot.StartsWith('\\?\')) { $taskModelRoot = $taskModelRoot.Substring(4) }
$basePython = (Resolve-Path -LiteralPath $PythonExe).Path
$mediaFolder = (Resolve-Path -LiteralPath $MediaBin).Path
if ($taskRoot -eq [IO.Path]::GetPathRoot($taskRoot)) { throw 'Choose a dedicated runtime directory, not a drive root.' }
if ($taskModelRoot -eq [IO.Path]::GetPathRoot($taskModelRoot)) { throw 'Choose a dedicated model directory, not a drive root.' }
foreach ($binaryName in @('ffmpeg.exe','ffprobe.exe')) {
    if (-not (Test-Path -LiteralPath (Join-Path $mediaFolder $binaryName) -PathType Leaf)) { throw "Missing $binaryName in MediaBin." }
}
$pythonIdentity = & $basePython -c 'import sys,struct;print(sys.version_info.major,sys.version_info.minor,struct.calcsize(bytes([80]).decode()))'
if ($LASTEXITCODE -ne 0 -or $pythonIdentity -notmatch '^3 (11|12) 8$') { throw 'CPython 3.11/3.12 x64 is required.' }
New-Item -ItemType Directory -Path $taskRoot -Force | Out-Null
New-Item -ItemType Directory -Path $taskModelRoot -Force | Out-Null
$progressPath = [IO.Path]::Combine($taskRoot, '.synccut-runtime-progress.json')
function Set-SetupProgress([string]$Stage, [string]$Message) {
    [ordered]@{stage=$Stage;message=$Message;currentItem='';modelKey='';downloadedBytes=0;totalBytes=0} |
        ConvertTo-Json -Compress | Set-Content -LiteralPath $progressPath -Encoding utf8
}
Set-SetupProgress 'python' 'Creating the local Python environment…'
$runtimePython = Join-Path $taskRoot 'python/Scripts/python.exe'
if (-not (Test-Path -LiteralPath $runtimePython)) {
    & $basePython -m venv (Join-Path $taskRoot 'python')
    if ($LASTEXITCODE -ne 0) { throw 'Cannot create the runtime venv.' }
}
function Install-RuntimePackages([string[]]$Arguments) {
    & $runtimePython -m pip @Arguments
    if ($LASTEXITCODE -ne 0) { throw 'Package installation failed. Fix the reported error and rerun setup.' }
}
$env:PIP_NO_CACHE_DIR = '1'
# CUDA PyTorch is several GB. Do not retain another full wheel in the user's
# profile cache while installing the local runtime.
Set-SetupProgress 'packages' 'Installing local AI and GPU packages…'
Install-RuntimePackages @('install','pip==25.2')
Install-RuntimePackages @('install','torch==2.7.1','torchvision==0.22.1','torchaudio==2.7.1','--index-url','https://download.pytorch.org/whl/cu126')
Install-RuntimePackages @('install','-r',(Join-Path $PSScriptRoot 'requirements.txt'))
& $runtimePython -m pip check
if ($LASTEXITCODE -ne 0) { throw 'Runtime has conflicting dependencies.' }
$binTarget = Join-Path $taskRoot 'bin'
Set-SetupProgress 'media' 'Preparing local media tools…'
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
    Set-SetupProgress 'models' 'Preparing model downloads…'
    $modelArgs = @((Join-Path $PSScriptRoot 'manage_models.py'),'install','--root',$taskRoot,'--model-root',$taskModelRoot,'--profile',$Profile)
    if ($WithTextIndex) { $modelArgs += '--with-text' }
    & $runtimePython @modelArgs
    if ($LASTEXITCODE -ne 0) { throw 'Model installation incomplete. Rerun setup to resume downloads.' }
}
Set-SetupProgress 'verify' 'Checking the local GPU and media tools…'
& $runtimePython (Join-Path $PSScriptRoot 'preflight.py') --root $taskRoot
if ($LASTEXITCODE -ne 0) { throw 'Runtime installed, but GPU/media validation failed. Check the NVIDIA driver and rerun setup.' }
Write-Host "Runtime prepared and validated at $taskRoot"
Set-SetupProgress 'ready' 'Runtime and selected models are ready.'
Write-Host 'SyncCut can now use this runtime. Complete an actual project and Premiere round-trip before delivery.'
