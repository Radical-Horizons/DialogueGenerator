# Script de vérification avant déploiement
# Vérifie que tout est prêt pour le déploiement
# Usage: .\scripts\deploy_check.ps1
# Ou via npm: npm run deploy:check

Write-Host "=== Vérification de déploiement ===" -ForegroundColor Cyan

$projectRoot = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
Set-Location $projectRoot

# Importer la fonction Get-VenvPython
. (Join-Path $projectRoot "scripts\Get-VenvPython.ps1")

<#
.SYNOPSIS
    Parse un fichier .env minimal (lignes KEY=VAL, commentaires #, guillemets optionnels).
#>
function Read-DotEnvFile {
    param([Parameter(Mandatory)][string]$Path)
    $map = @{}
    if (-not (Test-Path -LiteralPath $Path)) {
        return $map
    }
    foreach ($raw in Get-Content -LiteralPath $Path -Encoding UTF8) {
        $line = $raw.Trim()
        if (-not $line -or $line.StartsWith('#')) {
            continue
        }
        $eq = $line.IndexOf('=')
        if ($eq -lt 1) {
            continue
        }
        $key = $line.Substring(0, $eq).Trim()
        if (-not $key) {
            continue
        }
        $val = $line.Substring($eq + 1).Trim()
        if ($val.Length -ge 2) {
            $dq = $val.StartsWith('"') -and $val.EndsWith('"')
            $sq = $val.StartsWith("'") -and $val.EndsWith("'")
            if ($dq -or $sq) {
                $val = $val.Substring(1, $val.Length - 2)
            }
        }
        $map[$key] = $val
    }
    return $map
}

<#
.SYNOPSIS
    Valeur effective pour le déploiement : shell (Process/User/Machine) puis repli .env, comme load_dotenv côté API.
#>
function Get-DeployCheckEnvValue {
    param(
        [Parameter(Mandatory)][string]$Name,
        [Parameter(Mandatory)][hashtable]$DotEnv
    )
    foreach ($scope in @("Process", "User", "Machine")) {
        $v = [Environment]::GetEnvironmentVariable($Name, $scope)
        if (-not [string]::IsNullOrWhiteSpace($v)) {
            return @{ Value = $v; Source = "shell" }
        }
    }
    if ($DotEnv.ContainsKey($Name) -and -not [string]::IsNullOrWhiteSpace($DotEnv[$Name])) {
        return @{ Value = $DotEnv[$Name]; Source = "dotenv" }
    }
    return @{ Value = $null; Source = $null }
}

$errors = @()
$warnings = @()

# 1. Vérifier que le build frontend existe
Write-Host "`n1. Vérification du build frontend..." -ForegroundColor Cyan
$frontendDist = Join-Path (Join-Path $projectRoot "frontend") "dist"
if (-not (Test-Path $frontendDist)) {
    $errors += "Le dossier frontend/dist n'existe pas. Exécutez d'abord scripts/build_production.ps1"
} else {
    $indexHtml = Join-Path $frontendDist "index.html"
    if (-not (Test-Path $indexHtml)) {
        $errors += "Le fichier frontend/dist/index.html n'existe pas"
    } else {
        Write-Host "  ✓ Build frontend trouvé" -ForegroundColor Green
    }
}

# 2. Vérifier les variables d'environnement nécessaires
Write-Host "`n2. Vérification des variables d'environnement..." -ForegroundColor Cyan
$requiredEnvVars = @("OPENAI_API_KEY", "JWT_SECRET_KEY")
$missingVars = @()
$dotEnvPath = Join-Path $projectRoot ".env"
$dotEnvMap = Read-DotEnvFile -Path $dotEnvPath
if ((Test-Path -LiteralPath $dotEnvPath)) {
    Write-Host "  ℹ Fichier .env trouvé (complète la détection des variables)" -ForegroundColor DarkGray
}

foreach ($var in $requiredEnvVars) {
    $resolved = Get-DeployCheckEnvValue -Name $var -DotEnv $dotEnvMap
    if ($resolved.Value) {
        $via = if ($resolved.Source -eq "dotenv") { " (via fichier .env)" } else { "" }
        Write-Host "  ✓ $var est défini$via" -ForegroundColor Green
    } else {
        $missingVars += $var
    }
}

if ($missingVars.Count -gt 0) {
    $warnings += "Variables d'environnement manquantes: $($missingVars -join ', ')"
    Write-Host "  ⚠ Variables manquantes: $($missingVars -join ', ')" -ForegroundColor Yellow
}

# 3. Vérifier que le venv Python existe
Write-Host "`n3. Vérification du venv Python..." -ForegroundColor Cyan
if (Test-VenvExists -ProjectRoot $projectRoot) {
    Write-Host "  ✓ Venv trouvé" -ForegroundColor Green
    $pythonPath = Get-VenvPython -ProjectRoot $projectRoot -Quiet
} else {
    $warnings += "Le venv n'existe pas. Créez-le avec: npm run setup"
    Write-Host "  ⚠ Venv non trouvé, utilisation de Python global" -ForegroundColor Yellow
    $pythonPath = "python"
}

# 4. Vérifier que Python est disponible
Write-Host "`n4. Vérification de Python..." -ForegroundColor Cyan
$pythonVersion = & $pythonPath --version 2>$null
if (-not $pythonVersion) {
    $errors += "Python n'est pas installé ou pas dans le PATH"
} else {
    Write-Host "  ✓ $pythonVersion" -ForegroundColor Green
}

# 5. Vérifier que les dépendances Python sont installées
Write-Host "`n5. Vérification des dépendances Python..." -ForegroundColor Cyan
try {
    & $pythonPath -c "import fastapi; import uvicorn" 2>$null
    if ($LASTEXITCODE -eq 0) {
        Write-Host "  ✓ Dépendances FastAPI/uvicorn trouvées" -ForegroundColor Green
    } else {
        $errors += "Les dépendances Python (fastapi, uvicorn) ne sont pas installées. Exécutez: npm run setup"
    }
} catch {
    $errors += "Impossible de vérifier les dépendances Python"
}

# 6. Vérifier la structure des fichiers API
Write-Host "`n6. Vérification de la structure API..." -ForegroundColor Cyan
$apiMain = Join-Path (Join-Path $projectRoot "api") "main.py"
if (-not (Test-Path $apiMain)) {
    $errors += "Le fichier api/main.py n'existe pas"
} else {
    Write-Host "  ✓ api/main.py trouvé" -ForegroundColor Green
}

$requiredFiles = @(
    "api/routers/auth.py",
    "api/routers/dialogues.py",
    "api/routers/graph_io.py",
    "api/routers/graph_validation.py",
    "api/routers/context.py",
    "api/routers/config.py"
)

foreach ($file in $requiredFiles) {
    $fullPath = Join-Path $projectRoot $file
    if (-not (Test-Path $fullPath)) {
        $errors += "Fichier manquant: $file"
    }
}

if ($errors.Count -eq 0 -and $requiredFiles.Count -eq 6) {
    Write-Host "  ✓ Tous les fichiers API sont présents" -ForegroundColor Green
}

# 6. Vérifier les fichiers de configuration
Write-Host "`n6. Vérification des fichiers de configuration..." -ForegroundColor Cyan
$configFiles = @(
    "config/llm_config.json",
    "context_config.json"
)

foreach ($file in $configFiles) {
    $fullPath = Join-Path $projectRoot $file
    if (-not (Test-Path $fullPath)) {
        $warnings += "Fichier de configuration manquant: $file (peut être créé dynamiquement)"
    } else {
        Write-Host "  ✓ $file trouvé" -ForegroundColor Green
    }
}

# Résumé
Write-Host "`n=== Résumé ===" -ForegroundColor Cyan

if ($errors.Count -eq 0 -and $warnings.Count -eq 0) {
    Write-Host "✓ Toutes les vérifications ont réussi. Prêt pour le déploiement!" -ForegroundColor Green
    exit 0
}

if ($warnings.Count -gt 0) {
    Write-Host "`n⚠ Avertissements:" -ForegroundColor Yellow
    foreach ($warning in $warnings) {
        Write-Host "  - $warning" -ForegroundColor Yellow
    }
}

if ($errors.Count -gt 0) {
    Write-Host "`n✗ Erreurs:" -ForegroundColor Red
    foreach ($errItem in $errors) {
        Write-Host "  - $errItem" -ForegroundColor Red
    }
    Write-Host "`n✗ Le déploiement ne peut pas être effectué. Corrigez les erreurs ci-dessus." -ForegroundColor Red
    exit 1
}

Write-Host "`n⚠ Des avertissements ont été détectés, mais le déploiement peut continuer." -ForegroundColor Yellow
exit 0

