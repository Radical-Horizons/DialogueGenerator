---
title: 'Story 20.2 — Preuve de performance : cartes 360 px, flux LR, paliers de zoom'
type: 'feature'
created: '2026-11-27'
status: 'done'
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

**Always:** drapeau éteint = graphe actuel inchangé ; seuils d'`epic-20.md` « Seuils de mesure », sans en inventer ; paliers écrire ≥ 75 %, lire ≥ 40 % et < 75 %, situer < 40 %, calculés à `onMoveEnd` seulement ; la carte en écriture reste à « écrire » ; le prototype n'écrase jamais les positions TB enregistrées ; `onlyRenderVisibleElements` conservé ; golden d'export verts sans régénération ; protocole de mesure robuste à la charge (renégociation ci-dessous).

**Never:** tests en sorties et liens hors champ (20.8), lentille et popovers (20.9), champ d'écriture 18.5a/18.5b, migration de disposition (20.7) ; toucher au backend ou à l'export ; implémenter le plan B ; appel LLM ; relever un seuil ou retirer un contenu de carte pour faire passer une mesure.

**Décidé à l'approbation (2026-11-27) :**
- Images : « p95 des images ≤ 16 ms » se lit « aucune image sautée » sur l'écran à 60 Hz : p95 de l'intervalle entre images ≤ 16,7 ms, tolérance de gigue 0,5 ms. La tâche longue ≤ 50 ms s'applique en plus.
- Graphe jugé : 500 cartes, 4 sorties par réponse testée dessinées sur la carte, sans nœuds de test (cible de 20.8) ; une mesure avec les nœuds de test actuels est consignée pour information. Le prototype ne dessine que les ports : les liens d'issue partent de ces ports, sans changer le document.
- Build jugé : production (`vite build` + `preview`) ; les chiffres du serveur de développement sont consignés pour information.

**Renégocié par l'auteur (2026-11-27, après les premières mesures).** Ses mots : « J'ai presque toujours des modèles IA qui tournent sur mon pc, donc avoir un pc au repos c'est beaucoup demander » ; « les optimisations sont sans doute possible sans dégrader la qualité, avec un peu d'ingéniosité ». Conséquences :
- Pas de repli sur le plan B : cartes de 360 px conservées, on optimise le prototype jusqu'à tenir les seuils, en visant une marge, sans retirer de texte ni dégrader le rendu. Aucun seuil n'est assoupli, la définition du glisser (ADR-008, `mousedown` → `mouseup`, dix déplacements, à 100 % et vue ajustée) ne change pas.
- On ne demande plus un poste au repos. On ne tue ni ne suspend aucun processus de l'auteur.
- Un seuil encore manqué, ou impossible à juger sur ce poste, se rapporte à l'auteur avec ses chiffres, sans décision à sa place.

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
- Environnement : `.venv` (Python 313 de `C:\Python313`, ne pas le reconstruire) et `node_modules` sont installés dans le worktree (pas de jonction). Le worktree hérite du `.env` du dépôt principal : tout serveur lancé (config Playwright comprise) doit avoir `OPENAI_API_KEY` vide et `HEALTH_CHECK_LLM_PING=false` ; ne pas lancer `playwright.config.ts` sans ces deux variables. Ne pas réutiliser un serveur déjà ouvert sur 3000/4243/4173 (il peut venir d'un autre worktree). Ni commit ni push à l'implémentation.

## Protocole de mesure (à écrire dans la story, 20.7 le reprend)

- Passages alternés avant / après (« avant » = commit `6303200fb`, construit à part), au moins 5 passages chacun ; chiffre retenu : médiane des p95 par passage, avec le minimum et le maximum.
- Charge consignée à chaque passage (cœurs occupés par les autres processus).
- Temps de travail du fil principal par image (ou par frappe) lu dans la trace : indicateur peu sensible au geste scripté et à la charge.
- Témoin : le même geste scripté sur un graphe de 2 répliques donne le plancher de la mesure du glisser et de la frappe sur ce poste.
- Verdict asymétrique : la charge ne fait que dégrader, donc un seuil tenu sous charge est tenu ; un seuil manqué sous charge, alors que le témoin ou le travail par image montrent que la mesure est dominée par la charge ou le geste, est « non jugeable », jamais « manqué » ni « tenu ».
- Images au zoom : « aucune image sautée » se compare à la cadence au repos mesurée dans le même passage : p95 ≤ max(16,7 ; cadence au repos) + 0,5 ms, la cadence du navigateur headless variant (16,7 ou 17,6 ms observées).
- Navigateur en headless seulement, GPU vérifié ; aucune fenêtre.

## Tasks & Acceptance

**Reprise après renégociation :**
- [x] Harnais : protocole ci-dessus (alternance avant / après, charge, témoin, travail par image).
- [x] Profiler avant de corriger : traces du glisser vue ajustée (10 %), puis du glisser et de la frappe à 100 % ; consigner les causes avec leurs temps. Pistes non vérifiées : projection des nœuds recalculée à chaque image (`GraphCanvas` enrichit les 500 nœuds), `utils/edgeRouting.ts` qui cherche un coude hors des nœuds pour chaque lien, re-rendu de toutes les cartes, tâches longues de 54 à 57 ms observées.
- [x] Optimiser sans dégradation visible, drapeau éteint inchangé ; avant / après chiffrés ; captures aux trois paliers identiques à l'œil.
- [x] Réécrire la décision avec ses mesures. Si tous les seuils tiennent : plan A, et retirer les ajustements « plan B » d'`epic-20.md` et du README § 15 (la décision 1 reste « prise », confirmée par 20.2). Sinon : ne pas trancher, rapporter.

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

### Décision : plan A (cartes de 360 px), après la reprise du 2026-11-27

Tous les seuils sont tenus sur le prototype à 360 px, au sens du protocole (médiane des p95 sur 5 passages), sans
changement de rendu ni de contenu. Les ajustements « plan B » d'`epic-20.md` (20.7, 20.8) et du README § 15 sont
retirés ; le critère de perf de 20.7 reste et renvoie au protocole. Elle remplace la décision « plan B » de la
première mesure (commit `6303200fb`).

Réserves, dans l'ordre :

- **Le glisser en vue ajustée a peu de marge** : 192,2 ms pour 200, plancher du geste à 181,9 ms. Deux passages sur
  cinq le dépassent (331 et 351 ms), ceux où d'autres processus occupaient 16 à 22 cœurs avec le GPU sollicité.
- **Le glisser à 100 % (185,5 ms) est à son plancher** : le témoin de 2 répliques fait 181,9 ms. La mesure est celle
  du geste scripté (dix déplacements, une image chacun), pas du graphe.
- **Du travail est sorti de la fenêtre mesurée, il n'a pas disparu.** La validation d'après enregistrement attend une
  seconde sans modification, puis bloque le fil jusqu'à ~100 ms (tâche la plus longue de la trace de frappe : 99 ms).
  Les gestes du harnais s'enchaînent plus vite que ce délai. Une touche tombant dans ce bloc attendrait jusqu'à autant.
- Ces seuils tiennent **sur le prototype** (drapeau actif) : le graphe actuel est inchangé.

### Mesures finales (ms ; médiane des p95 par passage [min – max], 5 passages de chaque, alternés)

« Avant » = `6303200fb` construit à part. Build de production, 500 cartes sans nœuds de test, 20 répétitions par
passage (40 frappes).

| Mesure | Seuil | Après | Avant | Témoin 2 répliques (après) | Verdict |
|---|---|---|---|---|---|
| Première ouverture | < 3 000 | 2 166 [1 971 – 2 497] | 2 064 [1 945 – 2 303] | | tenu |
| Ouverture suivante | < 3 000 | 1 184 [1 115 – 1 661] | 1 601 [1 277 – 1 922] | | tenu |
| Frappe | < 100 | **20,1** [14,7 – 60] | 108,7 [91,8 – 120,5] | 19,1 | tenu |
| Glisser à 100 % | < 200 | **185,5** [183,9 – 201,8] | 231,9 [215,8 – 374,5] | 181,9 | tenu |
| Glisser, vue ajustée (10 %) | < 200 | **192,2** [185,4 – 350,6] | 349,8 [333,5 – 531,3] | 181,9 | tenu |
| Images au zoom 100 → 20 % | cadence au repos + 0,5 | 16,8 (repos 16,7) | 16,8 | | tenu |
| Tâche longue au zoom | <= 50 | aucune | aucune | | tenu |

Travail du fil principal lu dans la trace (médiane, après / avant) :

| | Après | Avant | Témoin (après) |
|---|---|---|---|
| Par image du glisser, 100 % | 4,5 | 8,5 | 2,8 |
| Par image du glisser, vue ajustée | 9,0 | 20,3 | |
| Par glisser, enregistrement compris, vue ajustée | 180 | 444 | |
| Par frappe, enregistrement compris | 41 | 126 | 18 |
| Par image du zoom (borne haute) | 2,9 | 3,5 | |

Charge consignée (cœurs occupés par d'autres processus, page au repos) : médiane 4 à 7 selon l'étape, jusqu'à 28,5 ;
GPU de 0 à 99 %. Sources : `tmp/perf-20-2/run-2026-11-27T17-09-09-662Z/` (non versionné).

Le passage « avant 1 » a échoué deux fois à la réouverture (« Graphe non affiché en 90 s ») avant de passer au
troisième essai, rejoué dans le même dossier après les autres passages : l'alternance n'est pas respectée pour lui,
et la cause de l'échec, vue sur le seul build de référence, n'est pas établie.

Pour information : serveur de développement, un passage : ouvertures 2 773 et **3 168**, frappe 41, glisser 197 et
**257** (plancher 196, headless à 17,6 ms ce passage-là). Avec les nœuds de test actuels (un passage, avant la
dernière optimisation) : ouvertures 2 788 et 1 759, frappe 18, glisser **7 026** et **10 207** : les voies courtes
exigent l'absence de barres de test, 20.8 doit donc les retirer.

### Confirmation après les correctifs de la relecture (frappe et glisser, 5 passages, `PERF_STRICT=1` vert)

| Mesure | Seuil | Médiane [min – max] | Témoin 2 répliques |
|---|---|---|---|
| Frappe | < 100 | 16,3 [14,3 – 40,6] | 18,1 |
| Glisser à 100 % | < 200 | 196,6 [196,3 – 213,8] | 197 |
| Glisser, vue ajustée | < 200 | 197,8 [197,4 – 249,8] | 197 |

**La marge au chiffre n'est que de 2 à 3 ms, et elle ne dépend pas du graphe** : le même geste sur 2 répliques
fait 197 ms dans ce lancement (182 dans le précédent ; la cadence au repos du navigateur headless varie de 16,7 à
17,6 ms). La marge propre à l'application se lit dans le travail par image : 3,5 ms à 100 %, 6,8 ms en vue ajustée,
pour une image de 16,7 ms. Si la cadence du navigateur ralentit encore, le geste scripté dépasse 200 ms à lui seul
et le protocole doit le dire « non jugeable ». Ouvertures et zoom non remesurés (non touchés par les correctifs).
Le passage 1 a d'abord échoué à l'ouverture (« Graphe non affiché en 90 s »), puis réussi rejoué seul, hors ordre.
Source : `tmp/perf-20-2/run-2026-11-27T18-57-20-982Z/` (non versionné).

### Causes trouvées au profil (avant correction)

Profils CPU et traces sur le build non minifié, 6 glissers et 40 frappes.

- **Glisser en vue ajustée** (28 cartes montées) : ~270 ms de fil par glisser, soit ~27 ms par déplacement, donc deux
  images par déplacement. Chaque image écrivait dans le store du graphe : tous ses abonnés se redessinaient (en-tête,
  badge de santé, liste des dialogues, filtres), le canvas reconstruisait les 500 nœuds et toutes les cartes montées
  se redessinaient. Plus ~15 ms de copie d'annulation au premier déplacement.
- **Glisser à 100 %** : le geste tenait dans les images (~77 ms de fil par glisser). La queue venait de la chaîne qui
  suit le lâcher : journal IndexedDB (~28 ms, deux fois), enregistrement (~44 ms), validation (~90 à 105 ms), qui
  débordait sur le geste suivant.
- **Frappe** : la même chaîne à chaque touche. Sur 3 931 ms de fil profilées : relecture et réécriture du journal
  1 260 ms, envoi XHR 687 ms, sérialisation JSON 336 ms.
- Pistes écartées : `utils/edgeRouting.ts` ne s'exécute pas en `LR` (il ne traite que les liens bas → haut).

### Optimisations (toutes sous le marqueur du layout de prototype)

1. Positions du glisser en cours dans `graphViewStore.dragPositions`, appliquées par le canvas seul ; le store du
   graphe les reçoit en une écriture au lâcher (`moveNodes`), sous-arbre compris. **Écart à la lettre d'ADR-007** :
   les nœuds viennent toujours d'un store, mais pas seulement de `useGraphStore` pendant le geste.
2. Journal local différé à une seconde sans modification (10 s au plus), écrit aussitôt si la page est masquée ou
   quittée (`utils/quietWork.ts`). L'enregistrement automatique, lui, n'est pas différé.
3. Validation d'après enregistrement différée d'autant : badges et compteurs suivent avec une seconde de retard, et le
   message d'un enregistrement forcé peut citer les compteurs précédents.
4. Copie d'annulation sans repasser par le texte JSON (`utils/cloneJson.ts`, même résultat, testé).
5. Nœuds du canvas inchangés réutilisés (`utils/reuseUnchanged.ts`) : une sélection ou un déplacement ne redessine
   que les cartes touchées. Mesure intermédiaire sans ce point : vue ajustée à 198,4 ms [189,1 – 204,3].

Rendu : captures aux six vues (ajustée, écrire, sélectionnée, en écriture, lire, situer) comparées entre les deux
builds, **0 pixel différent** (`tmp/perf-20-2/captures-reprise/`).

### Rejouer le protocole (20.7)

1. Construire la référence à part, au commit de référence : `vite build --outDir <dossier absolu>` depuis `frontend/`.
2. `PERF_BEFORE_DIST=<dossier> PERF_VARIANTS=cards PERF_STRICT=1 npm run test:perf:graph` (environ 50 min).
3. Lire `tmp/perf-20-2/run-<date>/resume.json` : médianes, étendues, charge, témoin et verdicts.

Ajouts au harnais pour le protocole : le témoin joue les mêmes gestes à 100 % (un graphe de 2 répliques ajusté y est
déjà), et un `input` sans touche enfoncée (le « é » inséré par Playwright) n'est plus mesuré depuis la touche
précédente. La définition du glisser n'a pas changé.

### Poste

AMD Ryzen 9 7950X, 191 Go, Windows 10.0.26300, NVIDIA GeForce RTX 5090. Chrome 158, nouveau headless (aucune
fenêtre), 1900 × 950, facteur d'échelle 1, rendu matériel vérifié par le harnais. Limite : en headless la cadence de
60 Hz est celle du navigateur, pas celle de l'écran.

Graphe : 500 répliques, 2 003 réponses dont 1 234 testées, répliques médiane 697, p90 1 332, max 2 437 caractères. La
disposition `LR` mesure 6 760 × 219 190 px : même au zoom minimal (10 %), « Ajuster » ne montre pas tout le graphe.

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
- Reprise du journal IndexedDB après un plantage en prototype puis drapeau éteint : non vérifiée (aucun code de
  production ne relit ce journal aujourd'hui).
- Le harnais n'a pas de mesure du glisser d'un grand sous-arbre (la carte du milieu en a peu).
- La carte du prototype ne porte pas Accepter / Rejeter / Régénérer, « Voir le prompt » ni l'aperçu des conditions.

## Spec Change Log

- 2026-11-27 (reprise) : seuils tenus, décision plan A ; ajustements « plan B » retirés. Hors du périmètre, corrigé en
  route : `e2e/documents-layout-adr008.spec.ts` attendait le formulaire sans passer par « éditer » (3 tests en échec
  aussi sur les sources de départ).

- 2026-11-27 (réponse de l'auteur à la question A ou B) : voir « Renégocié par l'auteur » ; ajout du protocole de mesure et des tâches de reprise. À CONSERVER : prototype, drapeau, graphe de 500 répliques, tests et correctifs de la relecture (commit `6303200fb`).

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

Relecture de la reprise du 2026-11-27 (diff non commité). VG2x = trous de vérification, BH2x = revue aveugle, EC2x = cas limites.

| # | Constat | Verdict | Preuve et route |
|---|---|---|---|
| VG21 | `PERF_STRICT` passe quand une mesure jugée manque | medium | `summarize` retire le critère sans valeur ; patch |
| VG22 | Cache de nœuds non testé pour les cycles et la couleur entrante | medium | aucune assertion ; patch |
| VG23 | Glisser du rectangle de sélection jamais écrit au store | high | `selectionOnDrag` actif, pas de `onSelectionDragStop` ; positions perdues ; patch |
| BH21 | = VG23 (et flèches clavier) | high | même cause ; patch |
| BH22 | `dragPositions` sans autre sortie (chargement, annulation en cours de geste) | low | souris tenue, vidé au lâcher et au démontage ; gardes à ajouter ; rejeté |
| BH23 | Un accusé tardif efface une attente plus récente déjà écrite | low | `acknowledgeSnapshot` met toujours `pending = null`, comme avant la story ; journal jamais relu ; commentaire faux, patch |
| BH24 | Écriture au masquage de page non garantie | low | IndexedDB asynchrone comme avant ; journal jamais relu ; rejeté |
| BH25 | La validation différée tombe pendant une saisie reprise | medium | la frappe ne la repousse pas ; patch |
| BH26 | = VG21 | medium | patch |
| BH27 | « Non jugeable » ne regarde que le témoin, à 100 % | low | n'agit que sur un seuil manqué, aucun ici ; correction non triviale ; rejeté |
| BH28 | Seuil de zoom formulé « max(16,7 ; repos) + 0,5 » | low | 16,8 mesuré tient aussi la formule d'origine (17,2) ; le correctif est dans cette spec ; rejeté, dit à l'auteur |
| BH29 | 20.7 infaisable avec les nœuds de test actuels | medium | 7 à 10 s mesurées, retrait en 20.8 ; patch |
| BH2a | Passage de relais 20.7 incomplet | medium | surcouche, réutilisation et copie omises ; patch |
| BH2b | Test `cloneJson` en `toEqual` ; tableaux creux, BigInt | low | `toStrictEqual`, patch ; ces valeurs n'existent pas dans un dialogue, rejetées |
| BH2c | `moveNodes` écrit même sans déplacement | low | objets neufs sans marquage « modifié » ; garde à ajouter ; rejeté |
| BH2d | Écart à ADR-007 consigné dans la seule spec | medium | différé (`deferred-work.md`) |
| BH2e | Indentation du harnais | low | sans effet ; rejeté |
| BH2f | README § 15 : « mesure ci-dessus » ambiguë, réserves absentes | low | correction directe ; patch |
| EC21 | = VG23 | high | patch |
| EC22 | = BH22 | low | rejeté |
| EC23 | Accusé en échec : l'attente suivante n'est pas écrite | low | journal jamais relu, branche à ajouter ; rejeté |
| EC24 | = BH23 | low | patch (commentaire) |
| EC25 | = BH24 | low | rejeté |
| EC26 | Validation différée après `resetGraph` | medium | même fermeture que BH25 ; patch |
| EC27 | = BH25 | medium | patch |
| EC28 | `PERF_PASSES` nul ou invalide : aucun passage, vert | medium | patch avec VG21 |
| EC29 | = VG21 | medium | patch |

## Verification

**Commands:**
- `npm --prefix frontend run lint` et `npm --prefix frontend run typecheck` -- zéro erreur
- `PERF_STRICT=1 npx playwright test -c playwright.perf.config.ts` -- chiffres produits
- `npm run test:premerge` -- vert avant la PR

**Manual checks:**
- App sans LLM, drapeau actif : captures aux trois paliers, comparées aux boards.
