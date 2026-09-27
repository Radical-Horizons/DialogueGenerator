/**
 * Formatage des nombres affichés — charte du design system : **fr-FR**, symbole après le
 * montant, virgule décimale, séparateur de milliers tel qu'`Intl` le produit (U+202F), et
 * rendu en `redesignFont.mono` côté appelant.
 *
 * ⚠️ La devise se lit sur le **champ**, jamais sur l'écran : le backend calcule en USD
 * (`llm_pricing_service`) et n'expose en euros que les champs suffixés `_eur`. Budget,
 * quota et historique d'usage sont en dollars.
 */

export type CurrencyCode = 'USD' | 'EUR'

export interface FormatCurrencyOptions {
  minimumFractionDigits?: number
  maximumFractionDigits?: number
  /** Préfixe « ≈ » : le montant est une estimation, pas une dépense constatée. */
  approx?: boolean
}

/** Rendu d'une valeur absente ou non numérique. */
export const EMPTY_NUMBER = '—'

const LOCALE = 'fr-FR'
const APPROX_PREFIX = '≈ '

function isDisplayable(value: number | null | undefined): value is number {
  return typeof value === 'number' && Number.isFinite(value)
}

/** `-0` s'affiche « -0,00 » : la somme avec 0 le ramène à `+0`. */
function withoutNegativeZero(value: number): number {
  return value + 0
}

/**
 * Montant en devise : « 0,18 $ », « 1 234,50 $ », « ≈ 0,0042 € ».
 *
 * `narrowSymbol` est obligatoire : sans lui fr-FR écrit « 0,18 $US ».
 */
export function formatCurrency(
  value: number | null | undefined,
  currency: CurrencyCode,
  options: FormatCurrencyOptions = {}
): string {
  if (!isDisplayable(value)) return EMPTY_NUMBER
  const { maximumFractionDigits, approx = false } = options
  // Un maximum seul sous le minimum par défaut de la devise (2) lève une RangeError
  // sur les moteurs antérieurs à ES2023.
  const minimumFractionDigits =
    options.minimumFractionDigits ??
    (maximumFractionDigits !== undefined ? Math.min(2, maximumFractionDigits) : undefined)
  const formatted = new Intl.NumberFormat(LOCALE, {
    style: 'currency',
    currency,
    currencyDisplay: 'narrowSymbol',
    minimumFractionDigits,
    maximumFractionDigits,
  }).format(withoutNegativeZero(value))
  return approx ? `${APPROX_PREFIX}${formatted}` : formatted
}

/**
 * Coût d'un dialogue, d'un nœud ou d'un budget : deux décimales, sauf sous le centime où
 * deux décimales écriraient « 0,00 » — on garde alors deux chiffres significatifs
 * (« 0,0042 € », « 0,00077 € »).
 */
export function formatCost(
  value: number | null | undefined,
  currency: CurrencyCode,
  options: Pick<FormatCurrencyOptions, 'approx'> = {}
): string {
  if (!isDisplayable(value)) return EMPTY_NUMBER
  const magnitude = Math.abs(value)
  if (magnitude === 0 || magnitude >= 0.01) return formatCurrency(value, currency, options)
  const formatted = new Intl.NumberFormat(LOCALE, {
    style: 'currency',
    currency,
    currencyDisplay: 'narrowSymbol',
    maximumSignificantDigits: 2,
  }).format(value)
  return options.approx ? `${APPROX_PREFIX}${formatted}` : formatted
}

/**
 * Coût d'un appel ou d'un nœud dans une liste de logs : quatre décimales fixes pour que la
 * colonne s'aligne, six sous 0,0001 où quatre écriraient « 0,0000 ».
 */
export function formatCostDetail(value: number | null | undefined, currency: CurrencyCode): string {
  if (!isDisplayable(value)) return EMPTY_NUMBER
  const digits = value !== 0 && Math.abs(value) < 0.0001 ? 6 : 4
  return formatCurrency(value, currency, {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  })
}

/** Nombre nu (tokens, compteurs) : « 1 234 », « 21,2 ». */
export function formatNumber(value: number | null | undefined, fractionDigits = 0): string {
  if (!isDisplayable(value)) return EMPTY_NUMBER
  return new Intl.NumberFormat(LOCALE, {
    minimumFractionDigits: fractionDigits,
    maximumFractionDigits: fractionDigits,
  }).format(withoutNegativeZero(value))
}

/**
 * Pourcentage **déjà exprimé sur 100** (82.3, pas 0.823) : « 82,3 % ».
 * `signed` écrit le signe des écarts : « +12,3 % », « -95,7 % ».
 */
export function formatPercent(
  percentage: number | null | undefined,
  fractionDigits = 1,
  { signed = false }: { signed?: boolean } = {}
): string {
  if (!isDisplayable(percentage)) return EMPTY_NUMBER
  return new Intl.NumberFormat(LOCALE, {
    style: 'percent',
    minimumFractionDigits: fractionDigits,
    maximumFractionDigits: fractionDigits,
    signDisplay: signed ? 'exceptZero' : 'auto',
  }).format(withoutNegativeZero(percentage) / 100)
}

/**
 * Durée en millisecondes : « 850 ms » sous la seconde, « 21,2 s » au-delà.
 * `fractionDigits` règle la précision des secondes.
 */
export function formatDurationMs(ms: number | null | undefined, fractionDigits = 1): string {
  if (!isDisplayable(ms)) return EMPTY_NUMBER
  const roundedMs = Math.round(ms)
  if (Math.abs(roundedMs) < 1000) {
    return new Intl.NumberFormat(LOCALE, {
      style: 'unit',
      unit: 'millisecond',
      maximumFractionDigits: 0,
    }).format(withoutNegativeZero(roundedMs))
  }
  return new Intl.NumberFormat(LOCALE, {
    style: 'unit',
    unit: 'second',
    minimumFractionDigits: fractionDigits,
    maximumFractionDigits: fractionDigits,
  }).format(ms / 1000)
}
