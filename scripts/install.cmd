@echo off
setlocal DisableDelayedExpansion
set "TABBY_PROXY_INSTALLER=%~f0"
powershell.exe -NoProfile -Command "$file = Get-Content -Raw -LiteralPath $env:TABBY_PROXY_INSTALLER; $body = ($file -split '(?m)^:powershell\r?$', 2)[1]; & ([scriptblock]::Create($body))"
if errorlevel 1 (
    echo Installation failed. Extract the entire ZIP and close Tabby before retrying.
    pause
    exit /b 1
)
exit /b 0

:powershell
$ErrorActionPreference = 'Stop'
$name = 'tabby-ssh-proxy-selector'
$archive = Join-Path (Split-Path -Parent $env:TABBY_PROXY_INSTALLER) "$name.tgz"
$plugins = [IO.Path]::GetFullPath((Join-Path $env:APPDATA 'tabby\plugins'))
$modules = Join-Path $plugins 'node_modules'
$target = Join-Path $modules $name
$cache = Join-Path $plugins '.ssh-proxy-packages'
$manifestPath = Join-Path $plugins 'package.json'
$hash = (Get-FileHash -LiteralPath $archive -Algorithm SHA256).Hash.ToLowerInvariant()
$spec = "file:.ssh-proxy-packages/$hash.tgz"
$null = [IO.Directory]::CreateDirectory($modules)
if (Test-Path -LiteralPath $target) {
    $existing = Get-Item -Force -LiteralPath $target
    if ($existing.Attributes -band [IO.FileAttributes]::ReparsePoint) {
        throw "The plugin directory is linked. Update its source directly: $target"
    }
    $installed = Get-Content -LiteralPath (Join-Path $target 'package.json') -Encoding UTF8 -Raw | ConvertFrom-Json
    if ($installed.name -ne $name) { throw "A different package already occupies $target" }
}

$stage = Join-Path $plugins '.ssh-proxy-installing'
$null = New-Item -ItemType Directory -Path $stage -ErrorAction Stop
$incoming = Join-Path $stage 'package'
$previous = Join-Path $stage 'previous'
$draft = Join-Path $stage 'manifest.json'
try {
    # Stage a complete package before editing the shared plugin manifest.
    & (Join-Path $env:SystemRoot 'System32\tar.exe') -xzf $archive -C $stage
    if ($LASTEXITCODE -ne 0) { throw 'Invalid plugin archive.' }
    $manifest = Get-Content -LiteralPath (Join-Path $incoming 'package.json') -Encoding UTF8 -Raw | ConvertFrom-Json
    if ($manifest.name -ne $name) { throw 'Unexpected plugin package.' }
    foreach ($file in 'dist/index.js', 'node_modules/socks/package.json', 'node_modules/smart-buffer/package.json', 'node_modules/ip-address/package.json') {
        if (-not [IO.File]::Exists((Join-Path $incoming $file))) { throw "Incomplete archive: $file" }
    }
    $root = if ([IO.File]::Exists($manifestPath)) {
        Get-Content -LiteralPath $manifestPath -Encoding UTF8 -Raw | ConvertFrom-Json
    } else { [pscustomobject]@{} }
    if ($root -isnot [pscustomobject]) { throw 'Invalid Tabby plugin manifest.' }
    if (-not $root.PSObject.Properties['dependencies']) { $root | Add-Member -NotePropertyName dependencies -NotePropertyValue ([pscustomobject]@{}) }
    if ($root.dependencies -isnot [pscustomobject]) { throw 'Invalid Tabby plugin dependencies.' }
    $root.dependencies | Add-Member -MemberType NoteProperty -Name $name -Value $spec -Force
    [IO.File]::WriteAllText($draft, (ConvertTo-Json $root -Depth 100), [Text.UTF8Encoding]::new($false))

    $null = [IO.Directory]::CreateDirectory($cache)
    $cached = Join-Path $cache "$hash.tgz"
    if (-not [IO.File]::Exists($cached)) {
        $copy = Join-Path $stage 'source.tgz'
        [IO.File]::Copy($archive, $copy)
        [IO.File]::Move($copy, $cached)
    }
    if ([IO.Directory]::Exists($target)) { [IO.Directory]::Move($target, $previous) }
    try {
        [IO.Directory]::Move($incoming, $target)
        try {
            if ([IO.File]::Exists($manifestPath)) { [IO.File]::Replace($draft, $manifestPath, (Join-Path $stage 'previous.json')) }
            else { [IO.File]::Move($draft, $manifestPath) }
        } catch {
            [IO.Directory]::Move($target, $incoming)
            throw
        }
    } catch {
        if ([IO.Directory]::Exists($previous)) { [IO.Directory]::Move($previous, $target) }
        throw
    }
    if ([IO.Directory]::Exists($previous)) { [IO.Directory]::Delete($previous, $true) }
} finally {
    if ([IO.Directory]::Exists($previous)) {
        Write-Warning "Previous installation retained at $previous"
    } elseif ((Split-Path -Parent $stage) -eq $plugins) {
        Remove-Item -LiteralPath $stage -Recurse -Force
    }
}
Write-Host "Installed $name $($manifest.version). Restart Tabby to load the plugin."
