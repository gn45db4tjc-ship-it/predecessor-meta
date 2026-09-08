param([switch]$StartNow, [switch]$Uninstall)
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
$pythonWindowless = Join-Path (Split-Path -Parent $python) 'pythonw.exe'
if (!(Test-Path -LiteralPath $pythonWindowless)) { throw 'pythonw.exe is missing from this Python installation.' }
$scriptPath = Join-Path $updaterRoot 'local_updater.py'
$quotedScript = '"' + $scriptPath + '"'
$shell = New-Object -ComObject WScript.Shell
$shortcut = $shell.CreateShortcut($startupLink)
$shortcut.TargetPath = $pythonWindowless
$shortcut.Arguments = '-B ' + $quotedScript + ' --daemon'
$shortcut.WorkingDirectory = $updaterRoot
$shortcut.Description = 'Check Predecessor updates while this Windows user is signed in.'
$shortcut.Save()
$shortcut = $shell.CreateShortcut($manualLink)
$shortcut.TargetPath = $python
$shortcut.Arguments = '-B ' + $quotedScript + ' --force'
$shortcut.WorkingDirectory = $updaterRoot
$shortcut.Description = 'Collect and publish current Predecessor data now.'
$shortcut.Save()
@{ installed_at = (Get-Date).ToString('o'); python = $python; startup = $startupLink; manual = $manualLink } |
    ConvertTo-Json | Set-Content -LiteralPath (Join-Path $updaterRoot '.local-publisher\installation.json') -Encoding utf8
if ($StartNow) {
    Start-Process -FilePath $pythonWindowless -ArgumentList ('-B ' + $quotedScript + ' --daemon') -WorkingDirectory $updaterRoot -WindowStyle Hidden
}
Write-Output 'Windows updater installed. It checks on sign-in and every three hours while the PC is available.'
