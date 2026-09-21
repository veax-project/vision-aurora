<#
.SYNOPSIS
    Installs a cursor pack for the current user. No administrator rights needed.

.DESCRIPTION
    Copies the pack into %LOCALAPPDATA%\Microsoft\Windows\Cursors, registers it as a
    named scheme under HKCU, and applies it immediately. The right-click "Install"
    on install.inf does the same thing but writes into C:\Windows, which needs admin.

.PARAMETER Pack
    Pack folder name, e.g. vision-aurora. Omit to pick from a list.

.PARAMETER Uninstall
    Remove the pack's files and scheme, and return to the Windows default cursors.

.EXAMPLE
    .\install.ps1 vision-aurora

.EXAMPLE
    .\install.ps1 -Uninstall vision-aurora
#>
[CmdletBinding()]
param(
    [Parameter(Position = 0)]
    [string]$Pack,
    [switch]$Uninstall
)

$ErrorActionPreference = 'Stop'

$PacksRoot = Join-Path $PSScriptRoot 'packs'
if (-not (Test-Path $PacksRoot)) {
    throw "No packs\ folder next to this script. Run it from the repository root."
}

# Registry value name -> file name, read from the pack's own manifest. The
# extensions differ between packs: an animated pack ships .ani where a static
# one ships .cur, so nothing here may assume one or the other.
function Get-PackManifest {
    param([string]$PackDir)
    $file = Join-Path $PackDir 'pack.json'
    if (-not (Test-Path $file)) {
        throw "No pack.json in $PackDir. Run 'npm run build' first."
    }
    $json = Get-Content $file -Raw | ConvertFrom-Json
    $roles = [ordered]@{}
    foreach ($role in $json.order) { $roles[$role] = $json.roles.$role }
    return @{ Name = $json.name; Roles = $roles; Animated = $json.animated }
}

# Asks Windows to reload the cursors so the change shows up without a sign-out.
function Update-Cursors {
    if (-not ('AuroraNative' -as [type])) {
        Add-Type -Namespace '' -Name 'AuroraNative' -MemberDefinition @'
[DllImport("user32.dll", SetLastError = true)]
public static extern bool SystemParametersInfo(uint uiAction, uint uiParam, IntPtr pvParam, uint fWinIni);
'@
    }
    # SPI_SETCURSORS = 0x0057, SPIF_SENDCHANGE = 0x02
    [void][AuroraNative]::SystemParametersInfo(0x0057, 0, [IntPtr]::Zero, 0x02)
}

$available = Get-ChildItem -Path $PacksRoot -Directory | Select-Object -ExpandProperty Name

if (-not $Pack) {
    Write-Host ''
    Write-Host '  Cursor packs' -ForegroundColor Cyan
    Write-Host ''
    for ($i = 0; $i -lt $available.Count; $i++) {
        Write-Host ("   [{0}] {1}" -f ($i + 1), $available[$i])
    }
    Write-Host ''
    $choice = Read-Host '  Number to install'
    $index = 0
    if (-not [int]::TryParse($choice, [ref]$index) -or $index -lt 1 -or $index -gt $available.Count) {
        throw "Not a valid choice."
    }
    $Pack = $available[$index - 1]
}

if ($available -notcontains $Pack) {
    throw "Unknown pack '$Pack'. Available: $($available -join ', ')"
}

$source = Join-Path $PacksRoot $Pack
$target = Join-Path $env:LOCALAPPDATA "Microsoft\Windows\Cursors\$Pack"
$manifest = Get-PackManifest $source
$Roles = $manifest.Roles
$schemeName = $manifest.Name
$cursorsKey = 'HKCU:\Control Panel\Cursors'
$schemesKey = 'HKCU:\Control Panel\Cursors\Schemes'

if ($Uninstall) {
    Remove-ItemProperty -Path $schemesKey -Name $schemeName -ErrorAction SilentlyContinue
    foreach ($role in $Roles.Keys) {
        Set-ItemProperty -Path $cursorsKey -Name $role -Value '' -Type ExpandString
    }
    Set-ItemProperty -Path $cursorsKey -Name '(Default)' -Value 'Windows Default' -Type String
    if (Test-Path $target) { Remove-Item -Path $target -Recurse -Force }
    Update-Cursors
    Write-Host "  Removed $schemeName and restored the Windows default." -ForegroundColor Yellow
    return
}

foreach ($file in $Roles.Values) {
    if (-not (Test-Path (Join-Path $source $file))) {
        throw "Pack '$Pack' is missing $file. Run 'npm run build' first."
    }
}

New-Item -ItemType Directory -Path $target -Force | Out-Null
Copy-Item -Path (Join-Path $source '*.cur') -Destination $target -Force
Copy-Item -Path (Join-Path $source '*.ani') -Destination $target -Force

if (-not (Test-Path $schemesKey)) { New-Item -Path $schemesKey -Force | Out-Null }

$paths = foreach ($file in $Roles.Values) { Join-Path $target $file }
Set-ItemProperty -Path $schemesKey -Name $schemeName -Value ($paths -join ',') -Type String

foreach ($role in $Roles.Keys) {
    Set-ItemProperty -Path $cursorsKey -Name $role -Value (Join-Path $target $Roles[$role]) -Type ExpandString
}
Set-ItemProperty -Path $cursorsKey -Name '(Default)' -Value $schemeName -Type String

Update-Cursors

Write-Host ''
Write-Host "  $schemeName installed and applied." -ForegroundColor Green
Write-Host "  Files: $target"
Write-Host "  To switch back:  .\install.ps1 -Uninstall $Pack"
Write-Host ''
