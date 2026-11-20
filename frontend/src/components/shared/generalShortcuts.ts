/**
 * Raccourcis globaux listés par l'aide (`Ctrl+/`) et par l'onglet « Raccourcis » des options.
 *
 * `getAllShortcuts()` ne connaît que les raccourcis des composants montés et ignore les
 * écouteurs posés à la main (`Ctrl+\` dans `Dashboard`) : cette liste garantit qu'ils
 * apparaissent partout. Chaque entrée doit correspondre à un écouteur réellement monté
 * — `Ctrl+E` y figurait alors que seul un composant jamais monté l'enregistrait.
 */
export interface ShortcutHelpEntry {
  key: string
  description: string
}

export const GENERAL_SHORTCUTS: readonly ShortcutHelpEntry[] = [
  { key: 'ctrl+enter', description: 'Générer un dialogue' },
  { key: 'alt+s', description: 'Échanger les personnages (swap)' },
  { key: 'ctrl+k', description: 'Ouvrir la palette de commandes' },
  { key: '/', description: 'Filtrer dans le panneau de gauche' },
  { key: 'ctrl+n', description: 'Nouveau dialogue (réinitialiser)' },
  { key: 'ctrl+,', description: 'Ouvrir les options' },
  { key: 'ctrl+\\', description: 'Entrer / sortir du mode écriture' },
  { key: 'escape', description: 'Fermer les modals/panels' },
  { key: 'ctrl+/', description: "Afficher l'aide des raccourcis" },
  { key: 'ctrl+1', description: 'Naviguer vers Dashboard' },
  { key: 'ctrl+2', description: 'Naviguer vers Dialogues Unity' },
  { key: 'ctrl+3', description: 'Naviguer vers Usage/Statistiques' },
  { key: 'ctrl+4', description: "Naviguer vers l'éditeur de graphe" },
]

/**
 * Raccourcis globaux complétés par ceux des composants montés, dédupliqués par touche
 * (la liste globale l'emporte).
 */
export function collectHelpShortcuts(dynamicShortcuts: readonly ShortcutHelpEntry[]): ShortcutHelpEntry[] {
  const unique = new Map<string, ShortcutHelpEntry>()
  for (const shortcut of [...GENERAL_SHORTCUTS, ...dynamicShortcuts]) {
    if (!unique.has(shortcut.key)) unique.set(shortcut.key, shortcut)
  }
  return Array.from(unique.values())
}
