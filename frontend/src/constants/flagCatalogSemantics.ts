/** Valeurs filtres catalogue alignées API `/api/v1/mechanics/flags` (Story 9.1). */
export const FLAG_SEMANTIC_FILTERS = ['bool', 'compteur', 'enum'] as const
export type FlagSemanticFilterOption = (typeof FLAG_SEMANTIC_FILTERS)[number]

export const FLAG_SCOPE_FILTERS = ['conversationnel', 'mécanique'] as const
export type FlagScopeFilterOption = (typeof FLAG_SCOPE_FILTERS)[number]
