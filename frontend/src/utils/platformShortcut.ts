/**
 * Libellés de raccourcis clavier dépendants de la plateforme.
 *
 * Le chrome affichait « ⌘K » en dur : un symbole Mac sur une machine Windows,
 * et — plus gênant — un raccourci qui n'existait nulle part, puisque
 * `useKeyboardShortcuts` n'écoutait que `ctrlKey`. Cmd+K ne déclenchait donc
 * rien, même sur Mac.
 */

/** Vrai sur macOS / iPadOS, où le modificateur d'usage est Cmd et non Ctrl. */
export function isApplePlatform(): boolean {
  if (typeof navigator === 'undefined') return false
  // `userAgentData.platform` est la voie moderne ; `platform` reste le repli le
  // plus fiable, `userAgent` le dernier recours (iPadOS se déclare « MacIntel »).
  const uaData = (navigator as Navigator & { userAgentData?: { platform?: string } }).userAgentData
  const platform = uaData?.platform ?? navigator.platform ?? ''
  if (platform) return /mac|iphone|ipad|ipod/i.test(platform)
  return /mac|iphone|ipad|ipod/i.test(navigator.userAgent ?? '')
}

const APPLE_SYMBOLS: Record<string, string> = {
  ctrl: '⌘',
  alt: '⌥',
  shift: '⇧',
  meta: '⌘',
}

const PC_LABELS: Record<string, string> = {
  ctrl: 'Ctrl',
  alt: 'Alt',
  shift: 'Maj',
  meta: 'Win',
}

/**
 * Met en forme un raccourci déclaré (« ctrl+k ») pour l'affichage.
 *
 * Sur Apple, `ctrl` s'affiche « ⌘ » — ce qui n'est légitime que parce que
 * `useKeyboardShortcuts` y accepte aussi la touche Cmd (voir `matchesShortcut`).
 * Les deux doivent rester alignés : changer l'un sans l'autre remet un libellé
 * qui ment.
 */
export function formatShortcut(shortcut: string): string {
  const apple = isApplePlatform()
  const parts = shortcut.split('+').map((p) => p.trim().toLowerCase())
  const rendered = parts.map((part) => {
    const modifier = apple ? APPLE_SYMBOLS[part] : PC_LABELS[part]
    if (modifier) return modifier
    if (part === 'enter') return '↵'
    if (part === 'escape') return 'Échap'
    if (part === 'space') return 'Espace'
    return part.length === 1 ? part.toUpperCase() : part
  })
  // Les symboles Apple se collent (⌘K), les libellés PC se séparent (Ctrl+K).
  return apple ? rendered.join('') : rendered.join('+')
}
