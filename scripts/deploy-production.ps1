# Script de déploiement en production
# Build le frontend et upload sur le serveur
# Usage: .\scripts\deploy-production.ps1 [-SkipBuild] ... [-GitUseAutostash]  (defaut: fetch + reset --hard origin/main sur le VPS)

param(
    [switch]$SkipBuild = $false,
    [switch]$SkipRestart = $false,
    [switch]$SkipNginx = $false,
    [switch]$SkipGitPull = $false,
    [switch]$SkipPipInstall = $false,
    [switch]$GitUseAutostash = $false,
    [string]$ServerHost = "137.74.115.203",
    [string]$ServerUser = "ubuntu",
    [string]$ServerPath = "/opt/DialogueGeneratorV2",
    [string]$HealthCheckHost = "demo.auto-diffusion.net",
    [string]$GitRemoteBranch = "main"
)

$ErrorActionPreference = "Stop"

# Définir l'encodage de sortie en UTF-8
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
$OutputEncoding = [System.Text.Encoding]::UTF8

# Couleurs pour la sortie
function Write-Info { Write-Host "[INFO] $args" -ForegroundColor Cyan }
function Write-Success { Write-Host "[SUCCESS] $args" -ForegroundColor Green }
function Write-Warning { Write-Host "[WARNING] $args" -ForegroundColor Yellow }
function Write-Error { Write-Host "[ERROR] $args" -ForegroundColor Red }

# Git/progress sur stderr declenche NativeCommandError avec $ErrorActionPreference Stop — on neutralise pendant la capture.
function Invoke-SshRemoteCapture {
    param(
        [Parameter(Mandatory)][string]$SshTarget,
        [Parameter(Mandatory)][string]$RemoteShellCommand
    )
    $prevEap = $ErrorActionPreference
    $ErrorActionPreference = 'Continue'
    try {
        $raw = & ssh.exe -o BatchMode=yes $SshTarget $RemoteShellCommand 2>&1
        $lines = @(
            foreach ($o in @($raw)) {
                if ($null -eq $o) { continue }
                if ($o -is [System.Management.Automation.ErrorRecord]) { $o.ToString() } else { "$o" }
            }
        )
        [pscustomobject]@{
            Text     = $lines -join "`n"
            ExitCode = $LASTEXITCODE
        }
    } finally {
        $ErrorActionPreference = $prevEap
    }
}

function Invoke-SshRemote {
    param(
        [Parameter(Mandatory)][string]$SshTarget,
        [Parameter(Mandatory)][string]$RemoteShellCommand
    )
    $prevEap = $ErrorActionPreference
    $ErrorActionPreference = 'Continue'
    try {
        & ssh.exe -o BatchMode=yes $SshTarget $RemoteShellCommand
        return $LASTEXITCODE
    } finally {
        $ErrorActionPreference = $prevEap
    }
}

Write-Host "`n=== Déploiement en Production ===" -ForegroundColor Cyan
Write-Info "Serveur: ${ServerUser}@${ServerHost}"
Write-Info "Chemin serveur: $ServerPath"
Write-Host ""

# Vérifier que nous sommes dans le bon répertoire
$projectRoot = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
Set-Location $projectRoot
Write-Info "Répertoire projet: $projectRoot"

# Vérifier que SCP est disponible (OpenSSH)
$scpAvailable = Get-Command scp -ErrorAction SilentlyContinue
if (-not $scpAvailable) {
    Write-Error "SCP n'est pas disponible. Installez OpenSSH Client (Add-WindowsCapability -Online -Name OpenSSH.Client~~~~0.0.1.0)"
    exit 1
}

# Vérifier que SSH est disponible
$sshAvailable = Get-Command ssh -ErrorAction SilentlyContinue
if (-not $sshAvailable) {
    Write-Error "SSH n'est pas disponible. Installez OpenSSH Client"
    exit 1
}

# Vérifier la connexion SSH (test rapide)
Write-Info "Vérification de la connexion SSH..."
$sshTestCommand = "ssh -o ConnectTimeout=5 -o BatchMode=yes ${ServerUser}@${ServerHost} 'echo OK' 2>&1"
$sshTestResult = Invoke-Expression $sshTestCommand 2>&1
if ($LASTEXITCODE -ne 0 -or $sshTestResult -notmatch "OK") {
    Write-Warning "La connexion SSH nécessite une authentification (mot de passe ou clé SSH)"
    Write-Info "Assurez-vous que votre clé SSH est configurée ou que vous avez accès au mot de passe"
    Write-Info "Pour configurer une clé SSH: ssh-copy-id ${ServerUser}@${ServerHost}"
}

# Étape 1: Build du frontend
if (-not $SkipBuild) {
    Write-Host "`n=== Étape 1: Build du frontend ===" -ForegroundColor Cyan
    
    # Vérifier que Node.js est installé
    $nodeVersion = node --version 2>$null
    if (-not $nodeVersion) {
        Write-Error "Node.js n'est pas installé ou pas dans le PATH"
        exit 1
    }
    Write-Info "Node.js version: $nodeVersion"
    
    # Aller dans le dossier frontend
    $frontendPath = Join-Path $projectRoot "frontend"
    if (-not (Test-Path $frontendPath)) {
        Write-Error "Le dossier frontend n'existe pas"
        exit 1
    }
    
    Set-Location $frontendPath
    
    # Installer les dépendances si nécessaire
    Write-Info "Vérification des dépendances..."
    npm install --silent
    
    if ($LASTEXITCODE -ne 0) {
        Write-Error "Échec de l'installation des dépendances"
        exit 1
    }
    
    # Build
    Write-Info "Build du frontend en cours..."
    npm run build
    
    if ($LASTEXITCODE -ne 0) {
        Write-Error "Échec du build"
        exit 1
    }
    
    # Vérifier que le dossier dist existe
    $distPath = Join-Path $frontendPath "dist"
    if (-not (Test-Path $distPath)) {
        Write-Error "Le dossier dist n'a pas été créé"
        exit 1
    }
    
    Write-Success "Build terminé avec succès"
    Write-Info "Fichiers dans: $distPath"
} else {
    Write-Warning 'Build ignoré (--SkipBuild)'
    $frontendPath = Join-Path $projectRoot "frontend"
    $distPath = Join-Path $frontendPath "dist"
    
    if (-not (Test-Path $distPath)) {
        Write-Error "Le dossier dist n'existe pas. Lancez le build d'abord."
        exit 1
    }
}

# Étape 2: Upload du build sur le serveur
Write-Host "`n=== Étape 2: Upload du build sur le serveur ===" -ForegroundColor Cyan

# Créer un dossier temporaire pour l'upload
$tempDir = Join-Path $env:TEMP "dialogue-generator-deploy-$(Get-Date -Format 'yyyyMMdd-HHmmss')"
New-Item -ItemType Directory -Path $tempDir -Force | Out-Null
Write-Info "Dossier temporaire: $tempDir"

# Copier le contenu de dist dans le dossier temporaire
Write-Info "Préparation des fichiers pour l'upload..."
Copy-Item -Path "$distPath\*" -Destination $tempDir -Recurse -Force

# Compter les fichiers
$fileCount = (Get-ChildItem -Path $tempDir -Recurse -File).Count
Write-Info "$fileCount fichiers à uploader"

# Upload via SCP
Write-Info "Upload en cours sur ${ServerUser}@${ServerHost}:${ServerPath}/frontend/dist/..."
Write-Warning "Cela peut prendre quelques minutes..."

$scpCommand = "scp -r `"$tempDir\*`" ${ServerUser}@${ServerHost}:${ServerPath}/frontend/dist/"
Invoke-Expression $scpCommand

if ($LASTEXITCODE -ne 0) {
    Write-Error "Échec de l'upload"
    Remove-Item -Path $tempDir -Recurse -Force -ErrorAction SilentlyContinue
    exit 1
}

Write-Success "Upload terminé avec succès"

# Nettoyer le dossier temporaire
Remove-Item -Path $tempDir -Recurse -Force -ErrorAction SilentlyContinue

# Étape 3: Synchronisation git sur le serveur (optionnel)
if (-not $SkipGitPull) {
    Write-Host "`n=== Étape 3: Synchronisation git (serveur) ===" -ForegroundColor Cyan

    $gitExit = 1
    $gitText = ""

    if ($GitUseAutostash) {
        Write-Info 'Mode autostash: git pull --autostash (peut echouer si conflits avec data/ modifie sur le VPS)'
        $remotePull = "cd ${ServerPath} && git pull --autostash"
        $pullR = Invoke-SshRemoteCapture -SshTarget "${ServerUser}@${ServerHost}" -RemoteShellCommand $remotePull
        $gitText = $pullR.Text
        Write-Host $gitText
        $gitExit = $pullR.ExitCode
        if ($gitText -match "Applying autostash resulted in conflicts") {
            Write-Warning "Conflit autostash. Relancez sans -GitUseAutostash (reset hard) ou reparez en SSH."
        }
    } else {
        Write-Info "Mode defaut: git fetch + reset --hard origin/$GitRemoteBranch (le code sur le VPS = GitHub, fini les blocages data/GDD)"
        $remoteSync = "cd ${ServerPath} && git fetch origin && git reset --hard origin/${GitRemoteBranch}"
        $syncR = Invoke-SshRemoteCapture -SshTarget "${ServerUser}@${ServerHost}" -RemoteShellCommand $remoteSync
        $gitText = $syncR.Text
        Write-Host $gitText
        $gitExit = $syncR.ExitCode
    }

    if ($gitExit -ne 0) {
        Write-Warning "Echec git sur le serveur (code $gitExit). Verifiez SSH et le depot ${ServerPath}."
    } else {
        Write-Success "Depot serveur aligne sur origin/${GitRemoteBranch}"
    }

    if ($gitExit -eq 0 -and -not $SkipPipInstall) {
        Write-Host "`n=== Étape 3b: Dependances Python (venv serveur) ===" -ForegroundColor Cyan
        Write-Info "pip install -r requirements.txt ..."
        $pipRemote = "cd ${ServerPath} && .venv/bin/pip install -r requirements.txt -q"
        $pipExit = Invoke-SshRemote -SshTarget "${ServerUser}@${ServerHost}" -RemoteShellCommand $pipRemote
        if ($pipExit -ne 0) {
            Write-Warning ('pip install a echoue en SSH: cd ' + $ServerPath + ' ; .venv/bin/pip install -r requirements.txt')
        } else {
            Write-Success "Dependances Python a jour"
        }
    }
} else {
    Write-Warning 'Synchronisation git serveur ignoree (--SkipGitPull)'
}

# Étape 4: Mise à jour de la config Nginx (optionnel)
if (-not $SkipNginx) {
    Write-Host "`n=== Étape 4: Mise à jour de la config Nginx ===" -ForegroundColor Cyan
    
    Write-Info "Vérification de la config Nginx actuelle..."
    
    # Motif complet entre quotes côté shell distant (évite grep: off: No such file)
    $sshTarget = "${ServerUser}@${ServerHost}"
    $remoteNginxCheck = 'grep -Fq ''proxy_buffering off'' /etc/nginx/sites-available/dialogue-generator && echo OK || echo MISSING'
    $nginxR = Invoke-SshRemoteCapture -SshTarget $sshTarget -RemoteShellCommand $remoteNginxCheck
    $nginxLines = $nginxR.Text -split "`n"
    $nginxStatus = ($nginxLines | Select-Object -Last 1).ToString().Trim()
    
    if ($nginxStatus -eq "OK") {
        Write-Success "Config Nginx déjà à jour (SSE support présent)"
    } else {
        Write-Warning "Config Nginx nécessite une mise à jour pour le support SSE"
        Write-Info "Mise à jour de la config Nginx..."
        
        # Créer un script temporaire pour mettre à jour Nginx
        # Utiliser un here-string avec @' pour éviter l'interprétation PowerShell
        $nginxUpdateScript = @'
#!/bin/bash
set -e

NGINX_CONFIG="/etc/nginx/sites-available/dialogue-generator"
BACKUP_CONFIG="${NGINX_CONFIG}.backup.$(date +%Y%m%d-%H%M%S)"

# Backup de la config actuelle
sudo cp "${NGINX_CONFIG}" "${BACKUP_CONFIG}"
echo "Backup créé: ${BACKUP_CONFIG}"

# Vérifier si la section location /api existe
if ! grep -q "location /api" "${NGINX_CONFIG}"; then
    echo "ERREUR: Section location /api introuvable dans la config"
    exit 1
fi

# Utiliser awk pour insérer les paramètres SSE après "Connection "upgrade";"
# Si proxy_buffering off n'existe pas déjà
if ! grep -q "proxy_buffering off" "${NGINX_CONFIG}"; then
    sudo awk '
    /Connection "upgrade";/ {
        print
        print ""
        print "        # Server-Sent Events (SSE) support"
        print "        proxy_buffering off;"
        print "        proxy_cache off;"
        print "        proxy_read_timeout 300s;"
        print "        proxy_connect_timeout 60s;"
        print "        proxy_send_timeout 300s;"
        print ""
        print "        # Headers pour SSE"
        print "        add_header Cache-Control \"no-cache\";"
        print "        add_header X-Accel-Buffering \"no\";"
        next
    }
    { print }
    ' "${NGINX_CONFIG}" > "${NGINX_CONFIG}.tmp" && sudo mv "${NGINX_CONFIG}.tmp" "${NGINX_CONFIG}"
    echo "Paramètres SSE ajoutés à la config"
else
    echo "Paramètres SSE déjà présents, pas de modification nécessaire"
fi

# Tester la config
if sudo nginx -t; then
    echo "Config Nginx valide, rechargement..."
    sudo systemctl reload nginx
    echo "Nginx rechargé avec succès"
else
    echo "ERREUR: Config Nginx invalide, restauration du backup"
    sudo cp "${BACKUP_CONFIG}" "${NGINX_CONFIG}"
    exit 1
fi
'@
        
        # Écrire le script temporaire
        $tempScript = Join-Path $env:TEMP "update-nginx-$(Get-Date -Format 'yyyyMMdd-HHmmss').sh"
        $nginxUpdateScript | Out-File -FilePath $tempScript -Encoding UTF8 -NoNewline
        
        # Upload et exécuter le script
        Write-Info "Upload du script de mise à jour Nginx..."
        $scpScriptCommand = "scp `"$tempScript`" ${ServerUser}@${ServerHost}:/tmp/update-nginx.sh"
        Invoke-Expression $scpScriptCommand
        
        if ($LASTEXITCODE -eq 0) {
            Write-Info "Exécution du script de mise à jour..."
            $execScriptCommand = "ssh ${ServerUser}@${ServerHost} 'chmod +x /tmp/update-nginx.sh && bash /tmp/update-nginx.sh && rm /tmp/update-nginx.sh'"
            Invoke-Expression $execScriptCommand
            
            if ($LASTEXITCODE -eq 0) {
                Write-Success "Config Nginx mise à jour avec succès"
            } else {
                Write-Warning "Échec de la mise à jour Nginx (peut nécessiter une intervention manuelle)"
            }
        } else {
            Write-Warning "Échec de l'upload du script Nginx"
        }
        
        # Nettoyer le script temporaire local
        Remove-Item -Path $tempScript -Force -ErrorAction SilentlyContinue
    }
} else {
    Write-Warning 'Mise à jour Nginx ignorée (--SkipNginx)'
}

# Étape 5: Redémarrer le service (optionnel)
if (-not $SkipRestart) {
    Write-Host "`n=== Étape 5: Redémarrage du service ===" -ForegroundColor Cyan
    
    Write-Info "Redémarrage du service dialogue-generator..."
    $sshCommand = "ssh ${ServerUser}@${ServerHost} 'sudo systemctl restart dialogue-generator'"
    Invoke-Expression $sshCommand
    
    if ($LASTEXITCODE -ne 0) {
        Write-Warning "Échec du redémarrage du service (peut nécessiter une intervention manuelle)"
    } else {
        Write-Success "Service redémarré avec succès"
        
        # Attendre un peu pour que le service démarre
        Start-Sleep -Seconds 2
        
        # Vérifier le statut
        Write-Info "Vérification du statut du service..."
        $statusCommand = "ssh ${ServerUser}@${ServerHost} 'sudo systemctl status dialogue-generator --no-pager -l'"
        Invoke-Expression $statusCommand
    }
} else {
    Write-Warning 'Redémarrage ignoré (--SkipRestart)'
    Write-Info "N'oubliez pas de redémarrer le service manuellement:"
    Write-Info "  ssh ${ServerUser}@${ServerHost}"
    Write-Info "  sudo systemctl restart dialogue-generator"
}

# Étape 6: Vérification
Write-Host "`n=== Étape 6: Vérification ===" -ForegroundColor Cyan

Write-Info "Vérification du health check (IP + en-tête Host si configuré)..."
$healthPaths = @("/health", "/api/v1/healthcheck")
$healthVerified = $false
foreach ($path in $healthPaths) {
    $uri = "http://${ServerHost}${path}"
    $headerVariants = [System.Collections.ArrayList]@()
    if ($HealthCheckHost) {
        [void]$headerVariants.Add(@{ Name = "Host: $HealthCheckHost"; Headers = @{ Host = $HealthCheckHost } })
    }
    [void]$headerVariants.Add(@{ Name = "sans Host"; Headers = $null })
    foreach ($hv in $headerVariants) {
        try {
            $req = @{
                Uri             = $uri
                Method          = "Get"
                TimeoutSec      = 10
                UseBasicParsing = $true
                ErrorAction     = "Stop"
            }
            if ($null -ne $hv.Headers) {
                $req["Headers"] = $hv.Headers
            }
            $response = Invoke-WebRequest @req
            if ($response.StatusCode -eq 200) {
                try {
                    $health = $response.Content | ConvertFrom-Json
                    if ($health.status -eq "healthy") {
                        Write-Success "Health check: OK ($($hv.Name) | $path | status: $($health.status))"
                    } else {
                        Write-Warning "Health check: Degraded ($($hv.Name) | $path | status: $($health.status))"
                    }
                } catch {
                    Write-Success "Health check: HTTP 200 ($($hv.Name) | $path | body not JSON)"
                }
                $healthVerified = $true
                break
            }
        } catch {
            continue
        }
    }
    if ($healthVerified) { break }
}
if (-not $healthVerified) {
    Write-Warning "Aucun health check HTTP 200 sur $healthPaths (essayez -HealthCheckHost ou vérifiez Nginx)."
}

# Résumé
Write-Host "`n=== Déploiement terminé ===" -ForegroundColor Green
Write-Info "Frontend déployé sur: http://${ServerHost}"
Write-Info "API disponible sur: http://${ServerHost}/api"
Write-Info "Documentation API: http://${ServerHost}/api/docs"
Write-Host ""
