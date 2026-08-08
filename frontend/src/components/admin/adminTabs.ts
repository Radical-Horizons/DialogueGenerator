/**
 * Identifiants d'onglets admin et résolution du paramètre d'URL `tab`.
 *
 * Séparé de `AdminPanel.tsx` : un module qui exporte à la fois un composant et
 * des constantes casse le Fast Refresh de Vite (`react-refresh/only-export-components`).
 */

export const ADMIN_TAB_IDS = ['users', 'llm-models', 'audit-logs', 'benchmark'] as const
export type AdminTabId = (typeof ADMIN_TAB_IDS)[number]

export const DEFAULT_ADMIN_TAB: AdminTabId = 'users'

/**
 * Normalise le paramètre d'URL `tab` vers un onglet admin valide.
 */
export function resolveAdminTabId(raw: string | null): AdminTabId {
  if (raw && (ADMIN_TAB_IDS as readonly string[]).includes(raw)) {
    return raw as AdminTabId
  }
  return DEFAULT_ADMIN_TAB
}
