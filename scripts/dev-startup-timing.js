#!/usr/bin/env node
/**
 * Mesure optionnelle du temps de démarrage `npm run dev` par étapes.
 *
 * Activation : `npm run dev -- --timing` ou variable d'environnement
 * `DEV_STARTUP_TIMING=1` (ou `true`, `yes`).
 */
'use strict';

const { performance } = require('perf_hooks');

/** @type {boolean} */
let enabled = false;
/** @type {number} */
let t0 = 0;
/** @type {number} */
let tPrev = 0;
/** @type {{ label: string; deltaMs: number; totalMs: number }[]} */
const steps = [];

/**
 * Active ou désactive la collecte et réinitialise les compteurs.
 *
 * @param {boolean} on - True pour enregistrer les marqueurs.
 * @returns {void}
 */
function setEnabled(on) {
  enabled = Boolean(on);
  if (enabled) {
    t0 = performance.now();
    tPrev = t0;
    steps.length = 0;
  }
}

/**
 * Indique si la mesure est active.
 *
 * @returns {boolean}
 */
function isEnabled() {
  return enabled;
}

/**
 * Enregistre une étape (durée depuis la précédente + cumul depuis setEnabled).
 *
 * @param {string} label - Libellé de l'étape.
 * @returns {void}
 */
function mark(label) {
  if (!enabled) {
    return;
  }
  const now = performance.now();
  steps.push({
    label,
    deltaMs: now - tPrev,
    totalMs: now - t0,
  });
  tPrev = now;
}

/**
 * Affiche le tableau récapitulatif sur stderr pour ne pas mélanger avec les logs des enfants.
 *
 * @returns {void}
 */
function printReport() {
  if (!enabled || steps.length === 0) {
    return;
  }
  const width = Math.max(...steps.map((s) => s.label.length), 24);
  console.error('\n⏱️  Démarrage dev — temps par étape (ms):');
  for (const s of steps) {
    const delta = s.deltaMs.toFixed(0).padStart(6);
    const total = s.totalMs.toFixed(0).padStart(7);
    console.error(`   ${s.label.padEnd(width)}  +${delta} ms   (cumul ${total} ms)`);
  }
  console.error('');
}

module.exports = {
  setEnabled,
  isEnabled,
  mark,
  printReport,
};
