$ErrorActionPreference = 'Stop'
$name = 'tabby-ssh-proxy-selector'
$source = Join-Path $PSScriptRoot $name
$manifest = Get-Content -LiteralPath (Join-Path $source 'package.json') -Raw | ConvertFrom-Json
if ($manifest.name -ne $name) { throw 'Unexpected plugin package.' }
foreach ($file in 'dist/index.js', 'node_modules/socks/package.json', 'node_modules/smart-buffer/package.json', 'node_modules/ip-address/package.json') {
    if (-not (Test-Path -LiteralPath (Join-Path $source $file) -PathType Leaf)) {
        throw "Incomplete package. Extract the entire ZIP before installing. Missing: $file"
    }
}

$plugins = [IO.Path]::GetFullPath((Join-Path $env:APPDATA 'tabby\plugins'))
$modules = Join-Path $plugins 'node_modules'
$target = Join-Path $modules $name
$null = [IO.Directory]::CreateDirectory($modules)
if (Test-Path -LiteralPath $target) {
    $existing = Get-Item -Force -LiteralPath $target
    if ($existing.Attributes -band [IO.FileAttributes]::ReparsePoint) {
        throw "The plugin directory is linked. Update its source directly: $target"
    }
    $installed = Get-Content -LiteralPath (Join-Path $target 'package.json') -Raw | ConvertFrom-Json
    if ($installed.name -ne $name) { throw "A different package already occupies $target" }
}

# Both renames stay on the same volume. Tabby only sees complete packages.
$stage = Join-Path $plugins ('.ssh-proxy-install-' + [guid]::NewGuid())
$incoming = Join-Path $stage 'incoming'
$previous = Join-Path $stage 'previous'
$null = [IO.Directory]::CreateDirectory($stage)
try {
    Copy-Item -LiteralPath $source -Destination $incoming -Recurse -Force
    if ([IO.Directory]::Exists($target)) {
        [IO.Directory]::Move($target, $previous)
    }
    try {
        [IO.Directory]::Move($incoming, $target)
    } catch {
        if ([IO.Directory]::Exists($previous)) {
            [IO.Directory]::Move($previous, $target)
        }
        throw
    }
    if ([IO.Directory]::Exists($previous)) {
        [IO.Directory]::Delete($previous, $true)
    }
} finally {
    if ([IO.Directory]::Exists($previous)) {
        Write-Warning "Previous installation retained at $previous"
    } elseif ((Split-Path -Parent $stage) -eq $plugins) {
        Remove-Item -LiteralPath $stage -Recurse -Force
    }
}
Write-Host "Installed $name $($manifest.version). Restart Tabby to load the plugin."
