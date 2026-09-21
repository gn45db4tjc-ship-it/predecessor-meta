# Cloud collection remains primary. Manual recovery is the default; -Automatic explicitly
# enables a hidden sign-in fallback. Both use the same daily and patch-aware collector.
param([switch]$Uninstall, [switch]$Automatic, [string]$PythonPath, [string]$PublisherDirectory)
$ErrorActionPreference = 'Stop'
$updaterRoot = $PSScriptRoot
$privateRoot = if ($PublisherDirectory) { [IO.Path]::GetFullPath($PublisherDirectory) } else { Join-Path $updaterRoot '.local-publisher' }
$startupFolder = [Environment]::GetFolderPath('Startup')
$desktopFolder = [Environment]::GetFolderPath('Desktop')
$startupLink = Join-Path $startupFolder 'Predecessor Meta Updater.lnk'
$manualLink = Join-Path $desktopFolder 'Update Predecessor Website.lnk'
if ($Uninstall) {
    # Remove only this program's two shortcuts. Data and publishing credentials remain.
    foreach ($link in @($startupLink, $manualLink)) {
        if (Test-Path -LiteralPath $link) { Remove-Item -LiteralPath $link }
    }
    $stopPath = Join-Path $privateRoot 'stop'
    [IO.File]::WriteAllText($stopPath, '')
    Write-Output 'Automatic updater paused. The website stays online.'
    exit
}
if (!(Test-Path -LiteralPath (Join-Path $privateRoot 'ssh\windows_publisher_ed25519'))) {
    throw 'The repository-only publishing connection must be configured first.'
}
$candidates = @()
if ($PythonPath) { $candidates += $PythonPath }
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
$hiddenPython = Join-Path (Split-Path $python) 'pythonw.exe'
if ($Automatic -and !(Test-Path -LiteralPath $hiddenPython)) { throw 'The selected Python needs pythonw.exe for a hidden sign-in updater.' }
$scriptPath = Join-Path $updaterRoot 'local_updater.py'
$quotedScript = '"' + $scriptPath + '"'
$shell = New-Object -ComObject WScript.Shell
# Replace only this application's shortcut and request a graceful stop before reconfiguration.
if (Test-Path -LiteralPath $startupLink) { Remove-Item -LiteralPath $startupLink }
[IO.File]::WriteAllText((Join-Path $privateRoot 'stop'), '')
$shortcut = $shell.CreateShortcut($manualLink)
$shortcut.TargetPath = $python
$privateArgument = ' --publisher-dir "' + $privateRoot + '"'
$shortcut.Arguments = '-B ' + $quotedScript + ' --force' + $privateArgument
$shortcut.WorkingDirectory = $updaterRoot
$shortcut.Description = 'Collect and publish current Predecessor data now.'
$shortcut.Save()
if ($Automatic) {
    $hiddenPython = Join-Path (Split-Path $python) 'pythonw.exe'
    if (!(Test-Path -LiteralPath $hiddenPython)) { throw 'The selected Python needs pythonw.exe for a hidden sign-in updater.' }
    $auto = $shell.CreateShortcut($startupLink)
    $auto.TargetPath = $hiddenPython
    $auto.Arguments = '-B ' + $quotedScript + ' --daemon' + $privateArgument
    $auto.WorkingDirectory = $updaterRoot
    $auto.Description = 'Free Predecessor checks every three hours while signed in; daily and patch-aware collection.'
    $auto.Save()
}
@{ installed_at = (Get-Date).ToString('o'); python = $python; startup = $(if ($Automatic) {$startupLink} else {$null}); manual = $manualLink; mode = $(if ($Automatic) {'automatic fallback'} else {'manual recovery'}); publisher = $privateRoot } |
    ConvertTo-Json | Set-Content -LiteralPath (Join-Path $privateRoot 'installation.json') -Encoding utf8
Write-Output $(if ($Automatic) {'Free sign-in fallback configured. Start it once now; subsequent sign-ins start it automatically.'} else {'Manual recovery configured. Daily cloud collection remains active.'})
