/**
 * Initiales d'un nom de fiche GDD — puces des rails du mode écriture (écran 2c).
 *
 * « Le Cloître Perforé » → « LCP », « Uresaïr » → « UR », « Grish T'vok » → « GT ».
 *
 * L'apostrophe n'est pas un séparateur : « T'vok » est un mot, pas deux.
 */
export function entityInitials(name: string): string {
  const words = name
    .split(/[\s-]+/)
    .map((w) => w.trim())
    .filter((w) => w.length > 0 && /[\p{L}\p{N}]/u.test(w))
  if (words.length === 0) return '?'
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase()
  return words
    .slice(0, 3)
    .map((w) => w[0])
    .join('')
    .toUpperCase()
}
