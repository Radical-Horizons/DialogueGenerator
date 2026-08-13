/**
 * Constantes partagées pour l'application.
 * 
 * IMPORTANT: Ces constantes doivent être synchronisées avec constants.py côté backend.
 */

/**
 * Noms des modèles OpenAI utilisés dans l'application.
 * 
 * Source de vérité unique pour tous les identifiants de modèles côté frontend.
 * Ces constantes doivent correspondre à ModelNames dans constants.py côté backend.
 *
 * Famille GPT-5.6 : Sol = flagship, Terra = équilibre, Luna = volume/coût.
 */
export const MODEL_NAMES = {
  /** GPT-5.6 Sol — flagship */
  GPT_5_6_SOL: 'gpt-5.6-sol',
  /** GPT-5.6 Terra — équilibre intelligence/coût */
  GPT_5_6_TERRA: 'gpt-5.6-terra',
  /** GPT-5.6 Luna — volume / coût */
  GPT_5_6_LUNA: 'gpt-5.6-luna',
  /** Alias API OpenAI gpt-5.6 → Sol */
  GPT_5_6: 'gpt-5.6',
  /** @deprecated Alias → Sol */
  GPT_5_4: 'gpt-5.6-sol',
  /** @deprecated Alias → Terra */
  GPT_5_2: 'gpt-5.6-terra',
  /** @deprecated Alias → Sol */
  GPT_5_2_PRO: 'gpt-5.6-sol',
  /** @deprecated Alias → Sol */
  GPT_5_2_THINKING: 'gpt-5.6-sol',
  /** @deprecated Alias → Luna */
  GPT_5_MINI: 'gpt-5.6-luna',
  /** @deprecated Alias → Luna */
  GPT_5_NANO: 'gpt-5.6-luna',
} as const

/**
 * Anciens slugs API → famille GPT-5.6 (presets, localStorage, draft).
 * Doit correspondre à ``ModelNames.LEGACY_MODEL_ID_MAP`` dans constants.py.
 */
export const LEGACY_MODEL_ID_MAP: Readonly<Record<string, string>> = {
  'gpt-5.4': MODEL_NAMES.GPT_5_6_SOL,
  'gpt-5.2': MODEL_NAMES.GPT_5_6_TERRA,
  'gpt-5.2-pro': MODEL_NAMES.GPT_5_6_SOL,
  'gpt-5.2-thinking': MODEL_NAMES.GPT_5_6_SOL,
  'gpt-5-mini': MODEL_NAMES.GPT_5_6_LUNA,
  'gpt-5-nano': MODEL_NAMES.GPT_5_6_LUNA,
  'gpt-5.6': MODEL_NAMES.GPT_5_6_SOL,
}

/** Mappe un identifiant legacy vers le slug GPT-5.6 courant (miroir Python). */
export function normalizeModelId(modelId: string): string {
  return LEGACY_MODEL_ID_MAP[modelId] ?? modelId
}

/** Modèles avec sélecteur reasoning.effort dans le panneau génération. */
export const REASONING_EFFORT_MODELS = [
  MODEL_NAMES.GPT_5_6_SOL,
  MODEL_NAMES.GPT_5_6_TERRA,
  MODEL_NAMES.GPT_5_6_LUNA,
] as const

/**
 * Modèles frontier : effort none … max (tous les tiers GPT-5.6).
 * Doc : none | low | medium | high | xhigh | max
 */
export const FULL_REASONING_EFFORT_MODELS = [
  MODEL_NAMES.GPT_5_6_SOL,
  MODEL_NAMES.GPT_5_6_TERRA,
  MODEL_NAMES.GPT_5_6_LUNA,
] as const

/**
 * Niveaux de raisonnement, du plus rapide au plus coûteux.
 *
 * Source unique : le sélecteur compact de la barre d'action **et** le panneau
 * « Réglages du modèle » lisent cette liste — deux listes divergentes, c'est
 * l'utilisateur qui voit deux vocabulaires pour le même réglage.
 */
export const REASONING_EFFORT_OPTIONS = [
  { value: 'none', short: 'aucun', label: 'Aucun', hint: 'Latence minimale' },
  { value: 'low', short: 'faible', label: 'Faible', hint: null },
  { value: 'medium', short: 'moyen', label: 'Moyen', hint: 'Équilibré, recommandé' },
  { value: 'high', short: 'élevé', label: 'Élevé', hint: null },
  { value: 'xhigh', short: 'xhigh', label: 'Très élevé', hint: null },
  { value: 'max', short: 'max', label: 'Maximum', hint: "Qualité d'abord" },
] as const

/** Libellé compact d'un niveau de raisonnement (résumés, pastille). */
export const REASONING_EFFORT_SHORT_LABELS: Readonly<Record<string, string>> = {
  ...Object.fromEntries(REASONING_EFFORT_OPTIONS.map((o) => [o.value, o.short])),
  /** Ancien palier OpenAI, encore possible dans un draft ou un preset. */
  minimal: 'minimal',
}

/**
 * Une ligne de description par modèle, pour le sélecteur compact.
 *
 * Reprend les tiers documentés dans `constants.py` (« Sol = flagship,
 * Terra = équilibre, Luna = volume/coût ») — ne pas inventer d'autre promesse
 * ici : c'est le backend qui fait foi sur ce que vaut un modèle.
 */
export const MODEL_TIER_DESCRIPTIONS: Readonly<Record<string, string>> = {
  [MODEL_NAMES.GPT_5_6_SOL]: 'Le plus capable — tâches complexes',
  [MODEL_NAMES.GPT_5_6_TERRA]: 'Équilibre qualité / coût',
  [MODEL_NAMES.GPT_5_6_LUNA]: 'Le plus rapide et le moins cher',
}

/**
 * Modèle par défaut à utiliser.
 * Doit correspondre à Defaults.MODEL_ID dans constants.py.
 */
export const DEFAULT_MODEL = MODEL_NAMES.GPT_5_6_LUNA

/**
 * Cible tactile minimale (HIG / WCAG 2.5.5) — chrome shell & toolbar graphe (Story 17.2 FR119).
 */
export const TOUCH_TARGET_MIN_PX = 44

/**
 * Limites pour les tokens de contexte.
 * 
 * Ces valeurs doivent correspondre à celles définies dans constants.py (Defaults.MAX_CONTEXT_TOKENS, Defaults.MIN_CONTEXT_TOKENS)
 */
export const CONTEXT_TOKENS_LIMITS = {
  /** Minimum autorisé (aligné API max_context_tokens et budget contexte FR20 — plancher sérieux LLM) */
  MIN: 10000,
  /** Maximum autorisé pour le slider et l'API (300K) */
  MAX: 300000,
  /** Pas du slider */
  STEP: 1000,
  /** Valeur par défaut (150K) */
  DEFAULT: 150000,
} as const

/** Optimisation auto du contexte (FR21) — POST /api/v1/context/optimize. */
export const CONTEXT_OPTIMIZE_API_ENABLED = true

/**
 * Limites pour les tokens de completion (génération).
 */
/** Plafond API ``max_completion_tokens`` — aligner ``constants.py`` ``Defaults.MAX_COMPLETION_TOKENS``. */
export const API_MAX_COMPLETION_TOKENS = 128_000

export const COMPLETION_TOKENS_LIMITS = {
  /** Minimum autorisé (5K) */
  MIN: 5000,
  /** Maximum du slider UI (peut être < plafond API) */
  MAX: 64000,
  /** Pas du slider (5K) */
  STEP: 5000,
  /** Valeur par défaut (20K) */
  DEFAULT: 20000,
} as const

/**
 * Timeouts pour les requêtes HTTP (en millisecondes).
 */
export const API_TIMEOUTS = {
  /** Timeout par défaut pour les requêtes API rapides (30 secondes) */
  DEFAULT: 30000,
  /**
   * Lecture/écriture des documents dialogue (JSON volumineux, I/O disque, validation).
   * Évite les faux échecs d’autosave sur graphes lents ou machines chargées.
   */
  DOCUMENT_IO: 120000,
  /**
   * Sync GDD depuis Notion : export massif (workspace entier) ; le client HTTP ne doit pas
   * couper avant le serveur. 6 h — aligner le proxy dev (`vite.config.ts`) sur cette valeur.
   */
  GDD_NOTION_SYNC: 6 * 60 * 60 * 1000,
  /** Export ZIP Markdown (NotebookLM) : lecture disque + sérialisation, peut être volumineux */
  GDD_NOTEBOOKLM_EXPORT: 300000,
  /** Timeout pour les requêtes LLM longues (5 minutes) - génération de dialogues */
  LLM_GENERATION: 300000,
  /** Timeout pour l'annulation d'un job de génération (10 secondes) - Story 0.8 */
  CANCEL_JOB: 10000,
  /** Construction / estimation contexte GDD volumineux. La perf doit rester quasi instantanée côté serveur. */
  CONTEXT_ESTIMATION: 120000,
  /** Lookup tokens précompilés par fiche (cache disque). */
  PRECOMPUTED_ENTITY_TOKENS: 15000,
} as const
