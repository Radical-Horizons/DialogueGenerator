---
title: 'Story 20.3 — Tokens en variables CSS, thème Nuit seul'
type: 'refactor'
created: '2026-11-28'
status: 'done'
baseline_commit: '07a2653207ae28532aba13163d4f0971be4a412e'
route: 'dispatch'
review_loop_iteration: 0
context: []
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** Les couleurs de `redesignTokens.ts` sont des littéraux posés en styles inline : le thème Papier (20.16) obligerait à retoucher chaque écran.

**Approach:** Valeurs de Nuit dans un seul objet TypeScript, publiées en variables CSS sur `:root` au démarrage ; les constantes de `redesignTokens.ts` gardent leurs noms et renvoient `var(--dg-…)`. Aucun changement visible.

## Boundaries & Constraints

**Always:**
- Chaque token est publié sur `:root`, avant le premier rendu, depuis une seule source ; un thème de plus = un second jeu de valeurs sous `:root[data-theme="…"]`.
- Couleurs et ombre (ce qui change d'un thème à l'autre) se lisent par `var()` ; espacements, rayons, largeurs, tailles de glyphe et polices restent des littéraux en TypeScript (calculs, unités).
- Écrans 1c, 2a–2e, minimap et export PNG du graphe identiques au pixel avant / après (tolérance antialiasing).

**Never:**
- Thème Papier, sélecteur ou réglage (20.16).
- Migrer `theme.ts`, `index.css` ou les couleurs en dur des composants (à consigner dans `deferred-work.md`).
- Changer une valeur ; nouvelle dépendance ; backend, export Unity ; appel LLM.

## I/O & Edge-Case Matrix

| Scénario | État | Attendu |
|---|---|---|
| Publication répétée | appel deux fois (HMR, test) | une seule feuille |
| Nouvelle clé dans les valeurs | — | publiée sans autre geste |
| Couleur avec alpha dérivé | voile de minimap (`canvas` + `80`) | token propre `#10101380` |
| Rendu hors du document | fond de repli de l'export PNG / SVG | valeur résolue, pas `var()` |

</frozen-after-approval>

## Code Map

- `frontend/src/theme/redesignTokens.ts` -- les tokens. Les fonctions et styles composés (`redesignTab`, `redesignListRowStyle`, `redesignMonoLabelStyle`) ne sont pas des tokens. Garder les commentaires de contraste.
- `frontend/src/main.tsx` -- seul point d'entrée.
- 89 fichiers importent `redesignTokens` (tests compris) : inchangés si les noms le sont.
- `components/graph/GraphCanvas.tsx:845` -- seule concaténation sur un token (`maskColor`). `nodeColor` et `maskColor` finissent dans l'attribut SVG `fill` : vérifier au navigateur que `var()` y est résolu, sinon passer par le CSS.
- `utils/graphExport.ts:30,71` -- `redesignSurface.canvas` en repli ; `html-to-image` sérialise un clone sans les variables de `:root`.
- `components/layout/Dashboard.test.tsx:718`, `__tests__/GraphCanvas.virtualization.test.tsx:253-285` -- lisent un `rgb()`. jsdom ne développe pas un raccourci (`border`) contenant `var()`.
- `e2e/helpers.ts`, `e2e/generation-streaming-inline.spec.ts`, `playwright.perf.config.ts` (clés LLM vidées) -- modèles pour les captures. Maquettes : `docs/design/refonte-ui-2026/`.

## Tasks & Acceptance

**Execution:**
- [x] `tmp/captures-20-3/` (non versionné) -- **avant toute modification**, captures Playwright headless de référence : 1c, 2a, 2b, 2c, 2d (1024 px), 2e avec minimap, export PNG ; génération simulée, valeurs mouvantes masquées ; deux passages identiques.
- [x] `frontend/src/theme/tokenValues.ts` -- valeurs de Nuit déplacées sans changement, plus `surface.canvasMask`.
- [x] `frontend/src/theme/publishTokens.ts` -- générer et insérer la feuille ; lire une valeur résolue.
- [x] `redesignTokens.ts`, `main.tsx` -- références `var()`, publication avant le rendu.
- [x] `GraphCanvas.tsx`, `graphExport.ts` -- voile par token ; fond d'export résolu.
- [x] `frontend/src/theme/publishTokens.test.ts` -- matrice, parité valeurs ↔ `:root`, aucun `var()` sans variable publiée.
- [x] Les deux tests cités -- attendre la référence au token.
- [x] Captures **après**, comparées par le comparateur de Playwright ; chiffres dans les notes.
- [x] `_bmad-output/implementation-artifacts/deferred-work.md` -- couleurs encore en dur, à reprendre avec 20.16.

**Acceptance Criteria:**
- Given `redesignTokens.ts`, when l'app démarre, then chaque token est publié en variable sur `:root`.
- Given les écrans déjà sur `redesignTokens`, when ils lisent `var(--…)`, then les captures avant / après de 1c et 2a–2e sont identiques au pixel près (tolérance antialiasing).

## Implementation Notes

**Captures** (`tmp/captures-20-3/`, non versionné) : build de production avant / après servi par `vite preview`, API locale aux clés LLM vidées, génération simulée (`EventSource` factice), horloge figée, aucun masque utile. Six comparaisons (1c, 2a, 2b, 2c, 2d à 1024 px, 2e avec minimap puis export PNG) : deux passages de référence identiques, puis **après = 0 pixel d'écart au seuil 0** (et à 0,2). Contrôle négatif : redéfinir `--dg-surface-canvas`, `--dg-surface-canvas-mask` ou `--dg-text-label` fait échouer la comparaison (553 380, 10 404 et 2 482 pixels).

**Export PNG / SVG déjà cassé au départ** : `html-to-image` passe les nœuds texte au filtre, `node.classList.contains` levait une exception et aucune image ne sortait. Corrigé (`classList?.`, test `graphExport.test.ts`). La référence « avant » est donc le code de départ **plus** ce seul correctif.

**Feuille adoptée plutôt que `<style>`** : avec une `<style>` en tête de page, `html-to-image` y injectait les polices Google, ce qui changeait l'export (9 787 pixels) et aurait fait grossir la feuille à chaque export. `publishTokens` passe par `document.adoptedStyleSheets`, `<style id="dg-tokens">` en repli (Safari < 16.4, jsdom). Défaut de polices de l'export consigné dans `deferred-work.md`.

**`var()` dans l'attribut SVG `fill`** : résolu par Chromium (voile et nœuds de la minimap), vérifié dans le navigateur intégré. Firefox et Safari non vérifiés.

**Après la relecture** (code final) : comparaison rejouée, référence régénérée depuis le build « avant » : 6 sur 6 identiques au seuil 0, export PNG compris. T2 verte (pytest 2811 passés, 4 ignorés ; Vitest 342 fichiers), typecheck et lint à zéro, `e2e/graph-export-image.spec.ts` vert (export SVG réel). Une référence supprimée ne se recrée pas : le document de capture change de nom d'un passage à l'autre.

## Spec Change Log

## Review Triage Log

Passe 1 (2026-11-28). BH = blind hunter, VG = verification gap, ECH = edge case hunter.

| Constat | Verdict | Route | Preuve |
|---|---|---|---|
| VG1 : aucun test n'exécute le vrai export ; les liens y restent en `var()` | medium | patch (G1) | Tous les tests mockent `html-to-image` ; la sonde Chromium du relecteur perd le lien sans les propriétés copiées. |
| BH1 : l'export dépend d'une copie des propriétés par la bibliothèque ; Firefox / WebKit non sondés | medium | patch (G1) | `clone-node.js` ne stylise pas les descendants d'un `<svg>` ; `getStyleProperties` énumère `documentElement`. Hors Chromium : non vérifié, signalé à l'auteur. |
| ECH1 : navigateur qui n'énumère pas les propriétés personnalisées | maybe-false | patch (G1) | Réglé en exportant dans Firefox et Safari, non installés. |
| VG2 : rien ne vérifie que le voile de minimap lit le token | low | patch | Aucun test ne lit `.react-flow__minimap-mask`. |
| VG autre : commentaire de `resolveToken` trompeur | low | patch (G2) | Les variables sont copiées dans le clone ; seule la valeur sortie du CSS doit être résolue. |
| BH11 : la feuille adoptée passe après les CSS, non documenté | low | patch (G2) | Ordre de cascade de `adoptedStyleSheets` ; une phrase suffit. |
| BH4 : les valeurs de Nuit ne sont plus fixées par un test | low | patch | `#3d3d46` n'était plus affirmé nulle part (`#4f7fff` l'est dans `main.test.tsx`). |
| BH9 : comptes incohérents dans `deferred-work.md` | low | patch | 388 ≠ 394, 94 ≠ 97. |
| BH10 : docs et règle désignent encore `redesignTokens.ts` comme siège des valeurs | low | defer | La correction touche des fichiers de contexte d'agent (`.claude/rules/`). |
| BH2 : repli `resolveToken` inatteignable dans un navigateur | low | rejeté | Vrai (`rgba(0, 0, 0, 0)` est truthy) mais antérieur, sans effet, et la matrice demande ce repli résolu. |
| BH3 : rien n'interdit de recréer une concaténation sur un token | low | rejeté | Une seule occurrence historique ; la parade est une règle ou un test de plus. |
| BH5 : pas de contrôle de complétude d'un second thème | low | rejeté | Aucun second thème avant 20.16 ; la parade ajoute du typage. |
| BH6 : tokens non couleur publiés sans lecteur | false | rejeté | Voulu par l'intention approuvée (littéraux en TypeScript), écrit en tête de `redesignTokens.ts`. |
| ECH4 : redéfinir police ou rayon ne change rien | false | rejeté | Même décision que BH6. |
| BH7 : `px` ajouté à tout nombre | low | rejeté | Tous les nombres actuels sont des pixels ; la parade ajoute une branche. |
| ECH2 : idem BH7 | low | rejeté | Même preuve. |
| BH8 : taille de l'export SVG non mesurée | low | rejeté | 49 propriétés ajoutées aux quelque 350 déjà copiées par élément. |
| ECH3 : sans `adoptedStyleSheets`, l'export injecte les polices dans la feuille des tokens | low | rejeté | Safari < 16.4 seulement ; la parade ajoute une branche. |

## Design Notes

Noms exportés inchangés : récrire les consommateurs en chaînes `var(--…)` ferait un gros diff non typé. Variables : `--dg-<famille>-<clé>` en kebab, `px` pour les nombres.

## Verification

**Commands:**
- `npm --prefix frontend run typecheck`, `npm --prefix frontend run lint` -- zéro erreur
- `npm run test:premerge` -- vert

**Manual checks:**
- Navigateur intégré (`dialogue-generator-dev-sans-llm`) : variables sur `:root` ; en redéfinir une change les surfaces qui la lisent ; `npm run dev:stop` ensuite. Tout autre serveur : `OPENAI_API_KEY` vidée.
