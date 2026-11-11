/**
 * Initiales d'un nom de fiche GDD — puces des rails du mode écriture (écran 2c).
 *
 * « Le Cloître Perforé » → « LCP », « Uresaïr » → « UR », « Grish T'vok » → « GT ».
 *
 * L'apostrophe n'est pas un séparateur (« T'vok » est un mot, pas deux) et n'est pas
 * une initiale non plus : « L'Éthérée » → « LÉ », pas « L' ».
 */
export function entityInitials(name: string): string {
  const words = name
    .split(/[\s-]+/)
    .map((w) => Array.from(w.matchAll(/[\p{L}\p{N}]/gu), (m) => m[0]))
    .filter((chars) => chars.length > 0)
  if (words.length === 0) return '?'
  const initials = words.length === 1 ? words[0].slice(0, 2) : words.slice(0, 3).map((w) => w[0])
  return initials.join('').toUpperCase()
}
