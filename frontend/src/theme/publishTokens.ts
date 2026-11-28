/**
 * Publie les tokens en variables CSS (`--dg-<famille>-<clé>`) et construit les références
 * `var(--dg-…)` que lisent les composants.
 */
import { nightTokens } from './tokenValues'

type TokenValue = string | number

/** Familles de tokens : une valeur seule (`nodeShadow`) ou un groupe de clés. */
export type TokenSet = Record<string, TokenValue | Readonly<Record<string, TokenValue>>>

const STYLE_ID = 'dg-tokens'

/** Un thème de plus = une entrée de plus, sous `:root[data-theme="…"]`. */
const THEMES: Record<string, TokenSet> = { ':root': nightTokens }

const kebab = (name: string): string => name.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`)

export function tokenVarName(family: string, key?: string): string {
  return ['--dg', family, key].filter((part) => part !== undefined).map(kebab).join('-')
}

export function tokenRef(family: string, key?: string): string {
  return `var(${tokenVarName(family, key)})`
}

/** Mêmes clés que les valeurs, chacune renvoyant à sa variable. */
export function tokenRefs<T extends object>(family: string, values: T): { readonly [K in keyof T]: string } {
  return Object.fromEntries(
    Object.keys(values).map((key) => [key, tokenRef(family, key)]),
  ) as { readonly [K in keyof T]: string }
}

const declaration = (name: string, value: TokenValue): string =>
  `  ${name}: ${typeof value === 'number' ? `${value}px` : value};`

export function buildTokenSheet(themes: Record<string, TokenSet> = THEMES): string {
  return Object.entries(themes)
    .map(([selector, tokens]) => {
      const lines = Object.entries(tokens).flatMap(([family, entry]) =>
        typeof entry === 'object'
          ? Object.entries(entry).map(([key, value]) => declaration(tokenVarName(family, key), value))
          : [declaration(tokenVarName(family), entry)],
      )
      return `${selector} {\n${lines.join('\n')}\n}`
    })
    .join('\n')
}

type TokenDocument = Document & { dgTokenSheet?: CSSStyleSheet }

/**
 * Publie la feuille des tokens ; un second appel (HMR, tests) la réécrit sans la doubler.
 *
 * Feuille « adoptée », absente de `document.styleSheets` : à l'export d'image, html-to-image
 * écrit les polices distantes dans la première feuille en ligne. Une `<style>` en tête de
 * page changerait les polices de l'export et grossirait à chaque fois. Elle ne sert que de
 * repli là où les feuilles adoptées n'existent pas (Safari < 16.4, jsdom).
 *
 * Une feuille adoptée passe après celles du document dans la cascade : à spécificité égale,
 * un `:root { --dg-… }` écrit dans un fichier CSS perd.
 */
export function publishTokens(): void {
  const css = buildTokenSheet()
  const doc: TokenDocument = document
  if (doc.adoptedStyleSheets) {
    const sheet = (doc.dgTokenSheet ??= new CSSStyleSheet())
    sheet.replaceSync(css)
    if (!doc.adoptedStyleSheets.includes(sheet)) {
      doc.adoptedStyleSheets = [...doc.adoptedStyleSheets, sheet]
    }
    return
  }
  let style = document.getElementById(STYLE_ID)
  if (!style) {
    style = document.createElement('style')
    style.id = STYLE_ID
    document.head.appendChild(style)
  }
  style.textContent = css
}

/**
 * Valeur en cours d'une référence `var(--dg-…)`, là seulement où elle sort du CSS (option
 * `backgroundColor` de l'export d'image). Dans l'image même, les `var()` restent valables :
 * html-to-image recopie les variables sur les éléments clonés, et les traits SVG des liens en
 * dépendent. Toute autre chaîne est rendue telle quelle.
 */
export function resolveToken(reference: string): string {
  const name = /^var\((--[\w-]+)\)$/.exec(reference)?.[1]
  if (!name) return reference
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim()
}
