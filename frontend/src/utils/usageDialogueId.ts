/**
 * Identifiant sous lequel l'historique d'usage LLM range un dialogue.
 *
 * Les appels LLM sont enregistrés avec le nom du dialogue sans extension
 * (`le_juge_mendiant`), alors que l'éditeur de graphe manipule le nom de fichier
 * (`le_juge_mendiant.json`). Interroger les coûts avec l'extension renvoie un
 * dialogue vide : 0 nœud, 0 € — l'onglet COÛT de l'inspecteur n'affichait rien.
 */
export function usageDialogueId(filename: string): string {
  return filename.replace(/\.json$/i, '')
}
