import type { UnityDialogueMetadata } from '../types/api'

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

/**
 * Dérive un documentId stable depuis un titre libre (création / 1ʳᵉ génération).
 * Retourne une chaîne vide si le titre ne contient aucun caractère utilisable.
 */
export function titleToDocumentId(title: string): string {
  return title
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^\w\s-]/g, '')
    .trim()
    .replace(/[-\s]+/g, '_')
    .toLowerCase()
}

/**
 * Identifiant d'un dialogue tel que l'API le connaît : le nom du fichier sans
 * `.json`, casse et accents intacts. C'est ce qui part vers le serveur
 * (collections, export, validation) — le disque de prod est sensible à la casse.
 */
export function dialogueDocumentId(filename: string): string {
  return filename.replace(/\.json$/i, '')
}

/**
 * Clé de **comparaison** entre stem, filename et metadata API (casse et forme
 * Unicode neutralisées). Ne jamais l'envoyer à l'API : `dialogueDocumentId`.
 */
export function normalizeDialogueFilenameKey(filename: string): string {
  return dialogueDocumentId(filename).normalize('NFC').toLowerCase()
}

/** Titre utilisateur cohérent entre liste, combobox et panneau détails. */
export function getDialogueDisplayTitle(
  dialogue: Pick<UnityDialogueMetadata, 'filename' | 'title'>
): string {
  return dialogue.title?.trim() || formatDialogueTitle(dialogue.filename)
}
