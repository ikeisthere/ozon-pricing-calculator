param(
  [string]$HomepageRepo = (Join-Path (Split-Path (Split-Path $PSScriptRoot -Parent) -Parent) 'kuakuakua.com')
)

$ErrorActionPreference = 'Stop'
$repoRoot = Split-Path $PSScriptRoot -Parent
$allowedFiles = @(
  'pricing-calculator/index.html',
  'pricing-calculator/calculator.css',
  'pricing-calculator/calculator.js',
  'tools/tools.css',
  'tools/tools.js',
  'brand-mark.svg'
)

if (-not (Test-Path (Join-Path $HomepageRepo '.git'))) {
  throw "Homepage source repository not found: $HomepageRepo"
}

foreach ($relativePath in $allowedFiles) {
  $source = Join-Path $HomepageRepo ($relativePath -replace '/', [IO.Path]::DirectorySeparatorChar)
  $destination = Join-Path $repoRoot ($relativePath -replace '/', [IO.Path]::DirectorySeparatorChar)
  if (-not (Test-Path $source -PathType Leaf)) {
    throw "Required source file is missing: $source"
  }
  $destinationDirectory = Split-Path $destination -Parent
  New-Item -ItemType Directory -Path $destinationDirectory -Force | Out-Null
  Copy-Item -LiteralPath $source -Destination $destination -Force
}

Write-Output "Synced the calculator allowlist from $HomepageRepo. Review the diff, run tests, and commit manually."
