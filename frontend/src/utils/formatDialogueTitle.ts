/**
 * Formate un nom de fichier de dialogue Unity en titre lisible
 * (`my_dialogue.json` → `My dialogue`).
 *
 * Source unique pour `UnityDialogueItem`, `UnityDialogueDetails`
 * et `DialogueCombobox` (Story 17.7).
 */
export function formatDialogueTitle(filename: string): string {
  const formatted = filename.replace(/\.json$/, '').replace(/_/g, ' ')
  return formatted.charAt(0).toUpperCase() + formatted.slice(1)
}
