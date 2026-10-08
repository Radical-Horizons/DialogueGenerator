---
stepsCompleted: ['step-01-document-discovery', 'step-02-prd-analysis', 'step-03-epic-coverage-validation', 'step-04-ux-alignment', 'step-05-epic-quality-review', 'step-06-final-assessment']
verdict: 'Epic 18 PRETE apres correction (8 bloquants traites, 11 stories, ~16 sessions). Epic 19 differee (hors lot sprintable).'
scope: 'Epic 18 (édition in-situ) et Epic 19 (canvas-first) — delta depuis le rapport 2026-01-15'
inputDocuments:
  - '_bmad-output/planning-artifacts/prd/index.md'
  - '_bmad-output/planning-artifacts/architecture/index.md'
  - '_bmad-output/planning-artifacts/epics/index.md'
  - '_bmad-output/planning-artifacts/epics/requirements-inventory.md'
  - '_bmad-output/planning-artifacts/epics/epic-18.md'
  - '_bmad-output/planning-artifacts/epics/epic-19.md'
  - '_bmad-output/planning-artifacts/ux-design-specification/index.md'
  - '_bmad-output/planning-artifacts/research/ux-edition-in-situ-articy-notion-2026-10-01.md'
  - '_bmad-output/project-context.md'
excludedDocuments:
  - path: '_bmad-output/planning-artifacts/quickdev-plan-architecture-v10.md'
    reason: "Correspond au motif *architecture*.md mais n'est pas le document d'architecture — c'est un plan quickdev. Le document d'architecture est la version shardée architecture/."
priorReport: '_bmad-output/planning-artifacts/implementation-readiness-report-2026-01-15.md'
---

# Implementation Readiness Assessment Report

**Date:** 2026-10-01
**Project:** DialogueGenerator
**Périmètre :** Epic 18 et Epic 19 (créées le 2026-10-01) — évaluation **delta**. Le rapport du 2026-01-15 couvre les Epics 0 à 15 et reste la référence pour celles-ci.

---

## Step 1 — Document Discovery

### Inventaire

| Type | Format | Emplacement | Volume |
|---|---|---|---|
| **PRD** | shardé | `prd/index.md` + 18 shards | 198 Ko |
| **Architecture** | shardé | `architecture/index.md` + 19 shards | 178 Ko |
| **Epics & Stories** | shardé | `epics/index.md` + 28 fichiers (`epic-00` → `epic-19`) | 666 Ko |
| **UX Design** | shardé (legacy) | `ux-design-specification/index.md` + 12 shards | 132 Ko |
| **Recherche** | note | `research/ux-edition-in-situ-articy-notion-2026-10-01.md` | 72 Ko (dossier) |
| **Contexte projet** | règle | `_bmad-output/project-context.md` | — |

### Doublons

**Aucun doublon whole + shardé.** Aucun `*prd*.md`, `*epic*.md` ni `*ux*.md` monolithique à la racine de `planning-artifacts/`.

⚠️ **Un faux positif à écarter explicitement :** `quickdev-plan-architecture-v10.md` (6,7 Ko) correspond au motif de recherche `*architecture*.md` mais **n'est pas** le document d'architecture — c'est un plan d'implémentation quickdev. Le document d'architecture retenu est la version shardée `architecture/`. Sans cette levée d'ambiguïté, une évaluation automatique lirait 6,7 Ko de plan au lieu de 178 Ko d'architecture.

### Documents manquants

Aucun des quatre types requis n'est manquant.

### Note de périmètre

Le rapport existant (`implementation-readiness-report-2026-01-15.md`, 83 Ko) couvre les Epics 0 à 15. Epics 16, 17, 18 et 19 lui sont postérieures. Cette passe est **délibérément un delta** sur 18 et 19 : refaire une évaluation complète du projet re-dériverait 83 Ko d'analyse déjà produite, sans valeur ajoutée sur le lot qui motive la passe.

---

## Steps 2 à 5 — Traçabilité, alignement UX, qualité des stories

Trois audits délégués en subagents : traçabilité PRD (steps 2-3), alignement UX (step 4), faisabilité contre le code réel (step 5).
Les constats des agents ont été **revérifiés** sur les points qui invalident une décision de cadrage — un rapport d'agent n'est pas une preuve.

### Faits revérifiés en direct

| Fait | Vérification | Résultat |
|---|---|---|
| `zundo` est utilisé par le projet | `grep zundo frontend/package.json frontend/src/` | **0 occurrence.** La bibliothèque n'est pas dans le projet. L'undo est maison (`undoSlice.ts`, plafond 50 snapshots). |
| `updateNode` pousse un snapshot d'undo | `grep _pushUndoSnapshot frontend/src/` | **Non.** `nodeSlice.ts:489` fait un `set()` nu + `markDirty()`, sans `runGraphTransaction`. Les appelants de `_pushUndoSnapshot` sont `useReactFlowHandlers:346`, `generationSlice:557`, `layoutSlice:22,34,73`, `nodeSlice:715` (suppression) et `runGraphTransaction:39` — **pas `updateNode`**. |
| `Ctrl+Z` tire depuis un champ de saisie | `useKeyboardShortcuts.ts:148` | **Non.** `allowedInInputs` contient `ctrl+s, ctrl+e, ctrl+k, ctrl+shift+f, ctrl+alt+f, escape, ctrl+/` — `ctrl+z` absent. |
| Un mode « lecture d'abord » existe déjà | `GraphEditor.tsx:123-133`, `:279-291` | **Oui.** Commentaire du code : « on regarde d'abord, on modifie ensuite » et « le formulaire […] reste la seule surface d'édition du graphe ». Décision actée `design-system-foundation.md:63` (PR #75/#76, 2026-09-27). |
| NFR-R2 signifie « zéro perte » | `prd/non-functional-requirements.md:241` vs `:260` | **Non.** NFR-R2 = **System Uptime >99 %**. « Zéro perte » est **NFR-R3 Data Loss Prevention**. L'epic cite R2 six fois à tort. |
| Un harnais de perf existe déjà | `e2e/perf-document-load.spec.ts` ; `implementation-artifacts/16-6-…md:58-60` | **Oui.** Story 16.6 a livré p95 **load / drag / frappe (saisie)** avec seuils dans `docs/architecture/adr-008-perf-targets.md`, fixtures confort (<500 nœuds) et stress. Le « p95 frappe » est exactement la mesure dont 18.1/18.3 ont besoin. |

### 🔴 BLOQUANTS

| # | Constat | Conséquence |
|---|---|---|
| **B1** | **La décision D2 repose sur un mécanisme inexistant.** D2 refuse le brouillon au motif que « l'annulation, c'est `Ctrl+Z` (zundo) ». Or zundo n'existe pas, `updateNode` n'est pas une transaction, et `ctrl+z` n'est pas autorisé dans les champs. Une édition in-situ serait **non annulable** — ou annulable par l'undo natif du navigateur, désynchronisé du store. | D2 doit être refondée. Story d'undo transactionnel + coalescence par inactivité **avant** 18.3. Sans coalescence : `cloneSnapshot` deep-clone tous les nœuds + le document toutes les 100 ms, et le plafond de 50 efface tout l'historique structurel en 5 secondes de frappe. |
| **B2** | **Dernier-écrivain-gagne structurel entre le nœud et le panneau.** Aucun chemin store → formulaire n'existe pour les champs texte à sélection constante : `reset` est gardé par `selectionChanged` (`NodeEditorPanel.tsx:263`) et l'effet d'empreinte ne hache que les champs de connexion (`mergeNodeEditorForm.ts:158-172`). Trois scénarios de perte : boucle d'écrasement panneau→nœud, flush au démontage, et la sauvegarde elle-même. | **18.6 doit précéder 18.3.** L'AC actuelle décrit une course de 100 ms ; le défaut est permanent, pas temporel. |
| **B3** | **Le re-render global que l'AC 18.1 interdit existe déjà.** `nodeSlice.ts:153,185-186` deep-clone le document et reprojette tout le graphe à chaque écriture. Aggravé par `DialogueNode.tsx:177` qui souscrit `state.nodes` en entier. | Rend un `contentEditable` contrôlé intenable (perte du curseur à chaque frappe). Correctif d'une ligne disponible sur `:177`. |
| **B4** | **La maquette dessine le nœud SÉLECTIONNÉ en résumé** (`etats-2a-2e.dc.html:144-157`, `README.md:109-119`) — exactement l'état où D3 déclenche le dépliage. `ui_redesign_2026.md` se charge automatiquement sur `frontend/src/**` et impose une fidélité haute. « Maquette inchangée » est faux. | Le dev agent de 18.1 reçoit deux instructions actives inconciliables. |
| **B5** | **Une décision tranchée le 2026-09-27 est abolie en silence.** Le mode « lecture d'abord » (PR #75/#76) est implémenté, commenté et couvert par des tests (`graphViewStore.nodeEdit.test.ts`). D1/D2 le suppriment sans story de réconciliation. `requestNodeEdit` route déjà un nœud neuf vers le **panneau** — destination concurrente de l'AC 18.8 « curseur pré-placé », soit les deux éditeurs actifs au premier geste. | Réconciliation explicite requise. |
| **B6** | **Deux anti-patterns de la spec UX interdisent explicitement FR127.** `ux-pattern-analysis-inspiration.md:154-156` et `:217-219` : « Panel unique pour édition, pas de duplication centre/droite ». FR127 impose la duplication. | Opposable en revue de code. Non couvert par le pointeur de révision. |
| **B7** | **Conflit de sémantique du `Tab` avec Epic 14.** 14.1 attribue `Tab` à la navigation **entre** nœuds ; 18.8 l'attribue aux champs **du** nœud. L'AC de sortie de 18.8 s'appuie sur « un nœud explicitement en édition » — état que D1/D2 suppriment précisément. Epic 14 est `backlog`. | Arbitrage requis avant 18.8. |
| **B8** | **Appui long tactile dans le texte ouvre le menu contextuel.** `useGraphContextMenuLongPress.ts:72` exempte `button, a, input, textarea, select, [role=menu]` mais **pas `[contenteditable]`**, et les handlers sont posés en capture sur la racine ReactFlow. | AC 18.9 infaisable sans correctif. Argument de plus pour `<textarea>`. |

### 🟠 MAJEURS

**Traçabilité**

- **NFR-R2 citée six fois à tort** (`:9`, `:196`, `:304`, `:306`, `:343`, `:425`). R2 = uptime ; la bonne exigence est **NFR-R3**, jamais nommée. L'uptime n'est couvert par aucune story d'Epic 18 — normal — et la protection contre la perte de données est couverte sans rattachement.
- **NFR-P1 et NFR-P4 affirmées sans instrumentation** : « restent tenus » (`:85-88`), aucune fixture, aucune métrique, aucun test nommé. **Le harnais existe déjà** (story 16.6, `e2e/perf-document-load.spec.ts`, p95 frappe) : à citer en AC, pas à réinventer.
- **NFR-A3 partielle** : seule la région `aria-live` de 18.7 est couverte. NFR-A3 exige des labels ARIA sur **tous** les éléments interactifs ; aucune AC n'étiquette les champs in-situ.
- **NFR-A1 contredite tout en étant déclarée couverte** : ses AC exigent « Escape cancel » (`prd/non-functional-requirements.md:310-311`), D2 impose l'inverse. D2 a raison (ADR-006 interdit le brouillon) — **le correctif appartient à NFR-A1**.
- **FR123 est plus large que ce que 18.1 livre** : la FR exige l'affichage intégral sans condition, D3 le restreint à la densité dépliée. Reformuler la FR ou la story dévie de son exigence.
- **UX-DR1 à UX-DR6 n'existent dans aucun référentiel** — leur seul énoncé est une glose de quelques mots dans `epic-18.md`. L'epic définit ses exigences puis se certifie les couvrir : traçabilité circulaire.
- **Les AC de la story 1.5 (FR5) sont non conformes à ADR-006, tout en étant marquées « DÉJÀ IMPLÉMENTÉ »** (`epic-01.md:290`, `:301`, `:306`, `:321-323`) : double-clic → panneau, bouton Sauvegarder / `Ctrl+S`, `Échap` jette les modifications. Deux des trois contradictions sont **antérieures** à Epic 18. FR5 se garde (elle est agnostique de canal ; FR122/124/125 la **raffinent**), les AC se réécrivent.
- **18.5 perd une AC de la story 1.5** : le warning « Speaker 'X' non trouvé dans GDD » (`epic-01.md:311-314`). Le second chemin d'édition est plus pauvre que le premier, sans décision explicite.
- **Divergence PRD / inventaire** : 13 FR (FR118-130) vivent hors du PRD, et quatre shards du PRD sont hors d'état — `nfr-summary.md:3` annonce 15 NFR (il y en a 21), `next-steps.md:5` annonce 113 FR (117), `implementation-status-details.md` s'arrête à FR117, `changes-summary.md:8-13` cite une numérotation antérieure. Un outil qui suit `prd/index.md` obtient **117 exigences sur 130, sans avertissement**.

**Alignement UX**

- **La justification de D1 est fausse** : le double-clic n'ouvre pas l'`AIGenerationPanel` (il n'existe nulle part) — `useReactFlowHandlers.ts:260-262` le câble sur `focusNode`. La conclusion (clic simple) tient, mais le pointeur de révision ajouté dans la spec **propage l'erreur**.
- **Le clic simple n'est pas libre non plus** : déjà attribué à la sélection **et** à l'alimentation du panneau (`ux-consistency-patterns.md:104`). D1 ne traite que le premier volet. Non arbitré, chaque clic d'écriture ouvre le panneau que l'epic cherche à éviter.
- **`Shift+clic`, `Ctrl+clic`, clic droit et appui long** ont une sémantique texte standard et sont attribués à des stories d'autres epics (2.10, 12.2, 2.12, 17.2). Aucun AC ne tranche.
- **Quatre gestes d'édition normaux déclenchent des actions de graphe** : clic droit → menu du nœud (tue copier/coller et le correcteur), double-clic → `fitView` animé 300 ms, `title={NODE_DRAG_TOOLTIP}` s'affiche pendant la frappe, `escape` est autorisé dans les champs et replie un panneau sur narrow.
- **22 affirmations contradictoires restent actives dans 9 shards** de la spec UX ; le livrable d'UX-DR1 ne vise qu'un seul paragraphe d'un seul fichier. Dont `core-user-experience.md:31-33` (« pas de tactile », « pas de contraintes d'accessibilité mobile ») — déjà faux depuis Epic 17 livrée.
- **Rien dans l'epic ne vise la maquette**, alors que l'inspecteur 2e place l'édition des réponses dans le panneau (`etats-2a-2e.dc.html:744`, action « éditer »).
- **UX-DR4 re-spécifie `SaveStatusIndicator`** sans le nommer — composant existant, migré au design system, déjà dessiné dans la maquette. Risque de second indicateur concurrent.
- **UX-DR5 étend au contenu du nœud une règle scopée au chrome** (`epic-17.md:63-65`), sans faire l'arithmétique : 3 réponses × 44 px = 132 px dans un nœud de 220 px dont le pas d'espacement est 10-11 px.
- **L'erreur de synchronisation serait annoncée en `polite`**, contre `assertive` / `role="alert"` exigés par `epic-14.md:316-317` et `component-strategy.md:171`.
- **Six exigences UX de la spec n'ont pas de UX-DR** : ARIA des zones éditables, contraste en saisie, **placeholder d'état vide** (`design-system-foundation.md:32` — indispensable à l'AC 18.8 « nœud créé, curseur pré-placé, champ vide »), `aria-invalid`/`aria-describedby`, espacement 8 px, `aria-expanded` sur le pliage.
- **Dépendances déclarées incomplètes** : Epic 14 (tokens de focus, ARIA), Epic 12 (aide clavier, `Échap`), Epic 17 (17.4, pourtant citée par 18.9) absentes.

**Faisabilité**

- **18.1 n'est pas implémentable** : seuil de zoom non chiffré, « hauteur maximum documentée » documentée nulle part, largeur du nœud non traitée (220 px au README vs 280 px dans `component-strategy.md`).
- **AC 18.1 (scroll interne) et AC 18.2 (handles par ligne) sont incompatibles** : un `<Handle>` dans une région `overflow:auto` est clippé et ses `handleBounds` suivent le scroll. Arbitrage à trancher dans 18.1.
- **Z-index garanti seulement pour la branche « sélectionné »** : `elevateNodesOnSelect` donne z=1000 gratuitement, mais le dépliage par seuil de zoom laisse tous les nœuds à z=0.
- **Fuite de hauteur dépliée dans le layout** : `dagreLayout.ts:69-72` préfère `measured.height` écrite depuis le DOM. Un nœud mesuré déplié devient la hauteur de référence du placement des nœuds générés.
- **`transition: 'all 0.2s ease'`** (`DialogueNode.tsx:405`) sur une boîte à hauteur variable : rafale de `ResizeObserver` à chaque bascule de densité.
- **`isGuest` n'est pas accessible depuis le nœud** : `GraphCanvas.tsx:229` le calcule, `DialogueNode` ne lit aucun `useAuthStore`. L'AC d'exclusion invité demande un ajout non prévu.
- **Le titre n'est pas rendu dans le nœud** : `DialogueNode.tsx:133` ne l'utilise que pour l'attribut `title=`. L'AC 18.5 exige un rendu qui relève de 18.1.
- **Sélection multiple non traitée** : avec D3, un lasso sur 10 nœuds monte 10 champs éditables et 10 z=1000 concurrents.
- **Édition d'un choix porteur de `test`** : `updateDialogueNodeDirectly` reconstruit les TestNodes et leurs arêtes à chaque appel (`.claude/rules/testnode_sync.md`). Aucune AC sur la stabilité de l'id de barre et de ses 4 arêtes pendant la frappe.
- **18.7 largement déjà implémentée** (`SaveStatusIndicator.tsx`, `graphJournal.ts`) sauf sa dernière AC, qui est un chantier entier. Story mal découpée dans les deux sens.
- **La prémisse de 18.9 est fausse** : aucune surface d'édition de nœud n'est montée sur viewport étroit (`GraphEditor.tsx:533`). 18.9 n'évite pas un panneau plein écran — elle est le **seul** chemin d'édition sur narrow. À requalifier : couverture de trou, pas confort.

### Dépendances entre stories — l'affirmation de l'epic est fausse

Quatre dépendances inversées, vérifiées contre le code : **18.3 → 18.6** (sans synchro descendante, 18.3 livre un chemin de corruption), **18.3 → undo** (AC `Ctrl+Z`), **18.5 → 18.1** (le titre n'est rendu nulle part), **18.2 ↔ 18.1** (arbitrage scroll/handles à trancher dans 18.1).

Ordre corrigé : `18.1 → 18.2 → [18.6' synchro bidirectionnelle] → [18.7' undo transactionnel + coalescence] → 18.3 → 18.4 / 18.5 → 18.7'' indicateur → 18.8 → 18.9`.

### Dimensionnement

**9 stories annoncées, ~15 sessions réelles.** Cinq à redécouper : 18.1, 18.3, 18.6, 18.8, 18.9. Aucune à jeter.

### Décision d'implémentation à inscrire dans l'epic

**`<textarea>` auto-grandissant plutôt que `contentEditable`.** Quatre raisons convergentes : le collage depuis Word arrive en texte plat au lieu de HTML ; la position du curseur survit au re-render (que B3 rend inévitable) ; `useGraphContextMenuLongPress.ts:72` exempte déjà `textarea`, donc B8 disparaît ; les guillemets `« »` ajoutés au rendu restent naturellement hors de la zone éditable, comme D1 l'exige.

### Reformulation du garde-fou 3

La règle écrite — « jamais de spread » — est trop étroite et désigne mal le danger. `updateNode(id, {data:{line}})` est **sûr** : `updateDialogueNodeInDocumentSoT:160-169` patche champ par champ. La règle réelle est **« ne jamais écrire depuis une copie complète périmée »** — et c'est exactement le défaut de B2.

### Ce qui tient

- **D1 (clic simple) est la bonne décision**, malgré une justification fausse.
- **D3 (densité adaptative) est le bon arbitrage** : le code confirme que déplier en permanence tuerait NFR-P1.
- **Garde-fou 2 exact** : `choice:${choiceId}` est bien l'invariant, et il n'existe aucun couplage de la donnée à `Position.Bottom` (`graphEdgeBuilders.ts:193-195`, `documentToGraph`). Le risque sur les arêtes était **surestimé**.
- **`isInputDOMNode` de React Flow 11.11.4 protège `contentEditable` aussi bien qu'un `<textarea>`** : `hasAttribute('contenteditable')` est testé explicitement, et `actInsideInputWithModifier: false` bloque même `Ctrl+Backspace`. L'AC « effacer un caractère ne supprime pas le nœud » est réalisable, et `deleteKeyCode` n'a pas besoin d'être configuré.
- **Les stories 18.2, 18.4 et 18.6 traitent les pièges réels du code** avec des tests de régression nommés — `choiceId`, `targetNode`, double debounce, `deleteKeyCode`.
- **La carte de couverture FR est saine** : contiguë de FR1 à FR130, sans trou, sans chevauchement, sans double citation.

### Défauts de catalogue révélés en passant (hors Epic 18)

- `epic-index.md` et `epic-list.md` **omettent Epic 15 et Epic 16**, présentes sur disque.
- **Statut d'Epic 17 incohérent** : les index disent `in-progress`, `epic-17.md:3` dit `done` (rétro 2026-06-20). La story 18.9 en dépend.
- **Carte NFR périmée** (`requirements-inventory.md:278-284`) : n'inclut ni Epic 16, 17, 18, 19 ; ne mentionne jamais NFR-R3.
- **Collision d'espaces de numérotation** : `prd-rlm-context-selector.md` ouvre un second FR1–FR8 / NFR1–NFR6, et `epic-15.md:7` revendique « FR1-FR8 » sans qualifier — lu hors contexte, Epic 15 revendique les FR de génération d'Epic 1.

---

## Step 6 — Verdict

### Epic 18 : NON PRÊTE pour l'implémentation

**8 bloquants, ~30 majeurs.** Aucun ne condamne la conception : D1 et D3 sont les bons arbitrages, le découpage en neuf stories est pertinent, et trois stories traitent les vrais pièges du code. Ce qui ne tient pas, c'est **l'assise d'une décision de cadrage** (D2 repose sur zundo, qui n'existe pas), **l'ordre des stories** (18.6 et l'undo doivent précéder l'écriture), et **la résolution documentaire** de l'inversion (maquette, spec UX, décision du 2026-09-27).

### Epic 19 : différée — hors lot sprintable

Pas un trou de couverture : un report motivé, gated par une condition vérifiable (`epic-19.md:25`). À compter comme **différée**, jamais comme couverte. Réserve : FR130 (« collapse **or** remove ») décrit deux produits et n'est pas testable en l'état — à marquer *provisoire*.

### Correctifs requis avant d'ouvrir une story

1. **Refonder D2** — story d'undo transactionnel (`updateNode` via `runGraphTransaction`) + coalescence par inactivité, placée **avant** 18.3. Décider si `ctrl+z` entre dans `allowedInInputs`.
2. **Remonter 18.6 avant 18.3** et réécrire son AC : le défaut est structurel, pas temporel.
3. **Trancher la densité contre la maquette** — réviser `etats-2a-2e.dc.html` bloc 2e, `README.md` §F, et poser une levée d'ambiguïté dans `ui_redesign_2026.md`. Chiffrer seuil de zoom, hauteur max, largeur.
4. **Réconcilier avec le mode « lecture d'abord »** (PR #75/#76) et trancher `requestNodeEdit` vs curseur in-situ.
5. **Trancher la sémantique du `Tab`** entre 18.8 et 14.1.
6. **Corriger NFR-R2 → NFR-R3** aux six emplacements, et citer `e2e/perf-document-load.spec.ts` (p95 frappe, story 16.6) en AC de perf plutôt que d'affirmer.
7. **Définir UX-DR1 à UX-DR6** dans `requirements-inventory.md`, et élargir le périmètre d'UX-DR1 aux 22 affirmations contradictoires.
8. **Inscrire `<textarea>`** comme décision d'implémentation, et reformuler le garde-fou 3.
9. **Rafraîchir les numéros de ligne** des garde-fous (tous décalés de quelques lignes).

---

## Suites données — 2026-10-01

Correction du périmètre produit, apportée par l'équipe après lecture du rapport :

> **« Lecture d'abord » est beaucoup dire. C'est toujours « écriture d'abord ». Mais on a fait un effort sur la lisibilité, donc c'est « lecture friendly ».**

**B5 est requalifié.** L'intention produit n'a jamais été d'introduire une étape de consultation préalable : l'effort de la refonte 2026 a porté sur la lisibilité du résultat. Epic 18 **prolonge** l'intention « écriture d'abord » jusqu'au canvas au lieu de la contredire. Ce qui restait à trancher n'était donc pas une réconciliation philosophique mais un point concret : la destination de `requestNodeEdit`. Tranchée en story 18.9 — le curseur va dans le nœud, le panneau ne s'ouvre plus automatiquement en édition. La ligne `design-system-foundation.md:63` porte désormais une levée d'ambiguïté, parce qu'elle s'est effectivement fait lire à l'envers.

### Les huit bloquants, traités

| # | Traitement |
|---|---|
| **B1** | **Story 18.4 créée** — `updateNode` transactionnel + coalescence d'undo par inactivité, placée **avant** l'écriture. D2 réécrite, la correction sur `zundo` est visible dans l'epic plutôt que gommée. |
| **B2** | **Story 18.3 remontée** avant l'écriture ; AC réécrites sur les trois scénarios de perte réels (boucle d'écrasement, flush au démontage, sauvegarde), chacun avec un test de régression séquentiel nommé. |
| **B3** | AC de mesure en 18.1 et 18.11 appuyées sur le harnais existant ; correctif `DialogueNode.tsx:177` explicite ; D4 (`<textarea>`) pour la position du curseur. |
| **B4** | **Seuil de zoom supprimé** de D3 — un seul déclencheur, la sélection unique. Géométrie chiffrée (280 px de large, 440 px de haut max). Révision de la maquette, du README §F et de `ui_redesign_2026.md` en livrables de 18.1 (UX-DR7). |
| **B5** | Requalifié, voir ci-dessus. `requestNodeEdit` → in-situ, tests existants mis à jour et non supprimés. |
| **B6** | Les deux anti-patterns inscrits dans l'inventaire UX-DR1, avec les 20 autres affirmations contradictoires. |
| **B7** | **D5 créée** — pattern composite ARIA : `Tab` reste à Epic 14 (entre nœuds), `Enter` entre dans la chaîne de champs, `Échap` sort. `Ctrl+Tab` supprimé (inutile avec un `<textarea>`, et réservé par le navigateur). |
| **B8** | AC explicite en 18.10 ; D4 rend le correctif trivial, l'allowlist du long-press exemptant déjà `textarea`. |

### Majeurs traités

**NFR-R2 → NFR-R3** aux six emplacements · perf **mesurée** via `e2e/perf-document-load.spec.ts` (story 16.6, p95 load/drag/frappe) au lieu d'être affirmée · **UX-DR1 à UX-DR12 définies** dans `requirements-inventory.md` · NFR-A1 : le correctif est porté sur NFR-A1, pas sur D2 · FR122, FR123 et FR126 reformulées pour correspondre à ce que les stories livrent · FR130 marquée **provisoire** · carte NFR refaite (omettait les Epics 16 à 19 et ne mentionnait jamais R3) · garde-fou 3 reformulé en « ne jamais écrire depuis une copie périmée » · les neuf numéros de ligne des garde-fous vérifiés un par un · dépendances Epic 12 / 14 / 17 déclarées · `isGuest`, titre non rendu, TestNode, étiquette d'arête, export PNG, sélection multiple, nœuds pending, `spellcheck`, RTL : chacun porte désormais une AC (stories 18.5, 18.6, 18.7, 18.11).

### Défauts de catalogue corrigés

- `epic-index.md` et `epic-list.md` : **Epics 15 et 16 ajoutées**, elles manquaient alors qu'elles sont sur disque.
- **Statut d'Epic 17 corrigé** : `in-progress` → `done` (rétrospective du 2026-06-20). La story 18.10 en dépend ; un statut faux fait planifier sur une base absente.
- **Collision d'espaces de numérotation** signalée dans l'inventaire et dans l'index : les « FR1-FR8 / NFR1-NFR6 » d'Epic 15 appartiennent à l'espace de `prd-rlm-context-selector.md`, pas au référentiel principal.
- `epic-19.md` : référence « story 17.5 » corrigée en **17.7** — 17.5 est la PWA. Garde-fou ajouté : sur viewport étroit il n'y a **rien à retirer**, puisque aucune surface d'édition de nœud n'y est montée.

### Documents amont corrigés

- `ux-pattern-analysis-inspiration.md` : le pointeur de révision **propageait l'erreur** sur le double-clic (« reste attribué à l'`AIGenerationPanel` »). Corrigé, avec le renvoi au code et le périmètre réel de la révision.
- `design-system-foundation.md:63` : levée d'ambiguïté « écriture d'abord, lecture friendly ».
- `research/ux-edition-in-situ-articy-notion-2026-10-01.md` : trois corrections — `zundo`, le niveau WCAG de 3.2.2 (niveau A, pas « l'esprit » d'un critère AA), et la justification du double-clic.

### Hors périmètre lors de l'audit — traité le 2026-10-07

Les AC de la **story 1.5** (`epic-01.md`) étaient non conformes à ADR-006 tout en étant marquées « ✅ DÉJÀ IMPLÉMENTÉ ». Tâche exécutée. **La vérification contre le code a trouvé plus que ce que l'audit signalait** :

| AC d'origine | Réalité | Verdict |
|---|---|---|
| double-clic → panneau d'édition | `onNodeDoubleClick` = `focusNode` + `fitView` | **FAUX** |
| clic droit → « Éditer » → panneau | `NodeContextMenu.handleEdit` fait `setSelectedNode(id)` **et rien d'autre** | **FAUX** — et bug d'intitulé : un menu « Éditer » qui n'édite pas |
| Ctrl+S ou bouton « Sauvegarder » | `Ctrl+S` existe mais c'est un **sync forcé** ; aucun bouton « Sauvegarder », `SaveStatusIndicator` à sa place | **MAL FORMULÉ** — le code était conforme, l'AC non |
| indicateur « Modifié » (étoile) | absent | **JAMAIS IMPLÉMENTÉ** → acté **caduc** (sous ADR-006, tout est toujours enregistré) |
| auto-save « dans les 2 minutes » | debounce **50 ms** (`useDialogueLoader.ts:436-450`) | **FAUX** |
| warning « Speaker 'X' non trouvé dans GDD » | absent du front **et** du back | **JAMAIS IMPLÉMENTÉ** → **gardé** comme reste-à-faire |
| metadata validées **avant** sauvegarde | validation **serveur**, erreurs retournées **après** en `documentFieldErrors` | **INVERSÉ** |
| `Escape` / « Annuler » → modifs perdues + confirmation | aucun handler `Escape`, aucun bouton « Annuler » | **JAMAIS IMPLÉMENTÉ** → acté **caduc** (pas de brouillon), l'annulation relève de la story 18.4 |

**Statut corrigé** : 🟡 PARTIELLEMENT IMPLÉMENTÉ. Le compteur du header d'Epic 1 est corrigé au passage — il annonçait « DONE (8) » en listant 7 US, et comptait 1.5 comme terminée.

**Effet de retour sur Epic 18.** Sa story 18.7 affirmait que l'avertissement speaker/GDD est « **conservé** » sur le chemin in-situ. Il n'y avait rien à conserver : l'AC est corrigée et l'avertissement reste porté par la story 1.5, pour éviter de le spécifier deux fois.

**FR5 est gardée** : elle est agnostique de canal, FR122/FR124/FR125 la raffinent.

**FR97 et story 10.2 — signalés, non corrigés.** Un avertissement ADR-006 est posé dans `epic-10.md` : bouton « Sauvegarder », « prochaine auto-save dans 2 min » et `localStorage` (le journal est en IndexedDB) y divergent de l'architecture. Epic 10 est en `backlog`, donc ce sont des specs non implémentées et le correctif est bon marché — mais il dépasse le périmètre de cette passe. À l'actif de 10.2 : elle citait déjà correctement **NFR-R3**.

---

## Verdict révisé

| | Avant correction | Après |
|---|---|---|
| **Epic 18** | NON PRÊTE — 8 bloquants | **PRÊTE** — 11 stories, ~16 sessions, 0 bloquant. Les trois décisions de cadrage sont refondées (D2, D3) ou créées (D4, D5) ; l'ordre place la fiabilité avant l'écriture. |
| **Epic 19** | différée | **différée** — inchangé, hors lot sprintable, gate citée. FR130 marquée provisoire. |

Les trois arbitrages produit en attente ont été tranchés : **densité** (sélection unique, pas de seuil de zoom, 280 × 440 px), **`requestNodeEdit`** (in-situ), **`Tab`** (reste à Epic 14, entrée par `Enter`).

### Réserve sur ce verdict

« Prête » veut dire **prête à découper en stories**, pas « tous les documents sont alignés ». Les livrables documentaires de B4 — révision de `etats-2a-2e.dc.html` bloc 2e, de `README.md` §F, et levée d'ambiguïté dans `.claude/rules/ui_redesign_2026.md` — sont **assignés à la story 18.1**, pas faits.

Conséquence concrète : **jusqu'à la livraison de 18.1, un dev agent qui ouvre `DialogueNode.tsx` reçoit encore `ui_redesign_2026.md` dans son contexte** (la règle se charge sur `frontend/src/**`) avec son exigence de fidélité à un écran qui dessine le nœud sélectionné en résumé. 18.1 doit donc commencer par ses livrables documentaires, pas finir par eux. C'est écrit dans la story ; ce rappel existe pour qu'on ne l'inverse pas.
