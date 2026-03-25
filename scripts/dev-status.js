#!/usr/bin/env node
/**
 * Affiche le statut des services de développement en tableau formaté.
 */
const http = require('http');
const services = require('./dev-services');

/** Même stratégie que dev-services : éviter localhost → ::1 sous Windows. */
function probeUrl(url) {
  try {
    const u = new URL(url);
    if (u.hostname === 'localhost') {
      u.hostname = '127.0.0.1';
    }
    return u.toString();
  } catch {
    return url;
  }
}

// Fonction pour tester la santé d'un service
async function checkHealth(url, timeout = 2000) {
  const target = probeUrl(url);
  return new Promise((resolve) => {
    const req = http.get(target, { timeout }, (res) => {
      res.resume();
      resolve(
        res.statusCode === 200 ||
          res.statusCode === 304 ||
          res.statusCode === 404 ||
          res.statusCode === 503
      );
    });
    
    req.on('error', () => resolve(false));
    req.on('timeout', () => {
      req.destroy();
      resolve(false);
    });
  });
}

// Fonction pour formater le tableau
function formatTable(rows) {
  if (rows.length === 0) {
    return 'Aucun service en cours.';
  }
  
  // Calculer les largeurs de colonnes
  const colWidths = [0, 0, 0, 0, 0];
  rows.forEach(row => {
    row.forEach((cell, i) => {
      colWidths[i] = Math.max(colWidths[i], cell.length);
    });
  });
  
  // Créer le séparateur
  const separator = '─'.repeat(colWidths.reduce((a, b) => a + b, 0) + colWidths.length * 3 + 1);
  
  // Formater les lignes
  const formattedRows = rows.map((row, idx) => {
    const cells = row.map((cell, i) => {
      return cell.padEnd(colWidths[i]);
    });
    return `│ ${cells.join(' │ ')} │`;
  });
  
  // En-tête
  const header = formattedRows[0];
  const headerSeparator = '├' + colWidths.map(w => '─'.repeat(w + 2)).join('┼') + '┤';
  const body = formattedRows.slice(1);
  
  return [
    '┌' + colWidths.map(w => '─'.repeat(w + 2)).join('┬') + '┐',
    header,
    headerSeparator,
    ...body,
    '└' + colWidths.map(w => '─'.repeat(w + 2)).join('┴') + '┘'
  ].join('\n');
}

// Point d'entrée principal
async function main() {
  const status = await services.getStatus();
  
  console.log('\n📊 Statut des services de développement\n');
  
  const rows = [
    ['Service', 'État', 'PID', 'Port', 'URL']
  ];
  
  // Backend
  if (status.backend.running) {
    const health = await checkHealth(`${status.backend.url}/health`);
    const state = health ? '✅ Running' : '⚠️  Unhealthy';
    rows.push([
      'Backend API',
      state,
      status.backend.pid?.toString() || 'N/A',
      status.backend.port?.toString() || 'N/A',
      status.backend.url || 'N/A'
    ]);
  } else {
    rows.push([
      'Backend API',
      '❌ Stopped',
      '-',
      '-',
      '-'
    ]);
  }
  
  // Frontend
  if (status.frontend.running) {
    const health = await checkHealth(status.frontend.url);
    const state = health ? '✅ Running' : '⚠️  Unhealthy';
    rows.push([
      'Frontend',
      state,
      status.frontend.pid?.toString() || 'N/A',
      status.frontend.port?.toString() || 'N/A',
      status.frontend.url || 'N/A'
    ]);
  } else {
    rows.push([
      'Frontend',
      '❌ Stopped',
      '-',
      '-',
      '-'
    ]);
  }
  
  console.log(formatTable(rows));
  console.log('');
  
  // Informations supplémentaires
  if (status.backend.running || status.frontend.running) {
    console.log('💡 Commandes disponibles:');
    if (status.backend.running && status.frontend.running) {
      console.log('   npm run dev:stop  - Arrêter tous les services');
    }
    if (status.backend.running) {
      console.log('   npm run dev:back  - Redémarrer uniquement le backend');
    }
    if (status.frontend.running) {
      console.log('   npm run dev:front - Redémarrer uniquement le frontend');
    }
    console.log('');
  } else {
    console.log('💡 Aucun service en cours. Utilisez:');
    console.log('   npm run dev       - Démarrer backend + frontend');
    console.log('   npm run dev:back  - Démarrer uniquement le backend');
    console.log('   npm run dev:front - Démarrer uniquement le frontend');
    console.log('');
  }
}

main().catch((error) => {
  console.error('❌ Erreur:', error.message);
  process.exit(1);
});
