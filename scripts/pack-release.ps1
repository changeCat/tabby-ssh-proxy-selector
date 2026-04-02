$ErrorActionPreference = 'Stop'

$packageFile = npm pack
$packageFile = $packageFile | Select-Object -Last 1

$package = Get-Content ./package.json | ConvertFrom-Json
$packageName = $package.name
$packageVersion = $package.version
$zipFile = "$packageName-$packageVersion.zip"

$stageRoot = Join-Path $PWD 'release-stage'
$extractRoot = Join-Path $stageRoot 'extract'
$moduleRoot = Join-Path $stageRoot 'module'
$finalModuleDir = Join-Path $moduleRoot $packageName

if (Test-Path $stageRoot) {
    Remove-Item $stageRoot -Recurse -Force
}

New-Item -ItemType Directory -Path $extractRoot | Out-Null
New-Item -ItemType Directory -Path $moduleRoot | Out-Null

tar -xzf $packageFile -C $extractRoot
Move-Item (Join-Path $extractRoot 'package') $finalModuleDir

if (Test-Path $zipFile) {
    Remove-Item $zipFile -Force
}

Compress-Archive -Path $finalModuleDir -DestinationPath $zipFile

Write-Host "Created local release archive: $zipFile"
Write-Host "Expanded module directory: $finalModuleDir"