---
title: 'Story 20.1 (volet 2) — Conversion réplique ↔ blocs'
type: 'feature'
created: '2026-11-26'
status: 'done'
baseline_commit: 'b0162637ef3f7fecb4bbf27b060e953d97901022'
route: 'dispatch'
review_loop_iteration: 0
context: []
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** `splitDialogueLine` fait un `trim()` par segment (non réversible), ne donne aucune position dans la chaîne et traite la suite d'un `*` non fermé en narration. 18.5a (clic → curseur), 20.13 (diff) et la provenance (A12) ont besoin de blocs positionnés et réversibles.

**Approach:** une conversion pure `parse` / `serialize` qui remplace `splitDialogueLine` dans l'affichage et dans l'estimation de hauteur de dagre, avec l'aller-retour prouvé en CI sur les fixtures et en local sur les dialogues réels.

## Boundaries & Constraints

**Always:** affichage seulement, la chaîne stockée reste la donnée ; `serialize(parse(x)) === x` pour toute chaîne ; un `*` non fermé reste du texte (parole, astérisque visible) ; `**` n'ouvre pas de narration ; les cartes du graphe, dont l'aperçu est tronqué à 100 caractères, se rendent comme aujourd'hui quand la coupe tombe dans une didascalie ; positions en unités UTF-16 (celles de `selectionStart`) ; golden d'export de 20.1 volet 1 inchangé, sans `UPDATE_GOLDEN`.

**Never:** toucher au code d'export, à `documentToGraph` ou au backend ; éditeur de blocs ou champ d'écriture (18.5a) ; interpréter `**gras**` ou les préfixes de test ; modifier `GenerationStreamingInline.markdownToHtml` ou `splitStageDirection` (`generationOptionDiagnostics.ts`) ; étendre `scripts/golden-export-local.py`.

## I/O & Edge-Case Matrix

| Scénario | Entrée | Blocs affichés (genre : texte) |
|---|---|---|
| Didascalie en paragraphe | `*Il se lève.*\n\n« Oui. »` | narration `Il se lève.` · parole `« Oui. »` |
| En ligne, action PJ | `(Cynique +5) *[Vous reculez.]*` | parole `(Cynique +5)` · narration `[Vous reculez.]` |
| `*` non fermé | `« Oui. » *Il pose` | un seul bloc parole `« Oui. » *Il pose` |
| Paire puis `*` seul | `*A* b *c` | narration `A` · parole `b *c` |
| Gras | `Le **nœud**.` | parole `Le **nœud**.` |
| Espaces seuls, chaîne vide | `'  '`, `''` | aucun bloc affiché ; aller-retour identique |
| Aperçu coupé dans une didascalie | réplique > 100 car., `*` ouvert avant la coupe, fermé après | dernier passage en narration, aucun astérisque visible |
| Aperçu d'un `*` jamais fermé | réplique > 100 car. | astérisque visible, parole |

</frozen-after-approval>

## Code Map

- `frontend/src/utils/dialogueLineSegments.ts` (+ `.test.ts`) -- `splitDialogueLine`, `findSingleAsterisk` (appariement à conserver tel quel, sauf pour le dernier `*` sans paire). Seuls importeurs : les deux consommateurs ci-dessous et son test.
- `frontend/src/components/shared/DialogueLineText.tsx` -- seul rendu en lecture (cartes, inspecteur, panneau IA, visionneuse, options, playthrough) ; `display: block` + `pre-wrap` par passage, `data-segment`, `DIALOGUE_NARRATION_COLOR` exporté et réutilisé ailleurs.
- `frontend/src/utils/dagreLayout.ts:46-66` -- `estimateDialogueNodeHeight` compte les lignes par passage de l'aperçu.
- `frontend/src/utils/nodeLinePreview.ts` (+ `.test.ts`) -- tronque à 100 caractères **avant** l'affichage (`DialogueNode.tsx:659`, dagre), puis ajoute `« »` aux répliques nues. Sans correctif, la nouvelle règle du `*` non fermé montrerait un astérisque sur les cartes coupées : 19 des 73 répliques longues des fixtures, 27 des 299 d'`Assets/Dialogue/` (mesuré le 2026-11-26).
- Données réelles, même mesure : 0 `*` non fermé, 0 `**`, 0 CR ; 2 chaînes avec espaces en bordure (`Assets/Dialogue/`).
- `frontend/src/__tests__/unityExport.golden.test.ts` -- modèle de lecture des fixtures (`process.cwd()`, `tests/fixtures/unity_dialogues/inputs/`, tableau nu ou `{nodes}`).
- `scripts/golden-export-local.py:46-70` -- résolution d'`Assets/Dialogue/` du dépôt principal depuis un worktree (`git rev-parse --git-common-dir`), à reprendre.

## Tasks & Acceptance

**Execution:**
- [x] `frontend/src/utils/dialogueLineBlocks.ts` -- `parseDialogueLine(line)` → blocs `{kind: 'narration'|'speech', start, end, textStart, textEnd, raw, text}` ; `serializeDialogueBlocks(blocks)` ; `visibleDialogueBlocks(blocks)` (texte non vide). Remplace `dialogueLineSegments.ts`, supprimé avec son test.
- [x] `frontend/src/utils/dialogueLineBlocks.test.ts` -- reprend les cas de l'ancien test et couvre la matrice, les positions (`line.slice(textStart, textEnd) === text`) et la partition.
- [x] `frontend/src/components/shared/DialogueLineText.tsx` -- rendre les blocs visibles ; nouveau test voisin (narration, parole, `*` non fermé).
- [x] `frontend/src/utils/dagreLayout.ts` -- compter sur les blocs visibles ; test du `*` non fermé dans `frontend/src/__tests__/dagreLayout.test.ts`.
- [x] `frontend/src/utils/nodeLinePreview.ts` -- refermer une didascalie que la troncature a coupée (voir Design Notes) ; tests des deux dernières lignes de la matrice.
- [x] `frontend/src/__tests__/dialogueLineRoundTrip.test.ts` -- `p0` : aller-retour sur chaque `line` et texte de réponse des 5 fixtures, échec si aucune chaîne lue ; si `DIALOGUE_ROUNDTRIP_DIR` est posée, même contrôle sur ce dossier (échec s'il est vide).
- [x] `scripts/dialogue-roundtrip-local.cjs` -- trouve `Assets/Dialogue/` (ou `--source`), lance ce test avec la variable, propage le code de sortie.
- [x] `CLAUDE.md` (fait « Réplique affichée »), `deferred-work.md` (entrée « volet 2 » : `status: done`) -- doc alignée.

**Acceptance Criteria:**
- Given les fixtures committées, when Vitest tourne en CI, then chaque chaîne ressort identique octet pour octet.
- Given le poste de l'auteur, when `node scripts/dialogue-roundtrip-local.cjs`, then les 36 dialogues passent et leur nombre est affiché.
- Given le graphe d'un dialogue à didascalies longues, when on l'ouvre dans l'app, then aucune carte ne montre d'astérisque.
- Given l'arbre final, when on relance les deux golden d'export, then verts sans régénération.

## Implementation Notes

- 2026-11-26 : toutes les tâches faites ; la ligne `CLAUDE.md` par la session principale.
- Le test « tronque au-delà du seuil » de `nodeLinePreview.test.ts` attend désormais `...*` : son entrée est une didascalie coupée.
- Preuves : T2 vert (2791 pytest, 2072 Vitest), lint et typecheck à zéro, golden Python 30/30 et front verts sans régénération, aller-retour 36 dialogues / 948 chaînes / 0 écart, 41 cartes longues de Voknir sans astérisque (`tmp/201b-graphe-cartes.png`).
- Limite : une coupe qui tombe entre les deux astérisques d'un `**` laisse un `*` visible ; aucune donnée réelle ne contient de `**`.

## Spec Change Log

## Review Triage Log

Passe 1 (2026-11-26) -- ECH : cas limites ; BH : relecture aveugle ; VG : trous de vérification.

| # | Source | Constat | Verdict | Preuve / route |
|---|---|---|---|---|
| 1 | ECH | Coupe entre les deux astérisques d'un `**` : `*` visible | low | réel à la lecture ; rejeté : 0 `**` dans les données, correctif = une branche de plus |
| 2 | ECH, BH | `--source` sur un fichier ou un dossier sans `.json` : sortie Vitest au lieu du code 2 annoncé | low | `existsSync` seul dans `main` ; patch |
| 3 | ECH, BH, VG | `refonte-scene-architecture.md:108` décrit encore `splitDialogueLine` | low | vérifié ; 18.5a et 20.13 partiraient d'un fichier supprimé ; patch |
| 4 | BH | `serialize` ignore `text`/`kind` : une édition de bloc serait perdue | low | voulu (concaténation des `raw`) ; patch : champs `readonly` |
| 5 | BH | Positions vérifiées sur des entrées inventées seulement | low | `checkFolder` ne compare que `serialize` ; patch : assertion |
| 6 | BH | CRLF : un `<textarea>` normalise en LF, positions décalées | low | vrai pour `selectionStart` ; 0 CR dans les données ; patch : commentaire |
| 7 | BH | Positions calculées sur l'aperçu d'une carte décalées par `« ` et le `*` ajouté | low | `DialogueNode.tsx:659` ; aucun consommateur aujourd'hui ; patch : commentaire |
| 8 | BH | `*Il pose` non fermé en tête : aperçu sans guillemets, astérisque visible | low | réel ; rejeté : 0 `*` non fermé, correctif = une condition de plus |
| 9 | BH | Classement des astérisques mal formés (`*a**`, `***`) non figé par test | low | appariement inchangé depuis `splitDialogueLine` ; rejeté : figerait un comportement que personne n'a choisi |
| 10 | BH | « Rendu identique » après coupe non figé par un texte attendu | low | les tests ne regardent que le genre et l'absence de `*` ; patch |
| 11 | BH | `sprint-status.yaml` dit encore « volet 2 différé » | low | ligne 201 ; patch |
| 12 | BH | `deferred-work` « done » mais spec « in-review » | false | état normal du workflow avant présentation |
| 13 | BH | `test-design-epic-20.md:207` cite le test supprimé | low | les stories suivantes partent de ce plan ; patch |
| 14 | BH | README des fixtures muet sur l'aller-retour ; pas de script npm | low | patch README ; script npm rejeté (appel `node` direct documenté) |
| 15 | BH | Le contrôle local peut réussir sur un dossier partiel | low | rejeté : source et nombre affichés ; figer « 36 » serait faux demain |
| 16 | VG | Filtre des blocs vides non figé côté dagre | low | mutation décrite : `parseDialogueLine` sans filtre reste vert ; patch |

## Design Notes

Les blocs **partitionnent** la chaîne : un bloc narration va de son `*` ouvrant à son `*` fermant inclus (`start`..`end`), tout le reste (espaces compris) est parole. `serialize` n'est alors que la concaténation des `raw` ; `textStart`/`textEnd` bornent le texte montré, sans espaces ni délimiteurs.

Aperçu : si, dans la réplique **entière**, un bloc narration a son `*` ouvrant avant 100 et son `*` fermant à 100 ou après, ajouter un `*` à la toute fin de l'aperçu (après le `»` éventuel) : rendu identique à aujourd'hui. Un `*` jamais fermé dans la réplique ne reçoit rien.

## Verification

**Commands:**
- `cd frontend && npx vitest run src/utils/dialogueLineBlocks.test.ts src/utils/nodeLinePreview.test.ts src/components/shared src/__tests__/dagreLayout.test.ts src/__tests__/dialogueLineRoundTrip.test.ts src/__tests__/unityExport.golden.test.ts src/components/graph/nodes --reporter=dot` -- tout vert
- `node scripts/dialogue-roundtrip-local.cjs` -- 36 dialogues, 0 écart
- `npm --prefix frontend run lint` et `npm --prefix frontend run typecheck` -- zéro erreur
- `npm run test:premerge` -- vert avant la PR

**Manual checks:**
- App sans LLM (`dialogue-generator-dev-sans-llm`) : graphe d'un dialogue à longues didascalies, capture des cartes.
