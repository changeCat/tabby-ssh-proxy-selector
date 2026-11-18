$ErrorActionPreference = 'Stop'
$repo = (Get-Item -LiteralPath (Join-Path $PSScriptRoot '..')).FullName
$package = Get-Content -LiteralPath (Join-Path $repo 'package.json') -Raw | ConvertFrom-Json
$name = 'tabby-ssh-proxy-selector'
if ($package.name -ne $name -or $package.version -notmatch '^\d+\.\d+\.\d+$') {
    throw 'Unexpected package name or version.'
}

$archive = "$name-$($package.version)"
$stage = Join-Path $repo ('.release-' + [guid]::NewGuid())
Push-Location -LiteralPath $repo
try {
    $null = New-Item -ItemType Directory -Path $stage
    npm.cmd pack --pack-destination $stage
    if ($LASTEXITCODE -ne 0) { throw 'npm pack failed.' }

    tar.exe -xzf (Join-Path $stage "$archive.tgz") -C $stage
    if ($LASTEXITCODE -ne 0) { throw 'Could not extract the npm package.' }
    Rename-Item -LiteralPath (Join-Path $stage 'package') -NewName $name
    Copy-Item -LiteralPath (Join-Path $PSScriptRoot 'install.cmd'), (Join-Path $PSScriptRoot 'install.ps1') -Destination $stage

    $zip = Join-Path $stage "$archive.zip"
    tar.exe -a -cf $zip -C $stage install.cmd install.ps1 $name
    if ($LASTEXITCODE -ne 0) { throw 'Could not create the release ZIP.' }
    Move-Item -LiteralPath $zip -Destination (Join-Path $repo "$archive.zip") -Force
    Write-Host "Created $archive.zip"
} finally {
    Pop-Location
    if ((Split-Path -Parent $stage) -eq $repo -and (Test-Path -LiteralPath $stage)) {
        Remove-Item -LiteralPath $stage -Recurse -Force
    }
}
