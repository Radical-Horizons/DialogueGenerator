## Epic 18: Édition in-situ du dialogue dans le nœud

**Status:** backlog — stories **18.1–18.11**
**Révisée le 2026-10-01** après audit d'implementation readiness ([rapport](../implementation-readiness-report-2026-10-01.md)). La première rédaction portait 8 bloquants, dont une décision de cadrage appuyée sur une bibliothèque absente du projet. Les corrections sont tracées en fin de fichier.

Les auteurs peuvent lire et écrire le dialogue complet — **réplique PNJ et réponses PJ** — directement dans le nœud sur le canvas, par **simple clic dans le texte**, sans ouvrir le panneau de droite et **sans aucune action d'enregistrement**. Le panneau de droite reste disponible pour ce qui ne tient pas dans un nœud (conditions de visibilité, effets, skill checks, métadonnées).

**FRs covered:** FR122 (édition réplique in-situ), FR123 (réplique intégrale en densité dépliée), FR124 (réponses PJ éditables en lignes), FR125 (speaker + titre in-situ), FR126 (éditer = sauvegarder), FR127 (source unique nœud ↔ panneau), FR128 (clavier + tactile)

**NFRs covered:** NFR-P1 (rendu 500+ nœuds < 1 s), NFR-P4 (interaction < 100 ms), NFR-A1 (navigation clavier), NFR-A3 (ARIA / lecteurs d'écran), **NFR-R3** (Data Loss Prevention)

> ⚠️ **NFR-R2 n'est pas « zéro perte »** — c'est *System Uptime >99 %* (`prd/non-functional-requirements.md:241`). L'exigence de non-perte est **NFR-R3 Data Loss Prevention** (`:260`). La première rédaction citait R2 six fois à tort. Aucune story de cette epic ne touche à l'uptime.

**UX-DRs covered:** UX-DR1 à UX-DR12 — **définies dans `requirements-inventory.md` § UX Design Requirements**, pas dans cette epic.

**Valeur utilisateur:** Supprimer l'aller-retour canvas → panneau droit → canvas pour l'opération la plus fréquente de l'outil : écrire une réplique et écrire les réponses qui en découlent. Le nœud cesse d'être une vignette de consultation ; il devient le lieu d'écriture.

**Dépendances:** Epic 2 (éditeur de graphe) · Epic 16 / ADR-008 (`choiceId` stables) · **Epic 14** (tokens de focus story 14.2, ARIA story 14.4 — cette epic *anticipe* Epic 14, voir D5) · **Epic 12** (aide clavier story 12.3, arbitrage `Échap`) · **Epic 17** (story 17.4 viewport dynamique, livrée). **Aucune dépendance sur Epic 19** — cette epic est livrable et utile seule.

**Référence de cadrage:** [`research/ux-edition-in-situ-articy-notion-2026-10-01.md`](../research/ux-edition-in-situ-articy-notion-2026-10-01.md) — analyse Articy:draft X et éditeurs sans mode (Notion, Confluence).

---

## Intention produit — « écriture d'abord, lecture friendly »

À ne pas confondre avec un mode « lecture d'abord ». L'intention du produit est et reste **l'écriture d'abord** ; l'effort de la refonte 2026 a porté sur la **lisibilité** du résultat, pas sur l'introduction d'une étape de consultation préalable.

Cette epic **prolonge** cette intention : elle amène l'écriture là où l'auteur regarde déjà, le canvas. La vue résumée de l'inspecteur (`GraphInspectorNodeSummary`) reste ce qu'elle est — une lecture agréable — et le formulaire complet du panneau reste la surface des champs denses.

Conséquence directe, à trancher une fois pour toutes : **`requestNodeEdit` route désormais vers l'in-situ.** Aujourd'hui, créer un nœud à la main ouvre le **panneau** en édition (`useGraphToolbarMenuItems.tsx:124` → `GraphEditor.tsx:123-133`). Avec l'in-situ, deux éditeurs seraient actifs sur le premier geste de l'auteur. Le curseur va dans le nœud ; le panneau ne s'ouvre plus automatiquement en édition. Story **18.9**.

---

## Décisions de cadrage (figées — ne pas rouvrir en story)

### D1 — Activation au **clic simple**, pas au double-clic

Le double-clic est déjà attribué **quatre** fois : focus nœud avec `fitView` animé (`useReactFlowHandlers.ts:260-262`, Epic 2 story 2.3), zoom canvas par défaut de React Flow (`zoomOnDoubleClick` non surchargé), édition du label d'arête (`edges/StableLabelSmoothStepEdge.tsx`, Epic 2 story 2.13), et ouverture du panneau d'édition (`epic-01.md:301`, story 1.5).

> ⚠️ **Correction.** La première rédaction affirmait que le double-clic ouvre l'`AIGenerationPanel`, en citant `ux-consistency-patterns.md:105`. **C'est faux dans le code** : `onNodeDoubleClick` est câblé sur `focusNode`, et rien dans le dépôt n'ouvre l'`AIGenerationPanel` au double-clic. La spec UX est périmée sur ce point. La conclusion (clic simple) tient — pour une raison pire : le double-clic est un geste d'édition de texte normal (sélectionner un mot) qui déclencherait un recentrage animé de 300 ms.

**Le clic simple n'est pas libre pour autant** — il porte déjà la sélection (`useReactFlowHandlers.ts:252-258`) et, selon `ux-consistency-patterns.md:104`, l'alimentation du panneau. Arbitrage : le clic dans le texte **sélectionne le nœud et place le curseur**, et **n'ouvre pas** le panneau en édition. Si le panneau est déjà ouvert, il suit la sélection en vue résumée.

**Nœud non sélectionné** (interaction D1 × D3) : cliquer un nœud en densité résumé le sélectionne et le déplie — le texte se reflow, la position de clic ne désigne plus rien. **Premier clic** = sélection + dépliage, curseur **en fin de réplique**. **Second clic** = placement du curseur à l'endroit cliqué. Ne pas tenter de projeter la position du premier clic sur le texte reflowé.

**Guillemets :** `DialogueNode.tsx:604` ajoute `« … »` **au rendu**, pas dans la donnée. Ils restent **hors de la zone éditable** — gratuit avec D4.

### D2 — `Échap` **quitte** le champ ; l'annulation est une story à part entière

ADR-006 interdit le brouillon : le texte est poussé au store à la saisie. `Échap` fait le même flush que toute autre sortie de champ, puis rend le focus au nœud.

> 🔴 **Correction majeure.** La première rédaction justifiait ce refus du brouillon par *« l'annulation, c'est `Ctrl+Z` sur la pile undo existante (zundo) »*. **Les trois affirmations sont fausses**, vérifiées :
> - **`zundo` n'est pas dans ce projet** — absent de `frontend/package.json`, zéro occurrence dans `src/`. L'undo est maison : `undoSlice.ts`, `MAX_UNDO_SNAPSHOTS = 50` (`:9`).
> - **`updateNode` n'est pas une transaction** — `nodeSlice.ts:489` fait un `set()` nu + `markDirty()`, sans `runGraphTransaction` ni `_pushUndoSnapshot`. Les éditions de champ ne sont **pas** dans la pile undo, aujourd'hui comme avant cette epic.
> - **`ctrl+z` n'est pas autorisé dans les champs** — `useKeyboardShortcuts.ts:148` : `allowedInInputs = ['ctrl+s','ctrl+e','ctrl+k','ctrl+shift+f','ctrl+alt+f','escape','ctrl+/']`.
>
> Le troc proposé par D2 — « pas de brouillon en échange de `Ctrl+Z` » — portait donc sur une contrepartie inexistante. **D2 n'est valide qu'accompagnée de la story 18.4**, qui construit l'annulation. ADR-006 n'est pas en cause ; c'est la contrepartie qui manquait.

**`Échap` doit `stopPropagation`.** `escape` figure dans `allowedInInputs`, donc les handlers globaux tirent depuis un champ : sur viewport étroit, `Dashboard.tsx:475-487` replie le panneau latéral. Sans arrêt de propagation, `Échap` dans une réplique replie un panneau au lieu de sortir du champ.

### D3 — Dépliage sur **sélection unique**, sans seuil de zoom

Le nœud **résume** par défaut et **déplie** réplique intégrale + réponses quand il est **le seul nœud sélectionné**.

> ⚠️ **Correction.** La première rédaction ajoutait « ou au-delà d'un seuil de zoom » et affirmait « maquette inchangée ». Les deux posaient problème :
> - **La maquette dessine le nœud SÉLECTIONNÉ, et le dessine en résumé** (`docs/design/refonte-ui-2026/etats-2a-2e.dc.html:144-157` ; structure figée dans `README.md:109-119`). « Maquette inchangée » était faux exactement à l'état choisi comme déclencheur.
> - **Le seuil de zoom cassait trois choses** : hors sélection, tous les nœuds sont à `z = 0` et se recouvrent dans l'ordre du DOM (`elevateNodesOnSelect` ne donne `z = 1000` qu'au nœud sélectionné) ; lire le zoom depuis chaque nœud re-render tout le graphe à chaque frame ; et un pinch sur tablette replierait le nœud **en cours de saisie**.
>
> **Le seuil de zoom est supprimé.** Un seul déclencheur, la sélection unique. Le dépliage par zoom n'apportait rien que la sélection n'apporte, et coûtait trois défauts.

**Garde sélection multiple :** le dépliage n'a lieu que si **exactement un** nœud est sélectionné. Un lasso sur dix nœuds (`selectionOnDrag`, `GraphCanvas.tsx:675`) ne doit pas monter dix champs éditables.

**Géométrie chiffrée** — la première rédaction renvoyait à une « hauteur maximum documentée » qui ne l'était nulle part :

| Grandeur | Valeur | Source / justification |
|---|---|---|
| **Largeur** | **280 px**, inchangée au dépliage | `NODE_WIDTH = 280` (`DialogueNode.tsx:98`) et `component-strategy.md:12`. ⚠️ `README.md:109` annonce 220 px — **c'est le README qui est faux**, à corriger. Croissance verticale uniquement. |
| **Hauteur résumé** | inchangée | `minHeight: 120` (`DialogueNode.tsx:386-410`) |
| **Hauteur déplié** | **max 440 px**, scroll interne au-delà | Sous le `maxHeight: 500` actuel, pour préserver la marge des overlays `pending` (`:810-919`, `CONTENT_PADDING_TOP_WHEN_PENDING = 32` à `:103`) |

### D4 — `<textarea>` auto-grandissant, pas `contentEditable`

Décision d'implémentation, inscrite dans l'epic pour ne pas être rouverte en revue. Quatre raisons convergentes :

1. **Collage.** Un `contentEditable` reçoit du HTML brut (`<b>`, `<span style>`) quand on colle depuis Word. Un `<textarea>` reçoit du texte plat, gratuitement.
2. **Position du curseur.** Chaque écriture reprojette tout le graphe (`nodeSlice.ts:153,185-186`), donc chaque frappe re-render le nœud. Un `contentEditable` contrôlé perd le curseur à chaque re-render ; un `<textarea>` non contrôlé ne le perd pas.
3. **Appui long tactile.** `useGraphContextMenuLongPress.ts:72` exempte déjà `input, textarea, select…` mais **pas `[contenteditable]`** — un `<textarea>` passe sans correctif.
4. **Guillemets.** Les `« »` ajoutés au rendu (`:604`) restent naturellement hors de la zone éditable, comme D1 l'exige.

Note : `isInputDOMNode` de React Flow 11.11.4 protège les deux aussi bien (`hasAttribute('contenteditable')` testé explicitement, et `actInsideInputWithModifier: false` bloque même `Ctrl+Backspace`). Ce n'est donc pas la protection clavier qui tranche, mais les quatre points ci-dessus.

### D5 — Clavier : pattern composite ARIA. `Tab` reste à Epic 14

> ⚠️ **Correction.** La première rédaction attribuait `Tab` aux champs du nœud, alors que la story 14.1 l'attribue à la navigation **entre** nœuds. Son AC de sortie invoquait « un nœud explicitement en édition » — un état que D1 et D2 suppriment précisément. Le conflit était réel et non résolu.

**Arbitrage — le nœud est un *composite widget* au sens ARIA :**

| Geste | Effet |
|---|---|
| `Tab` / `Shift+Tab` sur le canvas | Navigue **entre nœuds**. Sémantique d'Epic 14 story 14.1, **inchangée**. Un nœud = un seul arrêt de tabulation. |
| `Enter` sur un nœud focalisé | **Entre** dans la chaîne de champs, curseur en fin de réplique |
| `Tab` / `Shift+Tab` dans la chaîne | Circule entre les champs : Titre → Speaker → Réplique → Réponse 1 → … → Réponse N |
| `Échap` | **Sort** de la chaîne, focus rendu au nœud (`stopPropagation`, cf. D2) |

Ce n'est **pas** un retour au mode édition : le texte est toujours enregistré à chaque frappe, il n'y a jamais de brouillon. L'entrée explicite existe uniquement parce que `Tab` est une ressource partagée avec Epic 14 — exactement le compromis des grilles ARIA. À la souris, aucun mode : on clique dans le texte et on écrit.

**`Ctrl+Tab` est supprimé de l'epic.** Articy en a besoin parce que son champ capture `Tab` ; un `<textarea>` ne le capture pas — `Tab` y déplace le focus nativement. De plus `Ctrl+Tab` est réservé par le navigateur (changement d'onglet) et `preventDefault` ne le reprend pas de façon fiable sur Firefox. Les retours à la ligne dans la réplique se font par `Enter`, qui n'a pas d'autre rôle une fois dans la chaîne.

---

## ⚠️ GARDE-FOUS — Vérification de l'Existant (Scrum Master)

**OBLIGATOIRE avant création de chaque story.** Toutes les lignes ci-dessous ont été vérifiées le 2026-10-01 — celles de la première rédaction étaient décalées.

1. **Troncature actuelle** : `DialogueNode.tsx:195` (`line.length > 100 ? line.substring(0, 100)…`) et rendu `:604`. Le pied mono `N RÉPONSES` est `:606-629` ; le tooltip de choix `:631-636`.
2. **Handles de choix** : identifiant `choice:${choiceId}`. **Ne doit pas changer.** Aucun couplage de la donnée à `Position.Bottom` (`graphEdgeBuilders.ts:193-195` : `e:{sourceId}:choice:{stableChoiceId}` ; `documentToGraph` reconstruit depuis `choices[]`). Le risque sur les arêtes est **faible** — la première rédaction le surestimait.
3. **Écrire sans copie périmée.** La règle n'est pas « jamais de spread » — c'est **« ne jamais écrire depuis une copie complète périmée »**. `updateNode(id, {data:{line}})` est **sûr** : `updateDialogueNodeInDocumentSoT` patche champ par champ (`nodeSlice.ts:160-169`, `if (data.line !== undefined) docNode.line = data.line`). Pour le texte d'une réponse, reconstruire `choices` depuis le tableau **courant du store** avec un seul `text` changé — `targetNode`, `choiceId` et `test*Node` sont préservés par construction. `mergeDialogueNodeFormIntoStoreData()` (`mergeNodeEditorForm.ts:18-69`) attend un `DialogueNodeData` complet et **n'est pas appelable depuis le nœud** : ne pas chercher à l'utiliser là.
4. **React Flow et le clavier** : `deleteKeyCode` est absent du bloc de props (`GraphCanvas.tsx:638-683`) et **n'a pas besoin d'être configuré** — `isInputDOMNode` protège `input`, `textarea` et `contenteditable`. Le vrai danger est maison : `useGraphToolbar.ts` enregistre `delete`, protégé par `useKeyboardShortcuts.ts:141-157` ; mais `escape` est dans `allowedInInputs` (`:148`) et tire depuis un champ.
5. **Synchro descendante absente** : `NodeEditorPanel.tsx:263` garde `reset` derrière `selectionChanged`, et l'effet d'empreinte (`:303-336`) ne hache que les champs de connexion (`mergeNodeEditorForm.ts:158-172` — `targetNode`, `test*Node`, `nextNode`, `visibilityConditions`, `choiceEffects` ; **ni `line`, ni `speaker`, ni `title`, ni `choices[].text`**). Il n'existe **aucun** chemin store → formulaire pour les champs texte à sélection constante. C'est le trou de la story 18.3.
6. **Undo absent sur les champs** : `updateNode` (`nodeSlice.ts:489`) ne pousse aucun snapshot. `cloneSnapshot` (`undoSlice.ts:18-34`) deep-clone tous les nœuds + le document + le layout, et `MAX_UNDO_SNAPSHOTS = 50` (`:9`) — une révision par flush effacerait tout l'historique structurel en 5 secondes de frappe. C'est le chantier de la story 18.4.
7. **Gestes du nœud à neutraliser** : clic droit (`DialogueNode.tsx:371-378`, `preventDefault` tue le menu natif), double-clic (`useReactFlowHandlers.ts:260-262` → `fitView` 300 ms), `title={NODE_DRAG_TOOLTIP}` (`:385`, s'affiche pendant la frappe), appui long tactile (`useGraphContextMenuLongPress.ts:72`, handlers en capture).
8. **Perf** : le re-render global **existe déjà** (`nodeSlice.ts:153,185-186` + `DialogueNode.tsx:177` qui souscrit `state.nodes` en entier). Harnais de mesure déjà livré par la story 16.6 : `e2e/perf-document-load.spec.ts`, p95 **load / drag / frappe**, seuils dans `docs/architecture/adr-008-perf-targets.md`. **Mesurer, pas affirmer.**
9. **Pas de doublon d'epic** : Epic 14 garde `Tab` entre nœuds et les tokens de focus ; Epic 17 garde le responsive global ; Epic 12 garde les raccourcis et l'aide clavier. Cette epic ne traite que l'intérieur du nœud — et **anticipe** Epic 14 sur l'ARIA des champs in-situ (à déclarer, pas à re-spécifier plus tard).

---

### Story 18.1: Densité adaptative, réplique intégrale et titre rendu (FR123)

As a **auteur de dialogues**,
I want **voir la réplique PNJ en entier et le titre du nœud que je travaille, sans que le graphe entier devienne illisible**,
So that **je peux juger le texte sans ouvrir le panneau de droite ni survoler quoi que ce soit**.

**Objectif US (vérification existant):** `DialogueNode.tsx:195` tronque à 100 caractères. La hauteur est **déjà** adaptative (`:386-410` `minHeight:120` / `maxHeight:500`, zone de contenu `:600-601` en `flex:'1 1 auto'`) — il n'y a aucune hauteur fixe à défaire. Le titre (`data.title`) n'est **pas rendu** : `:133` ne l'utilise que pour l'attribut `title=` de l'infobulle du speaker (`:565`). Le rendu du titre appartient à cette story, pas à 18.7.

**Acceptance Criteria:**

**Given** un nœud non sélectionné, ou plusieurs nœuds sélectionnés
**When** le graphe est rendu
**Then** le nœud affiche la densité **résumé** conforme à la maquette 2026 — speaker, réplique abrégée, `N RÉPONSES · N flags`
**And** aucune régression visuelle par rapport à l'état actuel

**Given** un nœud **seul sélectionné** (D3)
**When** le nœud est rendu
**Then** la réplique est affichée **intégralement**, sans troncature
**And** le titre du nœud est rendu dans l'en-tête
**And** la largeur reste **280 px** et la hauteur croît jusqu'à **440 px**, puis le contenu **scrolle à l'intérieur du nœud**
**And** la molette au-dessus de la zone scrollable ne zoome **pas** le canvas (classe `nowheel`)

**Given** un nœud déplié dont les voisins sont proches
**When** il grandit
**Then** il passe au-dessus d'eux via `elevateNodesOnSelect` (z = 1000, acquis sans code) et **ne les déplace pas**
**And** au retour en résumé il reprend exactement son encombrement initial
**And** aucun re-layout automatique n'est déclenché par un changement de densité

**Given** la densité dépliée
**When** le nœud est rendu
**Then** la typographie respecte les tokens de la refonte 2026 — serif pour la réplique (`:594`), mono pour les métadonnées (`:615`) — et l'échelle d'espacement du design system

**Given** le harnais de perf de la story 16.6 (`e2e/perf-document-load.spec.ts`)
**When** je l'exécute avant et après la story sur la fixture confort (< 500 nœuds, 4 choices)
**Then** **p95 load et p95 drag ne régressent pas** au-delà des seuils de `docs/architecture/adr-008-perf-targets.md`
**And** `DialogueNode.tsx:177` ne souscrit plus `state.nodes` en entier (lecture par `useGraphStore.getState()` au moment de l'appel) — correctif d'une ligne, prérequis de toute la suite
**And** `transition: 'all 0.2s ease'` (`:405`) est remplacé par une transition sur propriétés nommées, pour éviter la rafale de `ResizeObserver` à chaque bascule de densité

**Livrables documentaires (UX-DR1, UX-DR7) :**
- Réviser `etats-2a-2e.dc.html` **bloc 2e** : le nœud `SÉLECTIONNÉ` (`:144-157`) devient la variante dépliée ; l'annotation `:251` devient « le nœud dit trois choses **au repos** ; sélectionné, il dit tout ».
- Réviser `README.md` §F (`:109-119`) : ajouter la densité dépliée, la hauteur max, **et corriger la largeur 220 → 280 px**.
- Poser une levée d'ambiguïté dans `.claude/rules/ui_redesign_2026.md`, sur le modèle de celles de `design-system-foundation.md:66-69`. **Sans elle, la règle continue d'imposer la fidélité à un écran révisé** — elle se charge automatiquement sur `frontend/src/**`.

**Dimensionnement :** 2 sessions.

**References:** FR123, NFR-P1, NFR-P4, UX-DR1, UX-DR3, UX-DR7, D3, garde-fous 1 et 8

---

### Story 18.2: Réponses PJ affichées en lignes dans le nœud (FR124 — lecture)

As a **auteur de dialogues**,
I want **lire le texte de chaque réponse joueur directement dans le nœud déplié**,
So that **je peux juger la cohérence réplique ↔ réponses d'un seul regard, sans survoler les pastilles une par une**.

**Objectif US (vérification existant):** le texte des réponses n'est accessible qu'en **tooltip au survol d'un handle** (`DialogueNode.tsx:631-636`). Le nœud n'affiche qu'un compteur. **Lecture seule** ici ; l'édition arrive en 18.6.

**Acceptance Criteria:**

**Given** un nœud déplié avec N réponses
**When** le nœud est rendu
**Then** chaque réponse apparaît comme une **ligne** du corps du nœud, dans l'ordre de `choices[]`
**And** la distinction visuelle **réplique PNJ / réponses PJ** reste immédiatement lisible (serif vs lignes compactes, pastille orange conservée)

**Given** un nœud en densité résumé
**When** le nœud est rendu
**Then** le compteur `N RÉPONSES` est conservé tel quel

**Given** l'arbitrage **scroll interne (18.1) vs handles par ligne**
**When** la story est implémentée
**Then** une décision est prise et documentée dans le code, parmi : **(a)** seule la réplique scrolle et les lignes de réponses restent hors zone scrollable, ou **(b)** les handles restent sur le bord du nœud et seuls les *libellés* vivent sur les lignes
**And** aucun `<Handle>` ne se trouve dans une région `overflow:auto` — il serait clippé et ses `handleBounds`, mesurés au DOM, suivraient le scroll
**And** `overflow:'visible'` sur la racine (`:403`) est préservé : il est requis par les handles (`:781`, `bottom:10`) et par le lien « Voir le prompt » (`:928`)

**Given** des réponses portant conditions, effets, skill checks ou coût d'effort
**When** le nœud est déplié
**Then** ces attributs restent signalés par les **indicateurs compacts existants** (pastille, anneau d'effets `:785-787`, marqueur `COND.`) et **non** dépliés en toutes lettres
**And** leur édition reste au panneau de droite (hors périmètre de cette epic)

**Given** un nœud dont les réponses sont connectées
**When** le rendu des handles change
**Then** l'identifiant reste `choice:${choiceId}`
**And** **aucune arête n'est détachée, mal ciblée ni perdue** — test de régression sur un dialogue à branches multiples
**And** les arêtes restent attachées sans scintillement au basculement de densité

**Given** le tooltip de choix (`:631-636`) et `CHOICE_TOOLTIP_BOTTOM_PX` (`:102`)
**When** les réponses sont affichées en lignes
**Then** le sort du tooltip est tranché explicitement : supprimé, ou conservé pour la seule densité résumé
**And** le code mort éventuel est retiré

**Dimensionnement :** 1 session si l'arbitrage scroll/handles est tranché en 18.1 ; 2 sinon.

**References:** FR124, NFR-P4, ADR-008 (`choiceId`), garde-fou 2

---

### Story 18.3: Synchro descendante store → panneau sur les champs texte (FR127)

As a **auteur de dialogues**,
I want **que ce que j'écris dans le nœud ne soit jamais écrasé par le panneau de droite**,
So that **je ne perde pas de texte sans même m'en apercevoir**.

> 🔴 **Story remontée avant l'écriture.** Elle était numérotée 18.6 et placée après 18.3/18.4/18.5. L'audit a montré que livrer l'écriture in-situ avant elle, c'est mettre en production un chemin de corruption de données.

**Objectif US (le vrai diagnostic):** la première rédaction décrivait une course de 100 ms entre deux debounces. **Le défaut est structurel et permanent** : il n'existe aucun chemin store → formulaire pour les champs texte quand la sélection ne change pas. `reset` est gardé par `selectionChanged` (`NodeEditorPanel.tsx:263`) et l'effet d'empreinte (`:303-336`) ne hache que les champs de connexion (`mergeNodeEditorForm.ts:158-172`). Le garde `:199` (`if (JSON.stringify(merged) === JSON.stringify(node.data)) return`) **ne protège pas** : c'est précisément la divergence qui déclenche l'écriture.

Trois scénarios de perte, tous réels :

| # | Scénario | Mécanisme |
|---|---|---|
| **A** | **Boucle d'écrasement** | Panneau ouvert en édition sur `n1`, formulaire chargé `line="Bonjour"`. L'auteur tape « Salut » dans le nœud → le store change → le panneau re-render → `watch()` (`:221`) renvoie un nouvel objet → l'effet `:222-236` réarme son `setTimeout` → 100 ms plus tard `flushFormToStore` (`:186-201`) écrit « Bonjour » par-dessus. Et comme ça remodifie le store, la boucle repart. |
| **B** | **Flush au démontage** | L'auteur tape dans `n1`, puis clique `n2` → `GraphEditor.tsx:123-133` remet `nodeInspectorEditing = false` → le panneau **démonte** → le cleanup `:209-217` flushe le formulaire périmé sur `n1`. Aucun toast, aucune trace. L'effet `:239-300` qui gère proprement le changement de sélection ne tire pas : le composant démonte avant. |
| **C** | **La sauvegarde elle-même** | `requestFlush()` → `:365-372` → `form.handleSubmit(onSubmit)` → `onSubmit` (`:338-362`) merge les données du formulaire sur `liveNode.data`. Formulaire périmé ⇒ la sauvegarde détruit l'édition in-situ. |

**Acceptance Criteria:**

**Given** le panneau ouvert en édition sur le nœud que j'édite dans le canvas
**When** je modifie la réplique dans le nœud
**Then** le formulaire du panneau est resynchronisé depuis le store — l'empreinte de resync couvre désormais `line`, `speaker`, `title` et `choices[].text`
**And** **le scénario A ne se produit pas** : aucun flush du panneau n'écrit une valeur antérieure à ma saisie
**And** la position du curseur du champ RHF focalisé est préservée pendant la resynchronisation

**Given** une saisie in-situ non flushée et un changement de nœud sélectionné
**When** le panneau démonte (`:209-217`)
**Then** le flush de démontage est **conditionnel** : il n'écrit que si le formulaire est réellement divergent depuis le dernier resync (`formState.isDirty`)
**And** **le scénario B ne se produit pas**

**Given** une saisie in-situ suivie d'une sauvegarde explicite
**When** `onSubmit` (`:338-362`) s'exécute
**Then** il part des valeurs **courantes du store**, pas d'un formulaire périmé
**And** **le scénario C ne se produit pas**

**Given** les trois scénarios A, B et C
**When** la story est livrée
**Then** chacun est couvert par un **test de régression séquentiel nommé** (saisie panneau → focus nœud → saisie nœud → assertion)

**Given** une édition in-situ suivie d'un rechargement de la page
**When** le document est rechargé depuis le journal IndexedDB / serveur
**Then** l'édition est présente — zéro perte (**NFR-R3**, ADR-006)

**Given** un flush au changement de sélection
**When** il s'exécute
**Then** `choices[N].targetNode` est préservé (même piège que le flush historique du panneau)

**Dimensionnement :** 2 sessions. **La story la plus risquée de l'epic** — c'est une refonte du contrat d'écriture du panneau.

**References:** FR127, NFR-R3, ADR-006, ADR-007, garde-fous 3 et 5

---

### Story 18.4: Annulation — `updateNode` transactionnel et coalescence d'undo (FR126)

As a **auteur de dialogues**,
I want **pouvoir défaire ce que je viens d'écrire**,
So that **l'absence de bouton Annuler ne me laisse pas sans filet**.

> 🔴 **Story nouvelle.** Elle n'existait pas dans la première rédaction, qui présupposait un mécanisme d'annulation déjà en place (« zundo »). Il n'existe pas. **D2 — le refus du brouillon — n'est valide qu'avec cette story.**

**Objectif US (vérification existant):** `updateNode` (`nodeSlice.ts:489`) fait un `set()` nu + `markDirty()`. Contrairement à `addNode` (`:459`), `deleteNode` (`:516`) et tout `edgeSlice`, il ne passe **pas** par `runGraphTransaction` et ne pousse **aucun** `_pushUndoSnapshot`. Les éditions de champ ne sont pas dans la pile undo — ni avant, ni après cette epic, sans cette story.

**Acceptance Criteria:**

**Given** une édition de champ (réplique, speaker, titre, texte de réponse)
**When** elle est poussée au store
**Then** elle passe par `runGraphTransaction` et produit une entrée dans la pile undo

**Given** une frappe continue dans un champ
**When** les snapshots sont produits
**Then** ils sont **coalescés par inactivité** — une pause de saisie clôt l'unité d'édition, pas chaque caractère
**And** `Ctrl+Z` défait une **unité d'édition sensée**, pas un caractère
**And** 30 secondes de frappe continue ne consomment **pas** les 50 emplacements de `MAX_UNDO_SNAPSHOTS` (`undoSlice.ts:9`), donc n'effacent pas l'historique structurel — un test le vérifie

**Given** le coût de `cloneSnapshot` (`undoSlice.ts:18-34` — deep-clone de tous les nœuds, du document et du layout)
**When** la coalescence est implémentée
**Then** le nombre de clones par minute de frappe est mesuré et documenté
**And** p95 frappe (`e2e/perf-document-load.spec.ts`) ne régresse pas

**Given** le focus dans un champ in-situ
**When** je presse `Ctrl+Z`
**Then** l'undo **du store** s'applique, pas l'undo natif du navigateur sur le DOM
**And** la décision est prise et documentée : soit `ctrl+z` entre dans `allowedInInputs` (`useKeyboardShortcuts.ts:148`) — **en vérifiant alors l'effet sur les `<textarea>` du panneau** — soit le champ gère `Ctrl+Z` lui-même et stoppe la propagation

**Given** un undo qui restaure du texte
**When** il s'applique
**Then** le changement est annoncé au lecteur d'écran (UX-DR9) — un undo dans un champ sans mode est l'opération la plus désorientante pour qui ne voit pas l'écran

**Dimensionnement :** 2 sessions.

**References:** FR126, NFR-R3, NFR-A3, UX-DR9, ADR-006, D2, garde-fou 6

---

### Story 18.5: Éditer la réplique PNJ dans le nœud (FR122, FR126)

As a **auteur de dialogues**,
I want **cliquer dans la réplique affichée dans le nœud et écrire directement, sans bouton ni bascule**,
So that **je corrige une ligne en une seconde au lieu de traverser le panneau de droite**.

**Objectif US (vérification existant):** le nœud est aujourd'hui 100 % lecture seule — aucun `input`, aucun `contentEditable`. Toute écriture passe par `NodeEditorPanel`.

**Acceptance Criteria:**

**Given** un nœud seul sélectionné, en densité dépliée
**When** je clique une seule fois dans le texte de la réplique
**Then** le curseur se place à l'endroit cliqué et je peux écrire immédiatement
**And** aucun bouton « Modifier », aucune bascule de mode, aucun double-clic (D1)
**And** le panneau de droite **ne s'ouvre pas** en édition (D1)

**Given** un nœud non sélectionné en densité résumé
**When** je clique dans la zone de réplique
**Then** le nœud est sélectionné et déplié, curseur **en fin de réplique**
**And** un second clic place le curseur à l'endroit cliqué (D1)

**Given** que je saisis dans la réplique
**When** une frappe est enregistrée
**Then** la valeur est poussée au store dans un délai **≤ 100 ms** (ADR-006)
**And** l'écriture est un patch mono-champ (`updateNode(id, {data:{line}})`), **jamais** une copie complète du nœud (garde-fou 3)
**And** aucun brouillon local n'est conservé

**Given** le champ de saisie
**When** il est implémenté
**Then** c'est un **`<textarea>` auto-grandissant** (D4), pas un `contentEditable`
**And** coller depuis un traitement de texte insère du **texte plat**, sans balise ni style
**And** la position du curseur survit au re-render provoqué par la frappe

**Given** que je saisis
**When** je presse `Échap`
**Then** la saisie est **conservée** (déjà au store), le focus quitte le champ, le nœud reste sélectionné (D2)
**And** l'événement est `stopPropagation` : aucun panneau latéral ne se replie (`Dashboard.tsx:475-487`)

**Given** une saisie que je veux défaire
**When** je presse `Ctrl+Z`
**Then** l'undo du store restaure l'unité d'édition précédente (story 18.4)

**Given** que je sélectionne du texte à la souris
**When** je glisse le curseur
**Then** la sélection s'effectue et **le nœud ne se déplace pas** (classe `nodrag`)

**Given** que je saisis dans la réplique
**When** je presse `Backspace` ou `Suppr`
**Then** le caractère est effacé et **le nœud n'est pas supprimé** — test de régression explicite
**And** aucune configuration de `deleteKeyCode` n'est nécessaire (`isInputDOMNode` protège déjà `textarea`)

**Given** les gestes du nœud qui entrent en conflit avec l'édition de texte
**When** le pointeur est dans la zone éditable
**Then** les quatre sont neutralisés : **clic droit** rend le menu natif (copier/coller, correcteur) au lieu du menu du nœud (`DialogueNode.tsx:371-378`) ; **double-clic** sélectionne un mot sans déclencher `focusNode`/`fitView` (`useReactFlowHandlers.ts:260-262`) ; **l'infobulle** `NODE_DRAG_TOOLTIP` (`:385`) ne s'affiche pas au-dessus du texte ; **la molette** scrolle le contenu sans zoomer le canvas

**Given** le mode **playthrough reader**, le mode **preview de dialogue**, ou une session **invité**
**When** je clique dans le texte d'un nœud
**Then** **aucune édition ne s'active** et aucune affordance d'édition n'est affichée
**And** `isGuest` est rendu accessible au nœud — il est aujourd'hui calculé dans `GraphCanvas.tsx:229` et `DialogueNode` ne lit aucun `useAuthStore`

**Given** un nœud en densité résumé
**When** je survole la zone de réplique
**Then** une affordance d'édition discrète apparaît (curseur texte, filet au survol) sans dégrader la lisibilité (UX-DR2)

**Given** un champ de réplique vide
**When** il est rendu
**Then** il porte un **placeholder** disant ce qui s'y écrit (UX-DR10) — invariant « chaque surface vide dit ce qui s'y affichera » (`design-system-foundation.md:32`)

**Given** un lecteur d'écran
**When** le focus entre dans un champ in-situ
**Then** le champ porte un rôle et un nom accessibles (UX-DR8)

**Dimensionnement :** 2 à 3 sessions. **La story la plus sous-estimée de la première rédaction.** Découpage suggéré : **18.5a** champ `<textarea>` + `nodrag`/`nowheel` + les quatre gardes pointeur + modes lecture seule + `isGuest` ; **18.5b** `Échap`, `Ctrl+Z`, affordance, règle 1er/2e clic, placeholder, ARIA.

**References:** FR122, FR126, NFR-P4, NFR-R3, NFR-A3, ADR-006, UX-DR2, UX-DR8, UX-DR10, D1, D2, D4, Epic 9 (preview), `guest_first_auth`, garde-fous 3, 4 et 7

---

### Story 18.6: Éditer le texte des réponses PJ dans le nœud (FR124, FR126)

As a **auteur de dialogues**,
I want **écrire le texte de chaque réponse joueur directement sur sa ligne dans le nœud**,
So that **j'écris une réplique et ses réponses d'un seul geste, au même endroit**.

**Acceptance Criteria:**

**Given** un nœud déplié avec N réponses
**When** je clique dans le texte d'une réponse
**Then** le curseur s'y place et je peux écrire, selon les mêmes règles qu'en 18.5

**Given** que je modifie le texte d'une réponse
**When** la valeur est poussée au store
**Then** `choices` est reconstruit depuis le tableau **courant du store** avec un seul `text` changé (garde-fou 3)
**And** `choiceId` est **inchangé**, `targetNode` est **préservé** — test de régression vérifiant que l'arête sortante pointe toujours vers le même nœud
**And** l'ordre de `choices[]` est inchangé

**Given** une réponse portant un `test` (skill check)
**When** j'édite son texte
**Then** la barre de test dérivée garde son **identifiant** et ses **quatre arêtes de résultat** pendant toute la frappe
**And** `updateDialogueNodeDirectly` (`nodeSlice.ts:292-340`) reconstruit les TestNodes sans les recréer — conformité `.claude/rules/testnode_sync.md`
**And** un test de régression couvre la frappe continue sur un choix porteur de test

**Given** une réponse connectée dont j'édite le texte
**When** l'étiquette de l'arête est recalculée
**Then** elle suit le nouveau texte via `truncateChoiceLabel` (`graphEdgeBuilders.ts:157-165`, 30 caractères max) sans que l'arête soit recréée

**Given** une réponse dont le texte devient vide
**When** je quitte le champ
**Then** la réponse **n'est pas supprimée** et son `choiceId` est conservé
**And** le nœud la signale par l'indicateur de validation existant (Epic 4, FR37)
**And** le champ porte `aria-invalid` et un `aria-describedby` pointant le message (UX-DR11)

**Given** un nœud sans réponse (`nextNode` simple)
**When** il est déplié
**Then** aucune ligne de réponse n'est affichée et l'indicateur `SUITE →` est conservé

**Given** un document exporté vers Unity après édition in-situ
**When** la validation de schéma s'exécute
**Then** le document reste conforme v1.1.0 et `choiceId` est présent sur chaque réponse (ADR-008)

**Modes lecture seule :** les exclusions de 18.5 s'appliquent identiquement.

**Dimensionnement :** 1 session, si 18.5 a posé un composant de champ réutilisable.

**References:** FR124, FR126, ADR-008, UX-DR11, `testnode_sync`, garde-fou 3, story 18.5

---

### Story 18.7: Éditer le speaker et le titre dans le nœud (FR125, FR126)

As a **auteur de dialogues**,
I want **corriger qui parle et le titre du nœud sans quitter le canvas**,
So that **renommer un locuteur ne me coûte pas un aller-retour vers le panneau**.

**Prérequis :** le titre doit être **rendu** dans le nœud — c'est un livrable de 18.1, pas de celle-ci.

**Acceptance Criteria:**

**Given** un nœud seul sélectionné
**When** je clique sur le nom du locuteur dans l'en-tête
**Then** je peux l'éditer sur place, selon les mêmes règles qu'en 18.5

**Given** un nœud seul sélectionné
**When** je clique sur le titre rendu dans l'en-tête
**Then** je peux l'éditer sur place, selon les mêmes règles qu'en 18.5

**Given** le speaker rendu en capitales (`text-transform: uppercase`, `DialogueNode.tsx:557`)
**When** je saisis en minuscules
**Then** le comportement est tranché et documenté : l'affichage reste en capitales et la **donnée conserve la casse saisie**, ou la saisie est normalisée — mais pas un écart silencieux entre ce qu'on voit et ce qu'on stocke

**Given** que je modifie le locuteur ou le titre
**When** la valeur est poussée au store
**Then** les champs non touchés sont **intacts** — `choices`, `nextNode`, `stableID`, métadonnées de génération

**Given** un speaker qui n'existe pas dans le GDD
**When** je quitte le champ
**Then** l'avertissement « Speaker 'X' non trouvé dans le GDD » de la story 1.5 (`epic-01.md:311-314`) est **conservé** sur ce chemin d'édition
**And** si l'équipe décide de ne pas le porter, c'est acté comme régression assumée — pas perdu par omission

**Given** un speaker ou un titre long
**When** il dépasse la largeur du nœud
**Then** l'ellipse est conservée en affichage, et le champ montre la valeur complète pendant l'édition

**Dimensionnement :** 1 session, si 18.1 a rendu le titre.

**References:** FR125, FR126, garde-fou 3, stories 18.1 et 18.5, `epic-01.md:311-314`

---

### Story 18.8: Indicateur de synchronisation et annonce accessible (UX-DR4)

As a **auteur de dialogues**,
I want **un signal permanent et honnête me disant que mon texte est enregistré**,
So that **l'absence de bouton « Enregistrer » ne se traduise pas par un doute permanent**.

> ⚠️ **Story fortement réduite.** La première rédaction la présentait comme un chantier neuf. **L'essentiel existe déjà** : `SaveStatusIndicator.tsx` porte `SyncStatusDisplay = 'synced' | 'offline' | 'error'`, `ackSeq` et `pendingCount` ; `graphJournal.ts` implémente le journal IndexedDB avec `snapshot.ackSeq` / `pending.seq` ; la maquette le dessine déjà (`README.md:104-105`, `etats-2a-2e.dc.html:102` → `ENREGISTRÉ · 11:24`). **Vérifier et compléter, ne pas recréer** — un second indicateur concurrent serait une régression.

**Contexte de l'arbitrage :** ADR-006 supprime le bouton Enregistrer, et c'est la bonne décision. Mais `responsive-design-accessibility.md:35` fixe la cible du projet à **WCAG 2.1 niveau A**, et **3.2.2 *On Input* est de niveau A** — pas « l'esprit » d'un critère AA optionnel. L'arbitrage reste défendable (3.2.2 interdit un *changement de contexte* sur saisie ; un autosave sans déplacement de focus n'en est pas un), mais il se paie. **Cette story est la contrepartie non négociable de D2**, avec la story 18.4.

**Acceptance Criteria:**

**Given** l'éditeur de graphe ouvert
**When** aucune modification n'est en attente
**Then** `SaveStatusIndicator` affiche l'état **synchronisé**, visible sans action — **composant existant, réutilisé**

**Given** que je viens de saisir du texte in-situ
**When** les modifications sont en cours d'envoi
**Then** l'indicateur passe en **en attente** avec le nombre de changements en file (`pendingCount`)
**And** revient à synchronisé à l'acquittement (`ackSeq`, ADR-006)

**Given** une erreur de synchronisation (hors-ligne, 409, erreur serveur)
**When** l'envoi échoue
**Then** l'indicateur passe en **erreur** distinguable, et le travail reste conservé dans le journal IndexedDB
**And** aucun texte saisi n'est perdu ni écrasé silencieusement (**NFR-R3**)

**Given** un lecteur d'écran actif
**When** l'état de synchronisation change
**Then** les états informatifs sont annoncés via `aria-live="polite"`, **agrégés** et non émis à chaque frappe
**And** l'état **erreur** est annoncé en `assertive` / `role="alert"` — conforme à `epic-14.md:316-317` et `component-strategy.md:171`, et **non en `polite`** comme le prévoyait la première rédaction

**Given** ADR-006 qui autorise explicitement un bouton optionnel « Synchroniser maintenant »
**When** la story est implémentée
**Then** la décision de le placer ou non est **prise explicitement**, pas écartée par omission
**And** si elle est négative, le motif est écrit — c'est la mitigation la moins chère du doute « où est mon bouton Enregistrer », et elle est déjà permise par l'ADR

**Dimensionnement :** 1 session (vérification + complétion + ARIA).

**References:** FR126, NFR-A3, NFR-R3, UX-DR4, ADR-006 (exigence porteuse réelle de l'indicateur), D2

---

### Story 18.9: Clavier — pattern composite, focus visible, curseur à la création (FR128, FR122)

As a **auteur de dialogues au clavier**,
I want **entrer dans un nœud, enchaîner ses champs, en sortir, et commencer à écrire dès qu'un nœud est créé**,
So that **écrire un nœud complet reste une séquence de frappe continue**.

**Objectif US (référence Articy):** Articy:draft X place le curseur **avant même le premier clic** et enchaîne les champs au `Tab`. C'est le gain de friction le plus élevé et le moins cher de l'epic. Mais `Tab` est chez nous une ressource partagée avec Epic 14 — d'où D5.

**Acceptance Criteria:**

**Given** le focus sur le canvas
**When** je presse `Tab` ou `Shift+Tab`
**Then** le focus navigue **entre nœuds**, exactement comme le prévoit la story 14.1 — **un nœud = un seul arrêt de tabulation**
**And** les champs in-situ **ne sont pas** dans l'ordre de tabulation global : ils ne piègent jamais le focus

**Given** le focus sur un nœud (wrapper), seul sélectionné
**When** je presse `Enter`
**Then** j'entre dans la chaîne de champs, curseur en fin de réplique (D5)

**Given** le focus dans la chaîne de champs
**When** je presse `Tab` ou `Shift+Tab`
**Then** le focus circule : **Titre → Speaker → Réplique → Réponse 1 → … → Réponse N**
**And** `Tab` depuis la réplique atteint le champ suivant nativement — un `<textarea>` ne capture pas `Tab`, donc **aucun `Ctrl+Tab` n'est requis** (D5)
**And** `Enter` dans la réplique insère un retour à la ligne

**Given** le focus dans la chaîne
**When** je presse `Échap`
**Then** je sors de la chaîne et le focus revient au **nœud**, pas au document
**And** l'événement est `stopPropagation` (D2)

**Given** un champ focalisé
**When** il reçoit le focus
**Then** l'indicateur de focus est **visible** et utilise les tokens de la story 14.2 — dépendance déclarée, Epic 14 est en `backlog` (UX-DR6)

**Given** le focus qui arrive sur un nœud en densité résumé
**When** j'entre dans la chaîne
**Then** le nœud se déplie **à l'entrée explicite dans la chaîne**, pas à la réception du focus sur le wrapper
**And** ce choix satisfait **WCAG 3.2.1 *On Focus* (niveau A)** : recevoir le focus ne change pas le contexte

**Given** que je crée un nœud manuellement ou par drag depuis un handle de réponse
**When** le nœud apparaît
**Then** il est seul sélectionné, déplié, et le **curseur est déjà dans la réplique** — je peux écrire sans aucun clic
**And** `requestNodeEdit` (`useGraphToolbarMenuItems.tsx:124` → `GraphEditor.tsx:123-133`) route vers l'**in-situ** : le panneau ne s'ouvre **plus** automatiquement en édition
**And** les tests existants de ce comportement (`graphViewStore.nodeEdit.test.ts`, `GraphEditor.combobox-17_7.test.tsx`) sont mis à jour, pas supprimés

**Given** l'aide clavier de la story 12.3
**When** la chaîne de champs est livrée
**Then** la dépendance est déclarée auprès d'Epic 12 et le contenu de l'aide est amendé — pas modifié en effet de bord

**Dimensionnement :** 2 sessions. Le non-piégeage du focus dans un canvas React Flow est un chantier a11y à part entière.

**References:** FR128, FR122, NFR-A1, UX-DR6, D5, Epic 14 (stories 14.1, 14.2), Epic 12 (story 12.3)

---

### Story 18.10: Édition in-situ au tactile sur viewport étroit (FR128)

As a **auteur travaillant sur tablette**,
I want **corriger une réplique ou une réponse au doigt**,
So that **je puisse éditer un dialogue hors de mon bureau**.

> ⚠️ **Story requalifiée.** La première rédaction annonçait « sans ouvrir un panneau plein écran ». **La prémisse était fausse** : sur viewport étroit, l'inspecteur n'est pas monté (`GraphEditor.tsx:533` → `{!isGraphEditorNarrow && <GraphInspector …>}`), et `NodeEditorPanel` n'est monté nulle part ailleurs dans l'écran graphe. **Il n'existe aujourd'hui aucune surface d'édition de nœud sur narrow.** Cette story n'évite donc pas un panneau — elle est le **seul** chemin d'édition sur tablette, et comble un trou laissé par Epic 17. Sa valeur est plus haute qu'annoncé, et sa priorité s'en trouve relevée.

**Acceptance Criteria:**

**Given** un viewport étroit (< seuil tablette d'Epic 17)
**When** j'appuie sur le texte d'une réplique ou d'une réponse dans un nœud déplié
**Then** l'édition s'active et le clavier logiciel s'ouvre
**And** le champ en cours reste **visible au-dessus du clavier logiciel** — réutilise le viewport dynamique de la story 17.4, livrée

**Given** un appui long de 500 ms dans la zone éditable (`CONTEXT_MENU_LONG_PRESS_MS`)
**When** je veux sélectionner un mot
**Then** la sélection native s'applique et **le menu contextuel du nœud ne s'ouvre pas**
**And** `useGraphContextMenuLongPress.ts:72` exempte la zone éditable — l'allowlist contient déjà `textarea`, ce qui rend le correctif trivial avec D4

**Given** un nœud déplié sur tactile
**When** j'évalue les zones d'appui
**Then** les cibles respectent **44×44 px**, et l'arithmétique est faite : N réponses × 44 px + en-tête + réplique doit tenir dans les 440 px de hauteur et les 280 px de largeur de D3
**And** si elle ne tient pas, une **densité tactile distincte** est spécifiée (typographie et pas d'espacement propres) plutôt qu'un compromis implicite
**And** l'espacement minimal de 8 px entre éléments est respecté (`responsive-design-accessibility.md:60`)

> Note : les 44 px d'Epic 17 sont scopés au **chrome** (`epic-17.md:63-65`). Les étendre au contenu d'un nœud est une **extension assumée** de cette story, pas une reprise de 17.2.

**Given** que je fais glisser mon doigt dans la zone de texte
**When** le geste s'applique
**Then** la sélection ou le scroll du texte s'effectue, **le nœud ne se déplace pas**, et le canvas ne pan pas

**Given** un viewport étroit
**When** j'ai fini de saisir
**Then** un moyen **évident et visible** de quitter l'édition existe (appui hors champ, bouton de validation), sans dépendre d'une touche `Échap`

**Dimensionnement :** 2 sessions.

**References:** FR128, UX-DR5, UX-DR12, Epic 17 (stories 17.2, 17.3, 17.4 — livrées), D3, D4

---

### Story 18.11: Non-régression — perf, export, sélection multiple, nœuds pending

As a **équipe**,
I want **que l'édition in-situ ne casse rien de ce qui marche aujourd'hui**,
So that **le gain d'ergonomie ne se paie pas en régressions ailleurs**.

> **Story nouvelle.** Elle rassemble les angles morts que l'audit a trouvés et que les stories fonctionnelles ne couvraient pas.

**Acceptance Criteria:**

**Given** le harnais de la story 16.6 (`e2e/perf-document-load.spec.ts`)
**When** je l'exécute sur la fixture confort et la borne stress
**Then** **p95 load, p95 drag et p95 frappe** respectent les seuils de `docs/architecture/adr-008-perf-targets.md`
**And** les mesures avant / après l'epic sont consignées — NFR-P1 et NFR-P4 sont **mesurées, pas affirmées**

**Given** plusieurs nœuds sélectionnés (`multiSelectionKeyCode="Shift"`, `selectionOnDrag`)
**When** la sélection est multiple
**Then** **aucun** nœud ne se déplie et aucun champ éditable n'est monté (D3)
**And** un test couvre le lasso sur dix nœuds

**Given** un export PNG ou SVG du graphe
**When** un nœud est sélectionné et déplié
**Then** l'export est produit en densité **résumé**, sans anneau de focus ni curseur
**And** `graphExport.ts` exclut l'état d'édition comme il exclut déjà `controls` et `minimap`

**Given** un auto-layout dagre ou un placement de nœud généré
**When** un nœud est déplié au moment du calcul
**Then** la hauteur de référence est celle de la densité **résumé**
**And** la hauteur dépliée mesurée au DOM (`layoutSlice.ts:152-177`, préférée par `dagreLayout.ts:69-72`) ne fuit pas dans le layout ni dans `childNodeTopLeftY` (`graphNodeLayout.ts:76-85`)

**Given** un nœud `pending` (généré, non accepté)
**When** il est sélectionné et déplié
**Then** les trois boutons d'overlay (`DialogueNode.tsx:810-919`, `top: 34`) et `CONTENT_PADDING_TOP_WHEN_PENDING` ne recouvrent pas la zone éditable
**And** le comportement attendu est spécifié : édition autorisée ou non sur un nœud pending

**Given** la correction orthographique du navigateur
**When** un champ in-situ est rendu
**Then** le réglage `spellcheck` est décidé explicitement — le lore (« Uresaïr », « Valkazer ») produirait sinon un soulignement rouge permanent sur l'écran principal

**Given** l'internationalisation
**When** la story est livrée
**Then** le RTL est **explicitement hors périmètre** de cette epic, et la raison est écrite — `left: ${leftPercent}%` + `translateX(-50%)` (`:780-782`) et la chaîne de champs s'inverseraient

**Dimensionnement :** 1 à 2 sessions.

**References:** NFR-P1, NFR-P4, story 16.6, D3, garde-fou 8

---

## Séquençage

```
18.1  Densité adaptative + réplique intégrale + titre rendu
  └─ 18.2  Réponses PJ en lignes (arbitrage scroll/handles tranché en 18.1)

18.3  Synchro descendante panneau ↔ store      ← AVANT toute écriture
18.4  Undo transactionnel + coalescence         ← AVANT toute écriture
  └─ 18.5  Écriture de la réplique
       ├─ 18.6  Écriture des réponses
       └─ 18.7  Speaker + titre  (exige 18.1)

18.8  Indicateur de synchronisation (largement déjà fait)
18.9  Clavier — pattern composite
  └─ 18.10 Tactile sur narrow
18.11 Non-régression
```

**18.3 et 18.4 précèdent l'écriture.** C'est la correction la plus importante de cette révision : la première rédaction les plaçait après, ce qui aurait mis en production un chemin de corruption de données (18.3) et une édition non annulable (18.4).

**Dimensionnement total : ~16 sessions** pour 11 stories. La première rédaction annonçait 9 stories sans estimation ; l'audit les chiffrait à ~15 sessions.

---

## Couverture — vérification

| Exigence | Story(ies) |
|---|---|
| FR122 — édition réplique in-situ | 18.5, 18.9 |
| FR123 — réplique intégrale en densité dépliée | 18.1 |
| FR124 — réponses PJ en lignes, éditables | 18.2 (lecture), 18.6 (édition) |
| FR125 — speaker + titre in-situ | 18.7 (rendu du titre : 18.1) |
| FR126 — éditer = sauvegarder | 18.4, 18.5, 18.6, 18.7, 18.8 |
| FR127 — source unique nœud ↔ panneau | 18.3 |
| FR128 — clavier + tactile | 18.9, 18.10 |
| NFR-P1 / NFR-P4 | 18.1, 18.11 (**mesurées** via story 16.6) |
| NFR-A1 | 18.9 |
| NFR-A3 | 18.4, 18.5, 18.8 |
| **NFR-R3** (Data Loss Prevention) | 18.3, 18.5, 18.8 |
| UX-DR1 — révision de la spec UX | 18.1 (périmètre élargi, voir ci-dessous) |
| UX-DR2 — affordance d'édition | 18.5 |
| UX-DR3 — tokens refonte 2026 | 18.1 |
| UX-DR4 — états de synchronisation | 18.8 |
| UX-DR5 — cible tactile 44 px | 18.10 |
| UX-DR6 — focus et tabulation | 18.9 |
| UX-DR7 — révision de la maquette 2026 | 18.1 |
| UX-DR8 — ARIA des zones éditables | 18.5 |
| UX-DR9 — annonce de l'undo | 18.4 |
| UX-DR10 — placeholder d'état vide | 18.5 |
| UX-DR11 — `aria-invalid` / `aria-describedby` | 18.6 |
| UX-DR12 — espacement minimal 8 px | 18.10 |

Aucune exigence orpheline. Aucune story ne dépend d'une story ultérieure.

### UX-DR1 — périmètre réel de la révision documentaire

La première rédaction ne visait qu'un paragraphe d'un seul fichier. **22 affirmations contredisent l'epic dans 9 shards.** Inventaire à traiter dans la story 18.1 :

| Fichier | Lignes | Nature |
|---|---|---|
| `ux-pattern-analysis-inspiration.md` | `:100-102`, `:182-184` | « Panel droit pour édition » — hors du § déjà annoté |
| `ux-pattern-analysis-inspiration.md` | **`:154-156`, `:217-219`** | **Anti-patterns « Panel unique pour édition, pas de duplication centre/droite » — interdisent explicitement FR127. Opposables en revue.** |
| `ux-consistency-patterns.md` | `:64`, `:76`, `:82`, `:104`, `:105` | Panneau = surface d'édition ; auto-save 2 min ; `Enter` pour submit ; clic et double-clic nœud |
| `design-direction-decision.md` | `:126`, `:139`, `:179`, `:181`, `:188`, `:222`, `:230`, `:248` | Bouton « Sauvegarder » ; dialogue tronqué ; `Escape` ferme ; progressive disclosure vers le panneau |
| `user-journey-flows.md` | `:20`, `:44`, `:60`, `:140`, `:156` | Double-clic = raccourci de génération ; édition via le panneau |
| `core-user-experience.md` | **`:31`, `:33`** | **« pas de tactile », « pas de contraintes d'accessibilité mobile » — déjà faux depuis Epic 17 livrée** |
| `visual-design-foundation.md` | `:260` | « Inline Editing (panel contextuel) » |
| `executive-summary.md` | `:31`, `:34-35`, `:53`, **`:54`** | « uniquement le panel droit » ; **« réduire la redondance d'information entre panneaux » — anti-FR127** |
| `component-strategy.md` | `:12` | 280 px — à **confirmer** contre `README.md:109` (220 px, faux) |
| `design-system-foundation.md` | `:63` | Inspecteur 2e : à reformuler en « écriture d'abord, lecture friendly » et articuler avec l'in-situ |

---

## Journal de révision — 2026-10-01

Corrections apportées après l'audit d'implementation readiness. Les huit bloquants sont traités.

| # | Bloquant | Traitement |
|---|---|---|
| B1 | D2 appuyée sur `zundo`, absent du projet | **Story 18.4 créée** (undo transactionnel + coalescence), placée avant l'écriture. D2 réécrite avec la correction visible. |
| B2 | Dernier-écrivain-gagne structurel | **Story 18.3 remontée** avant l'écriture, AC réécrites sur les trois scénarios A/B/C réels. |
| B3 | Re-render global déjà existant | AC de mesure en 18.1 et 18.11, correctif `DialogueNode.tsx:177` explicite, D4 (`<textarea>`) pour la position du curseur. |
| B4 | Maquette dessine le nœud sélectionné en résumé | **Seuil de zoom supprimé** de D3 ; géométrie chiffrée ; révision de la maquette, du README §F et de `ui_redesign_2026.md` en livrables de 18.1 (UX-DR7). |
| B5 | « Lecture d'abord » abolie en silence | **Requalifié** : l'intention produit est « écriture d'abord, lecture friendly ». L'epic la prolonge. `requestNodeEdit` → in-situ, tranché en 18.9, tests existants mis à jour. |
| B6 | Deux anti-patterns UX interdisent FR127 | Inscrits dans l'inventaire UX-DR1 ci-dessus, à réviser en 18.1. |
| B7 | Conflit de `Tab` avec Epic 14 | **D5 créée** : pattern composite ARIA. `Tab` reste à Epic 14 ; `Enter` entre, `Échap` sort. `Ctrl+Tab` supprimé. |
| B8 | Appui long tactile → menu contextuel | AC explicite en 18.10 ; D4 (`<textarea>`) rend le correctif trivial. |

Majeurs également traités : NFR-R2 → **NFR-R3** (six emplacements) · perf **mesurée** via le harnais de la story 16.6 au lieu d'être affirmée · **UX-DR1–12 définies** dans `requirements-inventory.md` · NFR-A1 contredite → signalée comme correctif à porter sur NFR-A1, pas sur D2 · géométrie chiffrée (280 / 440 px) · garde-fou 3 reformulé (« ne jamais écrire depuis une copie périmée ») · numéros de ligne rafraîchis et vérifiés · dépendances Epic 12 / 14 / 17 déclarées · `isGuest`, titre non rendu, TestNode, étiquette d'arête, export PNG, sélection multiple, nœuds pending, `spellcheck`, RTL : chacun porte désormais une AC.

**Hors périmètre de cette révision, à traiter ailleurs :** les AC de la story 1.5 (`epic-01.md:290`, `:301`, `:306`, `:321-323`) sont non conformes à ADR-006 — bouton « Sauvegarder », `Ctrl+S`, `Échap` qui jette les modifications — tout en étant marquées « DÉJÀ IMPLÉMENTÉ ». Deux des trois contradictions sont **antérieures** à cette epic. FR5 se garde (elle est agnostique de canal ; FR122/124/125 la raffinent) ; ses AC se réécrivent dans Epic 1.
