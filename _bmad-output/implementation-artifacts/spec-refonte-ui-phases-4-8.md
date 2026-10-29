---
title: 'Refonte UI DialogueGenerator — streaming inline + résultat restylé (2a/2b)'
type: 'refactor'
created: '2026-08-03'
status: 'in-progress'
review_loop_iteration: 0
context: []
baseline_commit: '234ce3629fb288aa6e1d8acc4cf04eb705780c4d'
---

<!-- Split au checkpoint token-count (2883 tokens sur le spec initial "phases 4-8").
     Objectifs graphe (inspecteur, toolbar, nodes, responsive) versés dans
     deferred-work.md pour des passes séparées. -->

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** La modale de progression (`GenerationProgressModal`) bloque l'écran pendant le streaming de génération, et le résultat unique produit ensuite (onglet « Dialogue généré » de `Dashboard.tsx`) n'est pas restylé selon la grammaire déjà livrée en phases 1-3 (filets, mono, accent unique).

**Approach:** Dissoudre la modale dans l'écran — le streaming se joue inline, même arbre DOM, sans backdrop. Restyler le résultat unique existant selon l'écran 2b du handoff (filet accent, diagnostic à droite, bouton « Garder ») **sans fabriquer de comparaison multi-options** : cette fonctionnalité (4 générations alternées du même nœud) n'existe nulle part aujourd'hui — backend one-shot, aucun state N-variantes en frontend — et sa construction impliquerait un multiplicateur de coût LLM non validé.

## Boundaries & Constraints

**Always:**
- Réutiliser `ReasoningTraceViewer` tel quel (déjà autonome, déjà réutilisé 2 fois : modale + tab résultat) pour la trace inline.
- Conserver intégralement la logique de parsing streaming partiel (`extractPartialStringValue`/`formatStreamingContent`) et le flux SSE existant (`isGenerating`, `streamingContent`, `currentStep`, `isInterrupting`, `currentJobId`) — la déplacer, pas la recopier ni la réécrire.
- Le comportement « Interrompre » / « Garder ce qui est écrit » doit rester fonctionnellement identique (mêmes handlers `interrupt`/`onInterrupt` dans `GenerationPanel.tsx`).
- Le résultat unique restylé garde le même flux d'écriture dans le graphe qu'aujourd'hui (`UnityDialogueEditor`, `onSave`) — seul l'habillage visuel change.

**Ask First:**
- Si l'extraction de `GenerationProgressModal` révèle un couplage plus profond que prévu avec `isMinimized` (le mode réduit doit-il survivre sans modale ? ex. minimiser pendant qu'on navigue vers un autre onglet Dashboard), HALT et demander avant de décider du comportement.

**Never:**
- Ne pas construire la comparaison multi-options (voir Problem) — reporté dans `deferred-work.md`, jamais implicite.
- Ne pas toucher au contrat de persistance Unity (`/api/v1/documents`, `save-and-write`).
- Ne pas ajouter de self-hosting de police (déjà tranché en phase 1 : fallback système).

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Interruption pendant streaming | `isInterrupting=true`, contenu partiel présent | Le bloc inline garde le texte déjà écrit, affiche « Génération interrompue », ne se démonte pas | N/A |
| Génération en erreur | `streamingError` non-null | Le bloc inline affiche l'erreur à la place du résultat streamé | Message existant réutilisé tel quel |
| Résultat prêt, `unityDialogueResponse` présent | Tab « Dialogue généré » actif | Filet gauche accent + diagnostic à droite + bouton « Garder » unique | N/A |
| Minimize demandé en cours de streaming | `isMinimized=true` | Comportement à valider (voir Ask First) avant de coder un repli | N/A |

</frozen-after-approval>

## Code Map

- `frontend/src/components/generation/GenerationProgressModal.tsx` -- extraire le rendu (progress bar, parsing streaming, reasoning trace, interrupt) en bloc inline ; supprimer le chrome overlay/backdrop fixed-position
- `frontend/src/components/generation/GenerationPanel.tsx` -- retirer l'invocation modale (`isOpen={...}`, ~L716-780), monter le bloc extrait dans le flux principal à la place
- `frontend/src/components/layout/Dashboard.tsx` -- tab « Dialogue généré » (~L471-519) : restyler le résultat unique (filet accent, diagnostic, bouton Garder) sans changer `UnityDialogueEditor`/`onSave`
- `frontend/src/store/generationStore.ts` -- aucune nouvelle donnée requise ; vérifier que `isMinimized` reste cohérent hors contexte modale (cf Ask First)
- `frontend/src/theme/redesignTokens.ts` -- réutiliser (déjà en place depuis phase 1) pour le filet accent et le curseur de streaming clignotant

## Tasks & Acceptance

**Execution:**
- [x] `GenerationProgressModal.tsx` -- extraire en composant inline sans backdrop/position fixed, garder toute la logique de parsing/streaming/reasoning -- dissout l'écran 2a
- [x] `GenerationPanel.tsx` -- retirer l'invocation modale, monter le bloc inline dans le flux -- même comportement SSE, nouvel habillage
- [x] `Dashboard.tsx` (tab Dialogue généré) -- restyle filet-accent + diagnostic + bouton Garder unique -- écran 2b simplifié
- [x] Curseur de streaming clignotant (`blink 1s steps(1,end) infinite`, bloc 1.5×18px accent) -- ajouté au bloc inline
- [x] Mettre à jour/adapter les tests existants référençant `GenerationProgressModal` (props `isOpen`, montage dans `GenerationPanel.tsx`)
- [x] `GenerationPanel.tsx` -- différer `interrupt()` au timeout 2s (audit matrice ligne 1 : l'appel immédiat effaçait `streamingContent` + `error` avant tout rendu, rendant l'avis d'interruption inatteignable)

**Acceptance Criteria:**
- Given une génération en cours, when le streaming produit du contenu, then il s'affiche dans l'écran sans modale/backdrop visible
- Given une interruption demandée, when l'utilisateur clique « Interrompre », then le comportement (annulation job, message) est identique à avant l'extraction
- Given un résultat de génération présent, when l'utilisateur clique « Garder », then l'écriture dans le graphe est fonctionnellement identique à avant ce spec
- Given le même scénario testé en Vitest, when les tests existants de `GenerationProgressModal`/`GenerationPanel` tournent, then ils passent (adaptés si le montage change, jamais supprimés sans équivalent)

## Spec Change Log

- **Audit matrice (ligne 1), vérification indépendante post-implémentation.** Les tests de
  composant passaient, mais le flux intégré ne pouvait pas atteindre le comportement décrit :
  `handleInterruptGeneration` posait `setStreamingError('Génération interrompue')` puis appelait
  `interrupt()` de façon synchrone ; or cette action du store remet `streamingContent` à `''`,
  `error` à `null` et `isInterrupting` à `false` — donc `isActive` repassait à `false` et le bloc
  se démontait avant que l'avis ne soit rendu. État connu-mauvais évité : une matrice « verte »
  au niveau composant alors que l'utilisateur ne voit jamais ni l'avis ni son texte partiel.
  Correctif : `interrupt()` différé dans le `setTimeout(2000)` existant (un seul site d'appel).
  KEEP : le test `ne remet pas l'état à zéro avant d'avoir affiché l'avis d'interruption`
  (`GenerationPanel.integration.test.tsx`) a été vérifié rouge sans le correctif — c'est un garde
  réel, ne pas le réduire à une assertion de composant.

## Design Notes

Résultat restylé (2b simplifié) : filet gauche `2px solid #4f7fff`, fond `rgba(79,127,255,0.05)`, diagnostic (ton, longueur, mensonge possible, flags, fiches citées) en colonne droite si les données existent déjà côté réponse — sinon n'afficher que ce qui est disponible aujourd'hui (ne pas fabriquer de diagnostic non calculé). Un seul bouton plein « Garder et continuer ».

## Verification

**Commands:**
- `cd frontend && npx tsc --noEmit -p .` -- expected: erreurs ≤ baseline (120, vérifiée avant ce spec)
- `cd frontend && npx eslint <fichiers touchés>` -- expected: 0 erreur
- `cd frontend && npx vitest run <fichiers GenerationPanel/GenerationProgressModal/Dashboard> --reporter=dot` -- expected: tout vert
- `npm run dev` puis vérification navigateur (déclencher une génération, observer le streaming inline et le résultat restylé) -- expected: conforme aux AC

**Manual checks (if no CLI):**
- Capture navigateur avant/après pour comparaison visuelle aux écrans 2a/2b du handoff design
