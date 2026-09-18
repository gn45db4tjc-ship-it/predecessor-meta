# Cloud collection (GitHub Actions) is the primary, daily collector. This PC is manual recovery only:
# this installer creates one Desktop shortcut that collects and publishes when you choose to run it.
# It no longer starts anything at sign-in, and it removes the sign-in shortcut older versions created.
param([switch]$Uninstall)
$ErrorActionPreference = 'Stop'
$updaterRoot = $PSScriptRoot
$startupFolder = [Environment]::GetFolderPath('Startup')
$desktopFolder = [Environment]::GetFolderPath('Desktop')
$startupLink = Join-Path $startupFolder 'Predecessor Meta Updater.lnk'
$manualLink = Join-Path $desktopFolder 'Update Predecessor Website.lnk'
if ($Uninstall) {
    # Remove only this program's two shortcuts. Data and publishing credentials remain.
    foreach ($link in @($startupLink, $manualLink)) {
        if (Test-Path -LiteralPath $link) { Remove-Item -LiteralPath $link }
    }
    $stopPath = Join-Path $updaterRoot '.local-publisher\stop'
    [IO.File]::WriteAllText($stopPath, '')
    Write-Output 'Automatic updater paused. The website stays online.'
    exit
}
if (!(Test-Path -LiteralPath (Join-Path $updaterRoot '.local-publisher\ssh\windows_publisher_ed25519'))) {
    throw 'The repository-only publishing connection must be configured first.'
}
$candidates = @()
$pythonCommand = Get-Command python -ErrorAction SilentlyContinue
if ($pythonCommand) { $candidates += $pythonCommand.Source }
$pythonLauncher = Get-Command py -ErrorAction SilentlyContinue
if ($pythonLauncher) {
    try {
        $located = & $pythonLauncher.Source -3 -c 'import sys; print(sys.executable)' 2>$null
        if ($LASTEXITCODE -eq 0) { $candidates += $located }
    } catch { }
}
$candidates += Join-Path $env:USERPROFILE '.cache\codex-runtimes\codex-primary-runtime\dependencies\python\python.exe'
$python = $null
foreach ($candidate in $candidates) {
    if (!(Test-Path -LiteralPath $candidate)) { continue }
    try {
        & $candidate -c 'import sys; assert sys.version_info >= (3,10)' 2>$null
        if ($LASTEXITCODE -eq 0) { $python = $candidate; break }
    } catch { }
}
if (!$python) { throw 'Python 3.10 or newer is required. Install Python for Windows, then run this installer again.' }
$scriptPath = Join-Path $updaterRoot 'local_updater.py'
$quotedScript = '"' + $scriptPath + '"'
$shell = New-Object -ComObject WScript.Shell
# Manual recovery only: remove the sign-in shortcut an older installer created, and ask a running updater to stop.
if (Test-Path -LiteralPath $startupLink) { Remove-Item -LiteralPath $startupLink }
[IO.File]::WriteAllText((Join-Path $updaterRoot '.local-publisher\stop'), '')
$shortcut = $shell.CreateShortcut($manualLink)
$shortcut.TargetPath = $python
$shortcut.Arguments = '-B ' + $quotedScript + ' --force'
$shortcut.WorkingDirectory = $updaterRoot
$shortcut.Description = 'Collect and publish current Predecessor data now.'
$shortcut.Save()
@{ installed_at = (Get-Date).ToString('o'); python = $python; startup = $null; manual = $manualLink; mode = 'manual recovery' } |
    ConvertTo-Json | Set-Content -LiteralPath (Join-Path $updaterRoot '.local-publisher\installation.json') -Encoding utf8
Write-Output 'Manual recovery shortcut installed on the Desktop. Daily collection runs in the cloud; nothing starts at sign-in.'
