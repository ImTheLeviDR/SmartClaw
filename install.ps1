param(
  [string]$RepoUrl = "https://github.com/ImTheLeviDR/SmartClaw",
  [string]$TargetDir = ""
)

$ErrorActionPreference = "Stop"

function Test-CommandExists {
  param([string]$Name)
  return $null -ne (Get-Command $Name -ErrorAction SilentlyContinue)
}

if (-not $TargetDir) {
  $TargetDir = [System.IO.Path]::GetFileNameWithoutExtension($RepoUrl.Split("/")[-1])
}

if (-not (Test-CommandExists "git")) {
  throw "git is required but was not found in PATH."
}

if (-not (Test-CommandExists "node")) {
  throw "Node.js is required but was not found in PATH."
}

if (-not (Test-Path $TargetDir)) {
  git clone $RepoUrl $TargetDir
}

Set-Location $TargetDir

Write-Host "SmartClaw installer targets Debian/Linux first, but this PowerShell path supports Windows too."

if (-not (Test-CommandExists "pnpm")) {
  if (Test-CommandExists "corepack") {
    corepack enable
    corepack prepare pnpm@latest --activate
  } else {
    throw "pnpm was not found and corepack is unavailable."
  }
}

pnpm install
pnpm run setup:wizard
