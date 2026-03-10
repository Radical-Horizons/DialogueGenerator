# Script de nettoyage des fichiers desktop.ini dans .git/
# Ces fichiers sont créés par Windows et peuvent corrompre les refs Git s'ils sont dans .git/refs/

param(
    [switch]$DryRun = $false
)

$ErrorActionPreference = "Stop"
$projectRoot = Split-Path -Parent $PSScriptRoot
$gitDir = Join-Path $projectRoot ".git"
$quarantineDir = Join-Path $gitDir "_desktop_ini_quarantine"

if (-not (Test-Path $gitDir)) {
    Write-Error ".git directory not found at: $gitDir"
    exit 1
}

# Créer le dossier de quarantaine
if (-not $DryRun) {
    New-Item -ItemType Directory -Force -Path $quarantineDir | Out-Null
}

# Trouver tous les desktop.ini dans .git/
$desktopIniFiles = Get-ChildItem -Force -Recurse -Path $gitDir -Filter "desktop.ini" -ErrorAction SilentlyContinue

if ($null -eq $desktopIniFiles -or $desktopIniFiles.Count -eq 0) {
    Write-Host "No desktop.ini files found in .git/" -ForegroundColor Green
    exit 0
}

Write-Host "Found $($desktopIniFiles.Count) desktop.ini file(s) in .git/" -ForegroundColor Yellow

# Grouper par emplacement pour un rapport plus lisible
$byLocation = $desktopIniFiles | Group-Object { Split-Path -Parent $_.FullName } | Sort-Object Name

Write-Host "`nFiles to quarantine:" -ForegroundColor Cyan
foreach ($group in $byLocation) {
    Write-Host "  $($group.Name): $($group.Count) file(s)"
}

# Déplacer les fichiers
$movedCount = 0
foreach ($file in $desktopIniFiles) {
    $relativePath = $file.FullName.Substring($gitDir.Length + 1)
    $quarantinePath = Join-Path $quarantineDir $relativePath
    $quarantineParent = Split-Path -Parent $quarantinePath
    
    if (-not $DryRun) {
        # Créer la structure de dossiers dans la quarantaine
        if ($quarantineParent -and -not (Test-Path $quarantineParent)) {
            New-Item -ItemType Directory -Force -Path $quarantineParent | Out-Null
        }
        
        # Retirer les attributs système/hidden avant de déplacer
        $file.Attributes = $file.Attributes -band (-bnot [System.IO.FileAttributes]::System) -band (-bnot [System.IO.FileAttributes]::Hidden)
        
        # Déplacer le fichier
        Move-Item -Force -LiteralPath $file.FullName -Destination $quarantinePath -ErrorAction SilentlyContinue
        if ($LASTEXITCODE -eq 0 -or (Test-Path $quarantinePath)) {
            $movedCount++
        }
    } else {
        $movedCount++
    }
}

if ($DryRun) {
    Write-Host "`n[DRY RUN] Would move $movedCount file(s) to quarantine" -ForegroundColor Yellow
} else {
    Write-Host "`nMoved $movedCount file(s) to quarantine: $quarantineDir" -ForegroundColor Green
    Write-Host "You can safely delete the quarantine directory if Git operations work correctly." -ForegroundColor Gray
}

exit 0



