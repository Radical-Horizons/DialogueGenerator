#!/usr/bin/env node
/**
 * Module de gestion des services de développement (backend/frontend).
 * Gère le kill d'arbre, lockfile, kill-port, et les services.
 */
const { spawn, exec } = require('child_process');
const path = require('path');
const fs = require('fs');
const http = require('http');
const { promisify } = require('util');

const execAsync = promisify(exec);

// Import de getPythonPath pour le venv
const getPythonPath = require('./getPythonPath');
const devStartupTiming = require('./dev-startup-timing');

// Chemins
const LOCK_FILE = path.join(__dirname, '..', '.dev', '.dev.lock');
const PROJECT_ROOT = path.join(__dirname, '..');

/** Hôte pour les sondes HTTP (éviter `localhost` → ::1 sous Windows quand l’app n’écoute qu’en IPv4). */
const DEV_LOOPBACK_HOST = '127.0.0.1';

// État global des services
let backendProcess = null;
let frontendProcess = null;
let cleanupRegistered = false;
let cleanupFn = null;

// ============================================================================
// Fonctions utilitaires (réutilisées de dev.js)
// ============================================================================

async function processExists(pid) {
  if (process.platform === 'win32') {
    try {
      const { stdout } = await execAsync(`tasklist /FI "PID eq ${pid}" /FO CSV /NH`);
      if (stdout && stdout.trim() && !stdout.includes('aucune tâche') && !stdout.includes('no tasks')) {
        const lines = stdout.trim().split('\n').filter(line => line.trim());
        for (const line of lines) {
          const pidMatch = line.match(/,"(\d+)",/);
          if (pidMatch && parseInt(pidMatch[1], 10) === pid) {
            return true;
          }
        }
      }
      return false;
    } catch (error) {
      return false;
    }
  } else {
    // Unix: vérifier si le processus existe
    try {
      process.kill(pid, 0); // Signal 0 ne tue pas, juste vérifie
      return true;
    } catch (error) {
      return false;
    }
  }
}

async function isPortInUse(port) {
  return new Promise((resolve) => {
    const server = http.createServer();
    server.listen(port, '127.0.0.1', () => {
      server.once('close', () => resolve(false));
      server.close();
    });
    server.on('error', (err) => {
      if (err.code === 'EADDRINUSE' || err.code === 'EACCES') {
        resolve(true);
      } else {
        resolve(false);
      }
    });
    setTimeout(() => {
      server.removeAllListeners();
      server.close();
      resolve(false);
    }, 1000);
  });
}

function waitForBackend(port, maxAttempts = 90, delay = 1000) {
  return new Promise((resolve, reject) => {
    let attempts = 0;

    const check = () => {
      attempts++;
      const req = http.get(`http://${DEV_LOOPBACK_HOST}:${port}/health`, (res) => {
        res.resume();
        // 200 = OK ; 503 = API vivante mais /health « unhealthy » (storage, etc.) — on laisse le dev démarrer.
        if (res.statusCode === 200 || res.statusCode === 503) {
          resolve();
        } else if (attempts >= maxAttempts) {
          reject(new Error(`Le backend n'a pas répondu correctement après ${maxAttempts} tentatives (HTTP ${res.statusCode})`));
        } else {
          setTimeout(check, delay);
        }
      });

      req.on('error', () => {
        if (attempts >= maxAttempts) {
          reject(
            new Error(
              `Le backend n'a pas démarré après ${maxAttempts} tentatives (connexion refusée sur http://${DEV_LOOPBACK_HOST}:${port}/health — vérifier IPv4 / pare-feu / import Python)`
            )
          );
        } else {
          setTimeout(check, delay);
        }
      });

      req.setTimeout(15000, () => {
        req.destroy();
        if (attempts >= maxAttempts) {
          reject(new Error(`Le backend n'a pas démarré après ${maxAttempts} tentatives (timeout HTTP)`));
        } else {
          setTimeout(check, delay);
        }
      });
    };

    check();
  });
}

function waitForFrontend(port, maxAttempts = 45, delay = 500) {
  return new Promise((resolve, reject) => {
    let attempts = 0;

    const check = () => {
      attempts++;
      const req = http.get(`http://${DEV_LOOPBACK_HOST}:${port}`, (res) => {
        res.resume();
        if (res.statusCode === 200 || res.statusCode === 304 || res.statusCode === 404) {
          resolve();
        } else if (attempts >= maxAttempts) {
          reject(new Error(`Le frontend n'a pas répondu après ${maxAttempts} tentatives (status: ${res.statusCode})`));
        } else {
          setTimeout(check, delay);
        }
      });

      req.on('error', (err) => {
        if (attempts >= maxAttempts) {
          reject(new Error(`Le frontend n'a pas démarré après ${maxAttempts} tentatives: ${err.message}`));
        } else {
          setTimeout(check, delay);
        }
      });

      req.setTimeout(5000, () => {
        req.destroy();
        if (attempts >= maxAttempts) {
          reject(new Error(`Le frontend n'a pas démarré après ${maxAttempts} tentatives (timeout)`));
        } else {
          setTimeout(check, delay);
        }
      });
    };

    setTimeout(() => check(), 500);
  });
}

// ============================================================================
// Kill d'arbre robuste
// ============================================================================

async function killProcessTree(pid) {
  if (!pid) return;
  
  if (process.platform === 'win32') {
    // Windows : taskkill avec /T (tree kill)
    try {
      await execAsync(`taskkill /F /T /PID ${pid}`);
      return true;
    } catch (error) {
      // Le processus peut déjà être mort
      return false;
    }
  } else {
    // Unix : tuer l'arbre de processus avec pkill
    try {
      // D'abord tuer les processus enfants avec pkill
      try {
        await execAsync(`pkill -TERM -P ${pid} 2>/dev/null`);
        await new Promise(resolve => setTimeout(resolve, 1000));
        await execAsync(`pkill -KILL -P ${pid} 2>/dev/null`);
      } catch (e) {
        // Ignorer si pas de processus enfants
      }
      
      // Puis tuer le processus principal
      try {
        await execAsync(`kill -TERM ${pid}`);
        await new Promise(resolve => setTimeout(resolve, 2000));
        // Si toujours vivant, force kill
        try {
          await execAsync(`kill -KILL ${pid}`);
        } catch (e2) {
          // Ignorer si déjà mort
        }
      } catch (e) {
        // Ignorer si processus déjà mort
      }
      
      return true;
    } catch (error) {
      return false;
    }
  }
}

// ============================================================================
// Kill-port ciblé
// ============================================================================

async function killPort(port) {
  // Uniquement pour les ports de dev (3000, 4243)
  const allowedPorts = [3000, 4243];
  if (!allowedPorts.includes(port)) {
    return false;
  }
  
  if (process.platform === 'win32') {
    // Windows : netstat + taskkill
    try {
      const { stdout } = await execAsync(`netstat -ano | findstr :${port} | findstr LISTENING`);
      const lines = stdout.trim().split('\n').filter(l => l.trim());
      const pids = new Set();
      
      for (const line of lines) {
        const parts = line.trim().split(/\s+/);
        const pid = parts[parts.length - 1];
        if (pid && !isNaN(pid)) {
          pids.add(parseInt(pid, 10));
        }
      }
      
      // Tuer chaque PID trouvé avec kill d'arbre récursif
      let killed = false;
      for (const pid of pids) {
        if (await processExists(pid)) {
          try {
            await execAsync(`taskkill /F /T /PID ${pid}`);
            killed = true;
          } catch (error) {
            // Ignorer les erreurs
          }
        }
      }
      
      // Attendre libération du port
      if (killed) {
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
      return killed;
    } catch (error) {
      // Port probablement libre
      return false;
    }
  } else {
    // Unix : utiliser lsof + kill
    try {
      const { stdout } = await execAsync(`lsof -ti:${port}`);
      const pids = stdout.trim().split('\n').filter(p => p && !isNaN(p));
      
      // Tuer récursivement avec pkill pour Unix
      for (const pid of pids) {
        try {
          // Essayer d'abord avec pkill pour tuer l'arbre
          await execAsync(`pkill -9 -P ${pid} 2>/dev/null`);
          // Puis tuer le processus principal
          await execAsync(`kill -9 ${pid}`);
        } catch (error) {
          // Ignorer
        }
      }
      
      if (pids.length > 0) {
        await new Promise(resolve => setTimeout(resolve, 1000));
        return true;
      }
      return false;
    } catch (error) {
      return false;
    }
  }
}

// ============================================================================
// Lockfile avec stale recovery
// ============================================================================

async function acquireLock() {
  // Créer .dev/ si n'existe pas
  const devDir = path.dirname(LOCK_FILE);
  if (!fs.existsSync(devDir)) {
    fs.mkdirSync(devDir, { recursive: true });
  }
  
  // Vérifier si lock existe (avec retry pour éviter race condition)
  let retries = 3;
  while (retries > 0) {
    if (fs.existsSync(LOCK_FILE)) {
      try {
        const lockContent = fs.readFileSync(LOCK_FILE, 'utf-8');
        const lockData = JSON.parse(lockContent);
        const pid = lockData.pid;
        
        // Stale recovery : vérifier si processus existe
        if (await processExists(pid)) {
          console.error(`❌ Une instance de dev est déjà en cours (PID: ${pid})`);
          console.error(`   Arrêtez-la avec: npm run dev:stop`);
          process.exit(1);
        } else {
          // Processus mort, lock stale
          console.log(`⚠️  Lock stale détecté (PID ${pid} n'existe plus), nettoyage...`);
          try {
            fs.unlinkSync(LOCK_FILE);
          } catch (e) {
            // Ignorer si déjà supprimé par une autre instance
          }
        }
      } catch (error) {
        // Lock corrompu, supprimer
        console.log(`⚠️  Lock corrompu, nettoyage...`);
        try {
          fs.unlinkSync(LOCK_FILE);
        } catch (e) {
          // Ignorer
        }
      }
    }
    
    // Créer nouveau lock de manière atomique
    const tempLockFile = LOCK_FILE + '.tmp.' + process.pid;
    const lockData = {
      pid: process.pid,
      timestamp: Date.now(),
      backend: null,
      frontend: null
    };
    
    try {
      // Écrire dans un fichier temporaire
      fs.writeFileSync(tempLockFile, JSON.stringify(lockData, null, 2));
      
      // Renommer atomiquement (atomique sur Windows et Unix)
      if (process.platform === 'win32') {
        // Sur Windows, renommer peut échouer si le fichier existe
        // Essayer de supprimer d'abord si existe
        if (fs.existsSync(LOCK_FILE)) {
          try {
            fs.unlinkSync(LOCK_FILE);
          } catch (e) {
            // Ignorer
          }
        }
        fs.renameSync(tempLockFile, LOCK_FILE);
      } else {
        // Sur Unix, rename est atomique
        fs.renameSync(tempLockFile, LOCK_FILE);
      }
      
      // Vérifier que le lock a bien été créé avec notre PID
      const verifyLock = readLock();
      if (verifyLock && verifyLock.pid === process.pid) {
        devStartupTiming.mark('lock_acquired');
        return; // Succès
      } else {
        // Race condition : une autre instance a créé le lock entre temps
        retries--;
        if (retries > 0) {
          await new Promise(resolve => setTimeout(resolve, 100));
          continue;
        } else {
          console.error(`❌ Impossible d'acquérir le lock après plusieurs tentatives`);
          process.exit(1);
        }
      }
    } catch (error) {
      // Nettoyer le fichier temporaire en cas d'erreur
      try {
        if (fs.existsSync(tempLockFile)) {
          fs.unlinkSync(tempLockFile);
        }
      } catch (e) {
        // Ignorer
      }
      
      retries--;
      if (retries > 0) {
        await new Promise(resolve => setTimeout(resolve, 100));
        continue;
      } else {
        console.error(`❌ Erreur lors de la création du lock: ${error.message}`);
        process.exit(1);
      }
    }
  }
}

async function releaseLock() {
  if (fs.existsSync(LOCK_FILE)) {
    try {
      fs.unlinkSync(LOCK_FILE);
    } catch (error) {
      // Ignorer les erreurs
    }
  }
}

function updateLock(updates) {
  if (!fs.existsSync(LOCK_FILE)) return;
  
  try {
    const lockContent = fs.readFileSync(LOCK_FILE, 'utf-8');
    const lockData = JSON.parse(lockContent);
    Object.assign(lockData, updates);
    fs.writeFileSync(LOCK_FILE, JSON.stringify(lockData, null, 2));
  } catch (error) {
    // Ignorer les erreurs
  }
}

function readLock() {
  if (!fs.existsSync(LOCK_FILE)) {
    return null;
  }
  
  try {
    const lockContent = fs.readFileSync(LOCK_FILE, 'utf-8');
    return JSON.parse(lockContent);
  } catch (error) {
    return null;
  }
}

// ============================================================================
// Gestion des services
// ============================================================================

async function startBackend(port = 4243) {
  // Vérifier si déjà vivant
  const lock = readLock();
  if (lock && lock.backend && lock.backend.pid) {
    if (await processExists(lock.backend.pid)) {
      devStartupTiming.mark('backend_reused_existing');
      console.log(`ℹ️  Backend déjà en cours (PID: ${lock.backend.pid})`);
      backendProcess = { pid: lock.backend.pid, killed: false };
      return backendProcess;
    }
  }

  // Kill-port avant démarrage
  console.log(`🔍 Nettoyage du port ${port}...`);
  await killPort(port);
  devStartupTiming.mark('backend_port_cleared');

  // Démarrer le backend
  console.log(`🔄 Démarrage du backend sur le port ${port}...`);
  
  // Valeurs par défaut: garder `npm run dev` lisible, même si l'environnement a LOG_LEVEL=DEBUG.
  // Les flags `--debug/--verbose/--log-level` peuvent définir LOG_CONSOLE_LEVEL via scripts/dev.js.
  // LOG_FILE_LEVEL reste plus bas par défaut pour conserver des logs utiles sans explosion.
  const defaultConsoleLevel = 'WARNING';
  const defaultFileLevel = 'INFO';
  const consoleLevel = process.env.LOG_CONSOLE_LEVEL || defaultConsoleLevel;
  const fileLevel = process.env.LOG_FILE_LEVEL || defaultFileLevel;

  const spawnOptions = {
    cwd: PROJECT_ROOT,
    stdio: 'inherit',
    shell: true,
    env: Object.assign({}, process.env, {
      // Respecter RELOAD=false depuis l'environnement (mesure perf / prod locale)
      RELOAD: process.env.RELOAD ?? 'true',
      API_PORT: port.toString(),
      // Forcer un niveau console lisible par défaut (override d'un LOG_LEVEL=DEBUG global)
      LOG_CONSOLE_LEVEL: consoleLevel,
      // Garder les logs fichiers utiles (et consultables) sans trop de verbosité
      LOG_FILE_LEVEL: fileLevel,
    })
  };
  
  // Ne pas utiliser detached: true car cela rend le processus orphelin
  // Le kill d'arbre avec pkill -P fonctionnera correctement
  
  // Obtenir le chemin Python du venv
  const pythonPath = getPythonPath(PROJECT_ROOT);
  
  backendProcess = spawn(pythonPath, ['-m', 'api.main'], spawnOptions);
  devStartupTiming.mark('backend_process_spawned');

  // Mettre à jour le lock
  updateLock({
    backend: {
      pid: backendProcess.pid,
      port: port,
      started: Date.now()
    }
  });

  // Attendre que le backend soit prêt
  try {
    await waitForBackend(port);
    devStartupTiming.mark('backend_ready');
    console.log(`✅ Backend démarré et prêt (PID: ${backendProcess.pid})`);
    return backendProcess;
  } catch (error) {
    console.error(`❌ Erreur lors du démarrage du backend: ${error.message}`);
    throw error;
  }
}

async function startFrontend(port = 3000) {
  // Vérifier si déjà vivant
  const lock = readLock();
  if (lock && lock.frontend && lock.frontend.pid) {
    if (await processExists(lock.frontend.pid)) {
      devStartupTiming.mark('frontend_reused_existing');
      console.log(`ℹ️  Frontend déjà en cours (PID: ${lock.frontend.pid})`);
      frontendProcess = { pid: lock.frontend.pid, killed: false };
      return frontendProcess;
    }
  }

  // Kill-port avant démarrage
  console.log(`🔍 Nettoyage du port ${port}...`);
  await killPort(port);
  devStartupTiming.mark('frontend_port_cleared');

  // Démarrer le frontend
  console.log(`🔄 Démarrage du frontend sur le port ${port}...`);
  
  const spawnOptions = {
    cwd: path.join(PROJECT_ROOT, 'frontend'),
    stdio: 'inherit',
    shell: true,
    env: Object.assign({}, process.env)
  };
  
  // Ne pas utiliser detached: true car cela rend le processus orphelin
  // Le kill d'arbre avec pkill -P fonctionnera correctement
  frontendProcess = spawn('npm', ['run', 'dev'], spawnOptions);
  devStartupTiming.mark('frontend_npm_spawned');

  // Mettre à jour le lock
  updateLock({
    frontend: {
      pid: frontendProcess.pid,
      port: port,
      started: Date.now()
    }
  });

  // Attendre que le frontend soit prêt
  try {
    await waitForFrontend(port);
    devStartupTiming.mark('frontend_ready');
    console.log(`✅ Frontend démarré et prêt (PID: ${frontendProcess.pid})`);
    return frontendProcess;
  } catch (error) {
    console.error(`❌ Erreur lors du démarrage du frontend: ${error.message}`);
    throw error;
  }
}

async function stopBackend() {
  const lock = readLock();
  let pid = null;
  
  if (backendProcess && backendProcess.pid) {
    pid = backendProcess.pid;
  } else if (lock && lock.backend && lock.backend.pid) {
    pid = lock.backend.pid;
  }
  
  if (pid) {
    console.log(`🛑 Arrêt du backend (PID: ${pid})...`);
    await killProcessTree(pid);
    updateLock({ backend: null });
    backendProcess = null;
    console.log(`✅ Backend arrêté`);
  }
}

async function stopFrontend() {
  const lock = readLock();
  let pid = null;
  
  if (frontendProcess && frontendProcess.pid) {
    pid = frontendProcess.pid;
  } else if (lock && lock.frontend && lock.frontend.pid) {
    pid = lock.frontend.pid;
  }
  
  if (pid) {
    console.log(`🛑 Arrêt du frontend (PID: ${pid})...`);
    await killProcessTree(pid);
    updateLock({ frontend: null });
    frontendProcess = null;
    console.log(`✅ Frontend arrêté`);
  }
}

async function stopAll() {
  await stopBackend();
  await stopFrontend();
  await releaseLock();
}

// ============================================================================
// Gestion des signaux robuste
// ============================================================================

function registerCleanup(cleanupFunction) {
  if (cleanupRegistered) return;
  cleanupRegistered = true;
  cleanupFn = cleanupFunction;
  
  let isCleaningUp = false;
  
  const cleanup = async () => {
    if (isCleaningUp) return;
    isCleaningUp = true;
    
    try {
      if (cleanupFn) {
        await cleanupFn();
      }
    } catch (err) {
      console.error('Erreur lors du cleanup:', err);
    }
    
    // Sortir proprement après le cleanup
    setTimeout(() => {
      process.exit(0);
    }, 500);
  };
  
  process.on('SIGINT', async () => {
    console.log('\n🛑 Arrêt demandé (Ctrl+C)...');
    await cleanup();
  });
  
  process.on('SIGTERM', async () => {
    await cleanup();
  });
  
  process.on('exit', () => {
    // Cleanup synchrone si nécessaire
    if (cleanupFn && !isCleaningUp) {
      // Ne pas appeler async dans exit, juste nettoyer le lock
      try {
        if (fs.existsSync(LOCK_FILE)) {
          fs.unlinkSync(LOCK_FILE);
        }
      } catch (e) {
        // Ignorer
      }
    }
  });
  
  process.on('uncaughtException', async (err) => {
    console.error('Uncaught exception:', err);
    await cleanup();
  });
}

// ============================================================================
// Statut des services
// ============================================================================

async function getStatus() {
  const lock = readLock();
  const status = {
    backend: { running: false, pid: null, port: null, url: null },
    frontend: { running: false, pid: null, port: null, url: null }
  };
  
  if (lock) {
    // Backend
    if (lock.backend && lock.backend.pid) {
      const exists = await processExists(lock.backend.pid);
      status.backend = {
        running: exists,
        pid: lock.backend.pid,
        port: lock.backend.port || 4243,
        url: `http://localhost:${lock.backend.port || 4243}`
      };
    }
    
    // Frontend
    if (lock.frontend && lock.frontend.pid) {
      const exists = await processExists(lock.frontend.pid);
      status.frontend = {
        running: exists,
        pid: lock.frontend.pid,
        port: lock.frontend.port || 3000,
        url: `http://localhost:${lock.frontend.port || 3000}`
      };
    }
  }
  
  return status;
}

// ============================================================================
// Exports
// ============================================================================

module.exports = {
  killProcessTree,
  acquireLock,
  releaseLock,
  updateLock,
  readLock,
  killPort,
  killProcessTree,
  startBackend,
  startFrontend,
  stopBackend,
  stopFrontend,
  stopAll,
  registerCleanup,
  getStatus,
  waitForBackend,
  waitForFrontend
};
