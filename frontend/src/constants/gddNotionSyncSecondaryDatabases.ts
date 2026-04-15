/**
 * Bases Notion (noms ``category_file``) considérées secondaires pour le raccourci UI
 * « Cocher essentiels » — non cochées par ce bouton (l’utilisateur peut les cocher à la main).
 *
 * Aligné sur ``settings.json`` / sources ``kind: database``.
 */
export const GDD_NOTION_SYNC_SECONDARY_DATABASE_FILES: readonly string[] = [
  'Caractéristiques_—_Uresaïr_(FP).json',
  'Assets_visuels.json',
  'Références_visuelles_des_éléments_originaux.json',
  'Musiques.json',
  'Lexique_Musical.json',
  'Guides_musicaux_par_lieux.json',
  'Bibliothèque_de_Prompts.json',
  'Notebook.json',
  'Tests_de_jeu.json',
  'Lentilles_du_Game_Designer.json',
  'Piliers.json',
  'Évaluation_des_aspects_culturels___études.json',
  'Mémoires_des_Personas.json',
]

const SECONDARY_SET = new Set(GDD_NOTION_SYNC_SECONDARY_DATABASE_FILES)

export function isGddNotionSyncSecondaryDatabase(categoryFile: string): boolean {
  return SECONDARY_SET.has(categoryFile)
}
