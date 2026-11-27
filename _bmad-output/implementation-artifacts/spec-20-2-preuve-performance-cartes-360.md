---
title: 'Story 20.2 — Preuve de performance : cartes 360 px, flux LR, paliers de zoom'
type: 'feature'
created: '2026-11-27'
status: 'in-review'
baseline_commit: '949be1931f5d2bccc278fb3b2eaf2b418cbfd36b'
route: 'dispatch'
review_loop_iteration: 0
context: []
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** La tranche 2 mise sur des cartes de 360 px au texte lisible, en flux gauche → droite avec paliers de zoom ; personne n'a mesuré que le graphe le tient à 500 répliques. Cette preuve choisit le plan A ou le plan B (280 px, dépliage à la sélection, Epic 18 D3).

**Approach:** Prototype dans le vrai `GraphCanvas` derrière un drapeau de `uiLayoutStore` (désactivé par défaut), graphe de 500 répliques généré et versionné, harnais `e2e/perf-document-load.spec.ts` étendu, mesures sur ce poste, décision écrite avec ses chiffres.

## Boundaries & Constraints

**Always:** drapeau éteint = graphe actuel inchangé ; seuils d'`epic-20.md` « Seuils de mesure », sans en inventer ; paliers écrire ≥ 75 %, lire ≥ 40 % et < 75 %, situer < 40 %, calculés à `onMoveEnd` seulement ; la carte en écriture reste à « écrire » ; le prototype n'écrase jamais les positions TB enregistrées ; `onlyRenderVisibleElements` conservé ; golden d'export verts sans régénération ; mesures sans autre charge sur le poste.

**Never:** tests en sorties et liens hors champ (20.8), lentille et popovers (20.9), champ d'écriture 18.5a/18.5b, migration de disposition (20.7) ; toucher au backend ou à l'export ; implémenter le plan B ; appel LLM ; relever un seuil ou retirer un contenu de carte pour faire passer une mesure.

**Décidé à l'approbation (2026-11-27) :**
- Images : « p95 des images ≤ 16 ms » se lit « aucune image sautée » sur l'écran à 60 Hz : p95 de l'intervalle entre images ≤ 16,7 ms, tolérance de gigue 0,5 ms. La tâche longue ≤ 50 ms s'applique en plus.
- Graphe jugé : 500 cartes, 4 sorties par réponse testée dessinées sur la carte, sans nœuds de test (cible de 20.8) ; une mesure avec les nœuds de test actuels est consignée pour information. Le prototype ne dessine que les ports : les liens d'issue partent de ces ports, sans changer le document.
- Build jugé : production (`vite build` + `preview`) ; les chiffres du serveur de développement sont consignés pour information.

## I/O & Edge-Case Matrix

| Scénario | État | Attendu |
|---|---|---|
| Bornes de palier | zoom 0,75 / 0,7499 / 0,40 / 0,3999 | écrire / lire / lire / situer |
| Zoom en cours | `onMove` sans `onMoveEnd` | palier inchangé |
| Carte en écriture | zoom → 0,2 | cette carte reste « écrire » |
| Première ouverture, drapeau actif | pas de positions LR | dagre `LR` calculé |
| Ouverture suivante | positions LR enregistrées | reprises sans recalcul |
| Drapeau éteint ensuite | document déjà ouvert en LR | positions TB d'origine |
| Réplique de 2 400 caractères | palier écrire | 12 lignes, défilement interne si sélectionnée, réponses entières |

</frozen-after-approval>

## Code Map

- `frontend/src/store/uiLayoutStore.ts` -- drapeau ; lire `localStorage` à la création du store (modèle `sectionFromUrl`).
- `frontend/src/store/graphViewStore.ts` -- palier courant et nœud en écriture.
- `frontend/src/components/graph/GraphCanvas.tsx:279,637` -- `onMove` fait `setViewport` à chaque image (re-rendu du canvas) ; pas d'`onMoveEnd` ; `nodeTypes` l.612 ; auto-layout `'TB'` l.805.
- `frontend/src/components/graph/nodes/DialogueNode.tsx` -- carte actuelle de 280 px, aperçu à 100 caractères ; s'abonne à `s.nodes` entier (`graphNodes`, l.209) : toute mutation re-rend toutes les cartes. Handles `choice:<choiceId|__idx_N>` en bas : ids à conserver.
- `frontend/src/components/shared/DialogueLineText.tsx` -- rendu du texte à réutiliser (20.1).
- `frontend/src/store/slices/persistenceSlice.ts:52-77` -- `normalizeGraphForLoad` : dagre `TB` si aucune position ; `loadDialogueByDocumentId` l.372.
- `frontend/src/utils/syncDocLayout.ts` -- `mergeLayoutWithNodePositions` garde les clés inconnues ; le layout serveur est un dictionnaire libre : y ranger les positions LR sous leur propre clé.
- `frontend/src/utils/dagreLayout.ts` -- hauteur estimée pour 280 px ; `redistributeSiblingBranches` décale les frères (vérifier en LR).
- `docs/design/refonte-scene/Carte.dc.html`, `Paliers.dc.html` -- valeurs de la carte et des paliers.
- `e2e/perf-document-load.spec.ts`, `e2e/helpers.ts` (`seedDocumentWithRetry`), `playwright.pwa.config.ts` (modèle build + preview).
- `tests/fixtures/unity_dialogues/inputs/` -- 81 répliques ; longueur médiane 669, p90 1 219, max 2 437 ; 4 réponses en médiane, texte médian 107.
- Poste : Ryzen 9 7950X, 191 Go, RTX 5090, 1920×1080 à 60 Hz.
- Environnement : `.venv` et `node_modules` sont installés dans le worktree (pas de jonction). Le worktree hérite du `.env` du dépôt principal : tout serveur lancé (config Playwright comprise) doit avoir `OPENAI_API_KEY` vide et `HEALTH_CHECK_LLM_PING=false` ; ne pas lancer `playwright.config.ts` sans ces deux variables. Ne pas réutiliser un serveur déjà ouvert sur 3000/4243/4173 (il peut venir d'un autre worktree). Ni commit ni push à l'implémentation.

## Tasks & Acceptance

**Execution:**
- [x] `scripts/generate-perf-graph.mjs` + `e2e/fixtures/perf-graph-500.json` -- 500 répliques en arbre, déterministes (graine), longueurs tirées de la distribution des fixtures.
- [x] `frontend/src/utils/zoomTiers.ts` (+ test) -- bornes des paliers.
- [x] `uiLayoutStore.ts`, `graphViewStore.ts` (+ tests) -- drapeau persistant, palier, nœud en écriture.
- [x] `frontend/src/components/graph/nodes/TextCardNode.tsx` (+ test) -- carte 360 px par palier, ports par réponse à droite, mêmes ids de handles.
- [x] `GraphCanvas.tsx` (+ test) -- carte du prototype quand le drapeau est actif, palier à `onMoveEnd`.
- [x] `dagreLayout.ts`, `persistenceSlice.ts`, `syncDocLayout.ts` (+ tests) -- disposition `LR` avec hauteurs du prototype, positions LR séparées des positions TB.
- [x] Carte en écriture -- le texte brut de la carte se tape dans un `<textarea>` qui écrit par `updateNode`, inspecteur replié pour n'avoir qu'un écrivain ; prototype seulement.
- [x] `e2e/perf-document-load.spec.ts`, `playwright.perf.config.ts`, script npm -- p95 sur ≥ 20 répétitions : première ouverture, ouverture suivante, frappe, glisser, zoom 100 → 20 % ; navigateur avec GPU, trace dans `tmp/` ; le test existant reste.
- [x] Optimiser le rendu du prototype tant qu'un seuil manque et qu'une cause est visible dans la trace (une passe, avant / après consignés).
- [x] Décision plan A / plan B dans `## Implementation Notes` (poste, navigateur, médiane, p95), avec la base de référence (graphe actuel) ; si plan B, ajuster 20.7 et 20.8 dans `epic-20.md` et le README § 15.

**Acceptance Criteria:**
- Given le graphe de 500 répliques et le drapeau actif, when le harnais tourne avec `PERF_STRICT=1`, then chaque seuil a un chiffre, tenu ou non.
- Given la fin de la story, then la décision et ses mesures sont écrites ; un seuil manqué donne le plan B.
- Given le drapeau éteint, then les tests existants du graphe passent sans modification.

## Implementation Notes

### Décision : plan B (cartes de 280 px, dépliage à la sélection)

Le seuil **p95 glisser < 200 ms** est manqué par le prototype à 360 px, après la passe d'optimisation : 202,8 ms à 100 %
et 314,8 ms vue ajustée (mesure stricte) ; seconde mesure du glisser seul : 189,8 ms et 262,5 ms. Les autres seuils
sont tenus. `epic-20.md` (20.7, 20.8) et le README § 15 sont ajustés.

Réserves à connaître avant de s'engager :
- **Le manque ne vient pas de la largeur des cartes.** Le plan B à 280 px ne le corrige pas à lui seul : c'est le coût
  de la reprojection du document et du re-rendu du graphe, partagé avec le graphe actuel (base de référence ci-dessous).
- **La mesure du glisser contient le geste scripté** (enfoncement, dix déplacements, lâcher, image suivante : au moins
  une dizaine d'images, soit ~170 ms). Du seul lâcher à l'image peinte : p95 10,3 ms à 100 %, 7,4 ms vue ajustée.
  Aucune tâche longue pendant les glissers. À 100 %, le p95 oscille autour du seuil (202,8 puis 189,8 ms) ; en vue
  ajustée il le dépasse les deux fois.
- La définition du glisser (ADR-008 : de `mousedown` à `mouseup`) ne dit ni le nombre de déplacements ni le zoom : les
  dix déplacements et la double mesure (100 % et vue ajustée) sont des choix du harnais.

### Remesure après relecture, poste au calme (0,4 cœur occupé avant, calme après)

Harnais durci par la relecture (il vérifie que la carte bouge, que la saisie change le champ, que le zoom est atteint).

| Mesure (p95, ms) | Seuil | Remesure |
|---|---|---|
| Première ouverture | < 3 000 | 1 760 tenu |
| Ouverture suivante | < 3 000 | 1 469 tenu |
| Frappe | < 100 | 94,9 tenu (de peu) |
| Glisser à 100 % | < 200 | 197,2 tenu (de peu) ; du lâcher à l'image 11,0 |
| Glisser, vue ajustée (zoom 10 %) | < 200 | **336,6** manqué ; du lâcher à l'image 20,2 |
| Images au zoom | <= 17,2 | 18,3 dépassé, mais la cadence au repos du navigateur headless valait 17,6 ms ce passage (max 18,9) : aucune image sautée |
| Tâche longue au zoom | <= 50 | aucune |

La vue ajustée manque le seuil à chaque passage (262, 315, 337 ms ; 426 sous charge). Le glisser à 100 % et la frappe
oscillent autour de leur seuil (glisser 190, 197, 203 ; frappe 89, 95) et décrochent sous charge (477 et 134 ms).

**La décision reste à confirmer par l'auteur** : elle tient au seul glisser en vue ajustée, un point de mesure que ni
ADR-008 ni l'epic ne demandent explicitement, et à une durée qui contient les dix déplacements scriptés.

### Poste et conditions

AMD Ryzen 9 7950X, 191 Go, Windows 10.0.26300, NVIDIA GeForce RTX 5090. Chrome 158.0.8127.37, **nouveau headless**
(aucune fenêtre, demande de l'auteur), 1900 × 950, facteur d'échelle 1. Le harnais refuse de mesurer sans rendu
matériel : `ANGLE (NVIDIA, NVIDIA GeForce RTX 5090, D3D11)`, composition GPU `enabled`. Cadence au repos 16,7 ms.

Limites : en headless la cadence de 60 Hz est celle du navigateur, pas celle de l'écran (aucune image présentée sur la
dalle). Le poste n'était pas au repos : d'autres sessions tournaient (environ 3 % de CPU par processus Python, jusqu'à
quatre ; un autre Chrome headless à ~30 % d'un relevé à la fin des mesures d'information). Les premières mesures,
faites en fenêtre visible, ont été jetées.

### Mesures (ms, 20 répétitions, médiane / p95 ; 40 frappes)

Graphe : 500 répliques, 2 003 réponses dont 1 234 testées, répliques médiane 697, p90 1 332, max 2 437 caractères.

| Mesure | Seuil p95 | Jugé : cartes, prod, après | Cartes avant optimisation | Cartes + nœuds de test (info) | Graphe actuel (référence) | Cartes, serveur dev (info) |
|---|---|---|---|---|---|---|
| Première ouverture (depuis le GET) | < 3 000 | 1 630 / 2 026 tenu | 1 508 / 1 685 | 1 891 / 2 081 | 2 588 / 2 932 | 4 287 / 5 730 |
| Ouverture suivante | < 3 000 | 1 152 / 1 219 tenu | 1 322 / 1 510 | 1 304 / 1 500 | 1 492 / 1 636 | 4 242 / 5 171 |
| Frappe | < 100 | 20 / 89 tenu | 10 392 / 23 946 | 24 / 131 | 52 / 1 351 | 29 / 145 |
| Glisser à 100 % | < 200 | 176 / **203** manqué | 6 495 / 7 474 | 5 919 / 8 714 | 8 264 / 9 652 | 291 / 496 |
| Glisser, vue ajustée | < 200 | 189 / **315** manqué | 4 635 / 5 880 | 10 226 / 11 287 | 16 056 / 18 349 | 499 / 704 |
| Images au zoom 100 → 20 % | <= 16,7 (+ 0,5) | 16,7 / 16,8 tenu (max 18,1) | 16,7 / 16,8 | 16,7 / 16,8 (max 33) | 16,7 / 16,8 (max 2 417) | 16,7 / 16,8 (max 33) |
| Tâche longue au zoom | <= 50 | aucune, tenu | aucune | aucune | aucune relevée | aucune |

Chiffres depuis la navigation, jugé : 1 695 / 2 103 (première), 1 215 / 1 282 (suivante). Aucune écriture de layout à
la réouverture. Sources : `tmp/perf-20-2/*.json` et `trace-zoom-*.json` (non versionnés).

Lecture du zoom : à 20 %, 13 cartes seulement sont dans la vue autour de la carte choisie. La disposition `LR` aux
hauteurs du palier « écrire » mesure 6 760 × 219 190 px : même au zoom minimal (10 %) « Ajuster » ne montre pas tout
le graphe.
Le graphe actuel a des images isolées jusqu'à 2 417 ms (36 au-delà du seuil sur 2 663) sans tâche longue relevée :
cause non expliquée, peut-être hors du fil principal.

### Passe d'optimisation (une)

Profil : 2 cartes et 8 liens montés, mais à chaque image du glisser et à chaque touche le store reprojetait tout le
document (`documentToGraph` + `normalizeTestBars`, quadratique). En prototype seulement, un glisser (sans barres de
test) n'écrit plus que la position, et une frappe que la réplique (nœud et document). Profil : une frappe 919 → 40 ms,
un glisser 6 427 → 229 ms. La passe porte sur la projection qui alimente le rendu, pas sur les composants.

### Choix d'implémentation à connaître

- Positions : le store lit toujours `layout.nodes` ; en prototype il contient les positions `LR` et les `TB` sont mises
  de côté, puis remises à leur place à l'enregistrement (`nodes` = TB, `nodesLR` = LR). La première ouverture écrit le
  layout seul.
- Zooms programmés (« Ajuster », boutons, recentrage) : React Flow n'émet pas `onMoveEnd`, le palier suit 120 ms après.
- `redistributeSiblingBranches` est désactivé en `LR` (il fait se chevaucher les cartes hautes).
- Le canvas du prototype ne dessine plus d'étiquettes sur les liens (board `Carte`, zone 4) ; les liens d'issue ne sont
  pas supprimables depuis le canvas.
- Le champ d'écriture place le curseur en fin de texte, pas à la position cliquée.

### Non couvert, risques

- Nœud créé pendant que le drapeau est actif : pas de position `TB`, il tombe à une position par défaut une fois le
  drapeau éteint.
- Drapeau sans bouton, lu au chargement : le basculer avec un dialogue ouvert demande un rechargement.
- Reprise du journal IndexedDB après un plantage en prototype puis drapeau éteint : non vérifiée.
- La carte du prototype ne porte pas Accepter / Rejeter / Régénérer, « Voir le prompt » ni l'aperçu des conditions.

## Spec Change Log

- 2026-11-27 (en cours d'implémentation, demande de l'auteur) : toutes les mesures et captures en headless, GPU vérifié
  par le harnais ; « navigateur avec GPU » se lit Chrome en nouveau headless.

## Review Triage Log

Relecture du 2026-11-27 (itération 0). VG = trous de vérification, BH = revue aveugle, EC = cas limites.

| # | Constat | Verdict | Preuve et route |
|---|---|---|---|
| VG1 | Le test « zoom en cours » ne change pas le zoom réel | medium | `onMove` simulé ne touche pas le transform React Flow ; patch |
| VG2 | Palier après zoom programmé non testé | medium | aucun test ne change le zoom de l'instance ; patch |
| VG3 | Fin d'écriture au changement de nœud ou de dialogue non testée | low | le test n'appelle que `setInspectorTab` ; patch |
| VG4 | Disposition automatique en prototype non testée | medium | aucun test n'appelle `applyAutoLayout` avec le marqueur ; patch |
| VG5 | Annulation des voies courtes non vérifiée | medium | `undo()` sans assertion ; patch |
| VG6 | Marquage « modifié » du glisser court masqué par la frappe | medium | seule assertion après une édition ; patch |
| VG7 | La mesure du glisser passe même si la carte ne bouge pas | medium | `dragCard` n'assère rien ; patch |
| VG8 | Ports connectables pendant la lecture jouée | low | prototype caché, sans bouton ; rejeté |
| BH1 | La génération redispose le prototype en TB | low | `generationSlice` ; n'écrit que `nodesLR`, TB intact ; prototype caché ; rejeté |
| BH2 | `loadDialogue` ignore le prototype puis « Disposer » en LR s'enregistre sous la clé TB | medium | direction choisie sur le drapeau et non sur le marqueur du layout ; patch |
| BH3 | `nodesLR` partiel jamais complété | low | prototype caché, correction non triviale ; rejeté |
| BH4 | Première écriture du layout LR sans garde (invité, file) | low | drapeau caché ; conflit repris par l'autosave ; rejeté |
| BH5 | Surbrillance du chemin perdue sur les issues de test | low | surbrillance avant reprojection des sources ; réordonnancement, patch |
| BH6 | Nœuds de test masqués : erreurs et focus sans cible, issues non câblables | low | périmètre de 20.8, prototype caché ; rejeté |
| BH7 | Le champ de carte ignore les erreurs en ligne | low | champ 18.5a/18.5b exclu par l'intention ; rejeté |
| BH8 | Écriture au clavier et retour de l'inspecteur | low | champ 18.5a/18.5b exclu par l'intention ; rejeté |
| BH9 | Le changement de palier tombe après le geste mesuré | low | exact ; le seuil porte sur « pendant le geste » ; le correctif est une note de cette spec ; rejeté, chiffre rapporté à l'auteur |
| BH10 | Le harnais ne vérifie ni la frappe ni le zoom atteint | medium | aucune assertion ; patch |
| BH11 | La fusion des mesures partielles garde les anciennes métadonnées | low | `Object.assign(results, ancien, results)` ; patch |
| BH12 | Clés Mistral et OpenRouter non vidées par la config perf | medium | seul `OPENAI_API_KEY` est vidé ; patch |
| BH13 | Les critères 20.7 reposent sur une définition du glisser choisie par le harnais | medium | ADR-008 ne fixe ni le nombre de déplacements ni le zoom ; **question à l'auteur** (code inchangé quelle que soit la réponse, donc pas de retour arrière) ; texte de l'epic, patch |
| BH14 | La variante avec nœuds de test est confondue avec la voie courte | medium | la voie courte exige l'absence de barres ; la note 20.8 n'est pas établie ; patch |
| BH15 | Plan B non propagé à la règle, à l'architecture, au plan de tests | medium | différé (fichiers de contexte agent, décision à confirmer) |
| BH16 | Le prototype abandonné reste sans plan de retrait | medium | différé à 20.7 |
| EC1 | = BH1 | low | rejeté |
| EC2 | = BH3 | low | rejeté |
| EC3 | Positions de barres périmées dans `nodesTB` | low | prototype caché ; rejeté |
| EC4 | = BH2 | medium | patch |
| EC5 | = BH4 (course) | low | rejeté |
| EC6 | = BH4 (invité) | low | rejeté |
| EC7 | « Voir le prompt » sans effet sur la carte | low | noté en « Non couvert » ; rejeté |
| EC8 | Pas d'Accepter / Rejeter sur la carte | low | noté en « Non couvert » ; rejeté |
| EC9 | = BH6 | low | rejeté |
| EC10 | `onMoveEnd` absent si le geste revient au point de départ | low | geste improbable, corrigé par le suivant ; rejeté |
| EC11 | Clés React en double sur des puces identiques | low | correction directe, patch |
| EC12 | = BH11 | low | patch |
| EC13 | `wheelToZoom` n'échoue pas si le zoom n'est pas atteint | medium | patch avec BH10 |

## Verification

**Commands:**
- `npm --prefix frontend run lint` et `npm --prefix frontend run typecheck` -- zéro erreur
- `PERF_STRICT=1 npx playwright test -c playwright.perf.config.ts` -- chiffres produits
- `npm run test:premerge` -- vert avant la PR

**Manual checks:**
- App sans LLM, drapeau actif : captures aux trois paliers, comparées aux boards.
