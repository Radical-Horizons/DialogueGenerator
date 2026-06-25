# Liste les commits depuis le dernier tag prod semver (vX.Y.Z) ou depuis un tag explicite.
# Usage: .\scripts\list-commits-since-prod.ps1 [-SinceTag v1.2.0] [-Json]
param(
    [string]$SinceTag = "",
    [switch]$Json
)

$ErrorActionPreference = "Stop"
Set-Location (Split-Path $PSScriptRoot -Parent)

function Get-LatestProdTag {
    $tags = git tag -l "v*" --sort=-v:refname 2>$null
    if (-not $tags) {
        return $null
    }
    foreach ($t in $tags) {
        if ($t -match '^v\d+\.\d+\.\d+$') {
            return $t
        }
    }
    return $null
}

$baseTag = if ($SinceTag) { $SinceTag } else { Get-LatestProdTag }
$range = if ($baseTag) { "${baseTag}..HEAD" } else { "HEAD" }

$count = [int](git rev-list --count $range 2>$null)
if ($LASTEXITCODE -ne 0) {
    Write-Error "Plage git invalide: $range (tag absent ?)"
}

$commits = git log $range --format="%h|%ci|%s" 2>$null
$lines = @($commits | Where-Object { $_ -match '\S' })

if ($Json) {
    $items = foreach ($line in $lines) {
        $parts = $line -split '\|', 3
        [ordered]@{
            hash    = $parts[0]
            date    = $parts[1]
            subject = $parts[2]
        }
    }
    [pscustomobject]@{
        sinceTag    = $baseTag
        range       = $range
        commitCount = $count
        commits     = $items
    } | ConvertTo-Json -Depth 4
    exit 0
}

Write-Host "Dernier passage prod (tag): $(if ($baseTag) { $baseTag } else { '(aucun tag vX.Y.Z - historique complet)' })"
Write-Host "Plage: $range"
Write-Host "Commits: $count"
Write-Host ""
foreach ($line in $lines) {
    Write-Host $line.Replace('|', ' ')
}
