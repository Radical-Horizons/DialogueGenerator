/**
 * Construction de la hiérarchie d’affichage pour l’arbre des champs de contexte.
 */

/**
 * Pour ``sections._general.<slug>``, l’UI n’affiche pas de dossier ``sections`` / ``_general`` :
 * chaque sous-bloc est une feuille à la racine de l’arbre (chemins API inchangés).
 * Le monolithe ``sections._general`` reste sous ``sections`` → ``_general``.
 */
export function fieldPathTreeHierarchy(path: string): { displayParts: string[]; mapKeys: string[] } {
  const parts = path.split('.')
  if (parts.length >= 3 && parts[0] === 'sections' && parts[1] === '_general') {
    const slug = parts.slice(2).join('.')
    if (slug.length > 0) {
      return {
        displayParts: [slug],
        mapKeys: [path],
      }
    }
  }
  const mapKeys: string[] = []
  let acc = ''
  for (const p of parts) {
    acc = acc ? `${acc}.${p}` : p
    mapKeys.push(acc)
  }
  return { displayParts: parts, mapKeys }
}
