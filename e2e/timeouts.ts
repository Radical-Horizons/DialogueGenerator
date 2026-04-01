/**
 * Constantes de temporisation E2E (millisecondes).
 *
 * Centraliser ici les durées plutôt que des littéraux dans chaque spec : un seul endroit
 * pour ajuster quand la CI ou le réseau LLM change. Les noms décrivent l’**usage**, pas la valeur.
 */

/** Attentes d’assertion / waitFor (UI, réseau, graphe). */
export const E2E_MS = {
  /** Sonde optionnelle (page login, contrôle rapide). */
  probe: 2_000,
  /** Micro (menu, clic conditionnel). */
  micro: 1_000,
  /** Transition très courte. */
  tiny: 1_500,
  /** Modale / champ court. */
  control: 3_000,
  /** Bouton secondaire, item menu. */
  action: 4_000,
  /** Délai court (checkbox, liste). */
  short: 5_000,
  /** Dropdown, contrôle intermédiaire. */
  medium: 8_000,
  /** Dashboard, onglets, navigation standard. */
  ui: 10_000,
  /** Champ éditeur nœud, combobox graphe. */
  graphField: 15_000,
  /** Nœud canvas, graphe visible. */
  graphCanvas: 20_000,
  /** Redirection après login. */
  authRedirect: 20_000,
  /** Loader graphe / node content (perf). */
  graphLoad: 25_000,
  /** GET document + disparition « Chargement du graphe ». */
  documentLoad: 30_000,
  /** Panneau graph-editor monté. */
  graphPanel: 30_000,
  /** Génération / attente texte succès locale. */
  graphFlow: 30_000,
  /** Recherche dialogue + item liste dashboard. */
  dashboardList: 45_000,
  /** Poll nombre de nœuds. */
  pollNodes: 45_000,
  /** Poll arêtes. */
  pollEdges: 15_000,
  /** Menu génération / SSE. */
  generationMenu: 60_000,
  /** Nœud pending après succès LLM. */
  llmPendingNode: 60_000,
  /** Premier nœud React Flow après flux dashboard lourd. */
  graphFirstNode: 90_000,
  /** Seuil perf chargement document (assertion p95). */
  perfMaxLoad: 90_000,
  /** PUT save document (waitForResponse). */
  savePut: 90_000,
  /** Toast succès / erreur court. */
  toast: 4_000,
  /** Toast ou message UI un peu plus long. */
  toastUi: 15_000,
  /** Fermeture modale lente (ex. sauvegarde preset). */
  modalLong: 40_000,
  /** Récupération session / reload. */
  sessionRecovery: 12_000,
  /** Réponse toast / texte succès génération LLM. */
  llmSuccessToast: 180_000,
  /** Stabilisation entre tests (afterEach). */
  afterEachSettle: 2_000,
} as const

/** `test.setTimeout` / `beforeAll` au niveau describe. */
export const E2E_TEST_TIMEOUT_MS = {
  /** Specs graphe édition / export courants. */
  graphHeavy: 120_000,
  /** Save graphe + interactions longues. */
  saveHeavy: 180_000,
  /** Suite @e2e-llm complète. */
  llmSuite: 360_000,
  /** API / preflight léger. */
  apiMedium: 60_000,
  /** Coûts / dashboard. */
  cost: 90_000,
  /** beforeAll health + budget LLM. */
  healthBeforeAll: 120_000,
  /** Preflight avec ajustement budget. */
  preflightLong: 120_000,
} as const
