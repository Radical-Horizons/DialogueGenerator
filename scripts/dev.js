#!/usr/bin/env node
/**
 * Point d'entrée principal pour le développement.
 * Délègue la gestion des services à dev-services.js.
 */
const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');
const services = require('./dev-services');
const { venvExists } = require('./getPythonPath');

// Parse des arguments
const args = process.argv.slice(2);
const shouldClearCache = args.includes('--clear-cache') || args.includes('-c');
const backendOnly = args.includes('--backend') || args.includes('--back');
const frontendOnly = args.includes('--frontend') || args.includes('--front');
const stopOnly = args.includes('--stop');
const fastStartup =
  args.includes('--fast') || process.env.DEV_FAST_STARTUP === '1';
if (fastStartup) {
  process.env.SKIP_STARTUP_CONTEXT_VALIDATION = 'true';
  process.env.SKIP_STARTUP_LOG_CLEANUP = 'true';
}

// Parse log level flags
let logLevel = null;
if (args.includes('--debug') || args.includes('-d')) {
  logLevel = 'DEBUG';
} else if (args.includes('--verbose') || args.includes('-v')) {
  logLevel = 'INFO';
} else if (args.includes('--quiet') || args.includes('-q')) {
  logLevel = 'WARNING';
} else {
  // Chercher --log-level=VALUE ou --log-level VALUE
  const logLevelIndex = args.findIndex(arg => arg.startsWith('--log-level'));
  if (logLevelIndex !== -1) {
    const arg = args[logLevelIndex];
    if (arg.includes('=')) {
      logLevel = arg.split('=')[1].toUpperCase();
    } else if (args[logLevelIndex + 1]) {
      logLevel = args[logLevelIndex + 1].toUpperCase();
    }
  }
}

// Valider le niveau de log
if (logLevel && !['DEBUG', 'INFO', 'WARNING', 'ERROR', 'CRITICAL'].includes(logLevel)) {
  console.error(`❌ Niveau de log invalide: ${logLevel}. Valeurs acceptées: DEBUG, INFO, WARNING, ERROR, CRITICAL`);
  process.exit(1);
}

// Exporter pour dev-services.js
if (logLevel) {
  process.env.LOG_CONSOLE_LEVEL = logLevel;
}

// Vérifier que Node.js et Python sont disponibles
function checkCommand(command, errorMsg) {
  return new Promise((resolve) => {
    const proc = spawn(command, ['--version'], { shell: true, stdio: 'ignore' });
    proc.on('close', (code) => {
      if (code !== 0) {
        console.error(`❌ ${errorMsg}`);
        process.exit(1);
      }
      resolve();
    });
  });
}

// Fonction pour nettoyer le cache Vite
async function clearViteCache() {
  return new Promise((resolve) => {
    const viteCachePath = path.join(__dirname, '..', 'frontend', 'node_modules', '.vite');
    const distPath = path.join(__dirname, '..', 'frontend', 'dist');
    
    const pathsToClean = [];
    if (fs.existsSync(viteCachePath)) {
      pathsToClean.push(viteCachePath);
    }
    if (fs.existsSync(distPath)) {
      pathsToClean.push(distPath);
    }
    
    if (pathsToClean.length === 0) {
      console.log('ℹ️  Cache déjà propre, pas de nettoyage nécessaire.\n');
      resolve();
      return;
    }
    
    console.log('🧹 Suppression du cache Vite...');
    
    // Utiliser PowerShell pour supprimer récursivement (plus fiable sur Windows)
    const cleanScript = path.join(__dirname, 'clear-vite-cache.ps1');
    if (fs.existsSync(cleanScript)) {
      const cleanProc = spawn('powershell', ['-ExecutionPolicy', 'Bypass', '-File', cleanScript], {
        stdio: 'inherit',
        shell: true
      });
      cleanProc.on('close', (code) => {
        if (code === 0) {
          console.log('✅ Cache nettoyé avec succès\n');
        } else {
          console.log('⚠️  Nettoyage du cache terminé avec des avertissements\n');
        }
        resolve();
      });
      cleanProc.on('error', (err) => {
        console.log(`⚠️  Erreur lors du nettoyage: ${err.message}`);
        console.log('⚠️  Continuation sans nettoyage...\n');
        resolve();
      });
    } else {
      // Fallback: suppression manuelle
      let cleaned = 0;
      pathsToClean.forEach((p) => {
        try {
          fs.rmSync(p, { recursive: true, force: true });
          console.log(`✅ Supprimé: ${path.basename(p)}`);
          cleaned++;
        } catch (err) {
          console.log(`⚠️  Impossible de supprimer ${p}: ${err.message}`);
        }
      });
      if (cleaned > 0) {
        console.log('✅ Cache nettoyé\n');
      }
      resolve();
    }
  });
}

// Fonction pour trouver Chrome sur Windows
function findChromePath() {
  const possiblePaths = [
    process.env.LOCALAPPDATA + '\\Google\\Chrome\\Application\\chrome.exe',
    process.env.PROGRAMFILES + '\\Google\\Chrome\\Application\\chrome.exe',
    process.env['PROGRAMFILES(X86)'] + '\\Google\\Chrome\\Application\\chrome.exe',
  ];
  
  for (const chromePath of possiblePaths) {
    if (fs.existsSync(chromePath)) {
      return chromePath;
    }
  }
  
  return null;
}

// Fonction pour ouvrir le navigateur
function openBrowser(url) {
  try {
    if (process.platform === 'win32') {
      const chromePath = findChromePath();
      if (chromePath) {
        spawn('"' + chromePath + '"', [url], { shell: true, stdio: 'ignore' });
      } else {
        try {
          spawn('start', ['chrome', url], { shell: true, stdio: 'ignore' });
        } catch (err) {
          spawn('start', [url], { shell: true, stdio: 'ignore' });
          console.log(`⚠️  Chrome non trouvé, ouverture du navigateur par défaut.`);
        }
      }
    } else if (process.platform === 'darwin') {
      spawn('open', ['-a', 'Google Chrome', url], { shell: false, stdio: 'ignore' });
    } else {
      spawn('google-chrome', [url], { shell: true, stdio: 'ignore' });
    }
  } catch (err) {
    console.log(`⚠️  Impossible d'ouvrir Chrome automatiquement. Ouvrez manuellement: ${url}`);
  }
}

// Fonction pour afficher le statut
function displayStatus(status) {
  const apiPort = parseInt(process.env.API_PORT || '4243', 10);
  const frontendPort = parseInt(process.env.FRONTEND_PORT || '3000', 10);
  
  console.log('\n📊 Statut des services:\n');
  console.log(`   Backend API:  ${status.backend.running ? '✅ Running' : '❌ Stopped'}`);
  if (status.backend.running) {
    console.log(`     PID: ${status.backend.pid}`);
    console.log(`     URL: http://localhost:${status.backend.port}`);
    console.log(`     Docs: http://localhost:${status.backend.port}/api/docs`);
  }
  console.log(`\n   Frontend:     ${status.frontend.running ? '✅ Running' : '❌ Stopped'}`);
  if (status.frontend.running) {
    console.log(`     PID: ${status.frontend.pid}`);
    console.log(`     URL: http://localhost:${status.frontend.port}`);
  }
  console.log('');
}

// Commande: Arrêter tous les services
async function handleStop() {
  console.log('🛑 Arrêt de tous les services...\n');
  await services.stopAll();
  console.log('✅ Tous les services ont été arrêtés.\n');
  process.exit(0);
}

// Commande: Démarrer uniquement le backend
async function handleBackendOnly() {
  await services.acquireLock();
  
  // Enregistrer le cleanup IMMÉDIATEMENT après l'acquisition du lock
  services.registerCleanup(async () => {
    await services.stopBackend();
    await services.releaseLock();
  });
  
  const apiPort = parseInt(process.env.API_PORT || '4243', 10);
  
  console.log(`\n📦 Démarrage du backend uniquement...\n`);
  if (fastStartup) {
    console.log(
      '   ⚡ Mode --fast : pas de validate_all_configs ni nettoyage logs au startup API (hors production).\n'
    );
  }
  console.log(`   Backend API:  http://localhost:${apiPort}`);
  console.log(`   API Docs:     http://localhost:${apiPort}/api/docs\n`);
  
  try {
    await services.startBackend(apiPort);
    const status = await services.getStatus();
    displayStatus(status);
    console.log('✅ Backend démarré. Utilisez Ctrl+C pour arrêter.\n');
  } catch (error) {
    console.error(`❌ Erreur: ${error.message}\n`);
    // Le cleanup est déjà enregistré, il sera appelé automatiquement
    await services.stopBackend();
    await services.releaseLock();
    process.exit(1);
  }
}

// Commande: Démarrer uniquement le frontend
async function handleFrontendOnly() {
  await services.acquireLock();
  
  // Enregistrer le cleanup IMMÉDIATEMENT après l'acquisition du lock
  services.registerCleanup(async () => {
    await services.stopFrontend();
    await services.releaseLock();
  });
  
  const frontendPort = parseInt(process.env.FRONTEND_PORT || '3000', 10);
  const frontendUrl = `http://localhost:${frontendPort}`;
  
  console.log(`\n📦 Démarrage du frontend uniquement...\n`);
  console.log(`   Frontend:     ${frontendUrl}\n`);
  
  try {
    await services.startFrontend(frontendPort);
    const status = await services.getStatus();
    displayStatus(status);
    console.log('✅ Frontend démarré. Utilisez Ctrl+C pour arrêter.\n');
    openBrowser(frontendUrl);
  } catch (error) {
    console.error(`❌ Erreur: ${error.message}\n`);
    // Le cleanup est déjà enregistré, il sera appelé automatiquement
    await services.stopFrontend();
    await services.releaseLock();
    process.exit(1);
  }
}

// Commande: Démarrer backend + frontend
async function handleAll() {
  await services.acquireLock();
  
  // Enregistrer le cleanup IMMÉDIATEMENT après l'acquisition du lock
  services.registerCleanup(async () => {
    await services.stopAll();
  });
  
  const apiPort = parseInt(process.env.API_PORT || '4243', 10);
  const frontendPort = parseInt(process.env.FRONTEND_PORT || '3000', 10);
  const frontendUrl = `http://localhost:${frontendPort}`;
  
  console.log('\n📦 Démarrage des serveurs...\n');
  if (fastStartup) {
    console.log(
      '   ⚡ Mode --fast : pas de validate_all_configs ni nettoyage logs au startup API (hors production).\n'
    );
  }
  console.log(`   Backend API:  http://localhost:${apiPort}`);
  console.log(`   Frontend:     ${frontendUrl}`);
  console.log(`   API Docs:     http://localhost:${apiPort}/api/docs\n`);
  
  try {
    // Démarrer le backend
    await services.startBackend(apiPort);
    
    // Démarrer le frontend
    await services.startFrontend(frontendPort);
    
    // Afficher le statut
    const status = await services.getStatus();
    displayStatus(status);
    
    console.log('📡 HMR (Hot Module Replacement) activé');
    console.log('   Les modifications de fichiers seront automatiquement reflétées dans le navigateur.');
    console.log('   Si les changements ne sont pas visibles:');
    console.log('   - Vérifiez la console du navigateur (F12) pour les erreurs');
    console.log('   - Vérifiez que le WebSocket HMR est connecté (onglet Network > WS)');
    console.log('   - Utilisez \'npm run dev:clean\' pour forcer un rebuild complet\n');
    console.log('🌐 Ouverture du navigateur...\n');
    
    openBrowser(frontendUrl);
  } catch (error) {
    console.error(`❌ Erreur: ${error.message}\n`);
    // Le cleanup est déjà enregistré, il sera appelé automatiquement
    await services.stopAll();
    process.exit(1);
  }
}

// Point d'entrée principal
async function main() {
  // Vérifier que le venv existe (warning si absent)
  const projectRoot = path.join(__dirname, '..');
  if (!venvExists(projectRoot)) {
    console.warn('⚠️  Venv non trouvé. Créez-le avec: npm run setup');
    console.warn('   Le système utilisera Python global en attendant.\n');
  }
  
  // Vérifications rapides
  await checkCommand('python', 'Python n\'est pas installé ou pas dans le PATH');
  await checkCommand('node', 'Node.js n\'est pas installé ou pas dans le PATH');
  
  // Nettoyer le cache si demandé
  if (shouldClearCache) {
    await clearViteCache();
  }
  
  // Vérifier que frontend/node_modules existe
  const frontendNodeModules = path.join(__dirname, '..', 'frontend', 'node_modules');
  if (!fs.existsSync(frontendNodeModules)) {
    console.log('⚠️  Installation des dépendances frontend...');
    const npmInstall = spawn('npm', ['install'], {
      cwd: path.join(__dirname, '..', 'frontend'),
      stdio: 'inherit',
      shell: true
    });
    npmInstall.on('close', (code) => {
      if (code !== 0) {
        console.error('❌ Échec de l\'installation des dépendances frontend');
        process.exit(1);
      }
      runCommand();
    });
  } else {
    runCommand();
  }
}

function runCommand() {
  if (stopOnly) {
    handleStop();
  } else if (backendOnly) {
    handleBackendOnly();
  } else if (frontendOnly) {
    handleFrontendOnly();
  } else {
    // Par défaut: démarrer les deux
    handleAll();
  }
}

main();
