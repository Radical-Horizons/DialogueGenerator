---
status: in-review
title: Stabilisation du parcours graphe avant écriture en prod (v1.9.2)
date: 2026-11-12
---

# Stabilisation du parcours graphe avant écriture en prod

## Intention

Premier dialogue complet écrit dans le graphe, en prod, le soir du 2026-11-12. Supprimer les chemins de perte de travail de l'autosave et du panneau d'édition, couvrir le parcours par un E2E, livrer v1.9.2 (embarque aussi PR #90, fermeture SSE).

## Lots (fichiers disjoints)

| Lot | Fichiers | Sujet |
|---|---|---|
| A | `frontend/src/store/slices/persistenceSlice.ts`, `frontend/src/hooks/useDialogueLoader.ts` (+ `api/routers/documents.py` si besoin) | Autosave fiable |
| B | `frontend/src/components/graph/NodeEditorPanel.tsx`, `mergeNodeEditorForm.ts`, `frontend/src/store/slices/nodeSlice.ts`, `undoSlice.ts` | Resync du formulaire, Ctrl+Z du texte |
| C | `frontend/src/components/graph/GraphEditor.tsx` | « Éditer » du menu contextuel sur nœud déjà sélectionné |
| D | `e2e/graph-authoring-journey.spec.ts` (nouveau) | E2E du parcours d'écriture |
| E | `GraphEditorHeader` | Barre d'outils étroite (doublon « Jouer », ◎ sans libellé) |

## Critères d'acceptation

**A1** — Given un PUT document qui répond 409 avec `revision: N`, When l'autosave suivant part, Then il envoie `revision: N` au PUT document (et non une révision périmée), `layoutRevision` n'est pas touché, et la sauvegarde aboutit.
**A2** — Given un autosave en échec (réseau ou 5xx) et aucune modification ultérieure, When le délai d'attente expire, Then un nouvel essai part seul ; Given une modification d'`edges` seule, Then l'autosave se déclenche.
**A3** — Given un document avec une saisie incomplète (ex. flag vide), When l'autosave part, Then le travail est persisté (mode de validation souple), la validation stricte restant celle de l'export Unity.
**A4** — Given des modifications non enregistrées, When on change de dialogue par l'URL, Then une sauvegarde est faite avant le chargement.
**A5** — Given la fermeture d'onglet, When `pagehide` part, Then document **et** layout partent en `keepalive`, sans `setTimeout`.
**B1** — Given un nœud sélectionné dont le texte change dans le store (génération, undo) et un formulaire non modifié par l'utilisateur, Then le formulaire affiche le nouveau texte, et changer de nœud ne réécrit pas l'ancien.
**B2** — Given une saisie de texte dans un nœud, When Ctrl+Z, Then le texte revient à l'état d'avant la rafale (1 étape par rafale : pause ≥ 1 s ou changement de champ).
**C1** — Given le nœud X déjà sélectionné, When « Éditer » au clic droit sur X, Then le panneau d'édition s'ouvre sur X.
**D1** — Given un dialogue au titre accentué, When 4 nœuds sont créés, édités, reliés, un Ctrl+Z appliqué puis F5, Then tout est persisté et l'export Unity réussit.
**E1** — Given le panneau GDD ouvert sur bureau, Then « Jouer » n'apparaît qu'une fois et chaque icône a un libellé accessible.

## Hors périmètre

Génération par lot, Ctrl+J, lot 2 de la charte, UI des cycles, reprise du journal local après crash.

## Spec Change Log

- 2026-11-12 : création.
- 2026-11-12 : revue adversariale → A3 étendu au backend (validateurs conditions/effets tolérants en mode `draft`), B : ouvrir un nœud ne pousse plus d'étape d'undo.
- 2026-11-12 : l'E2E D a révélé deux bugs déjà en prod, corrigés à l'intégration :
  - **choix fantômes** : un nœud créé juste après un nœud à choix héritait de ses choix (`texte>undefined`) — le flush du formulaire (debounce, `requestFlush`/`onSubmit`, démontage) visait la sélection courante au lieu du nœud dont le formulaire porte les valeurs (`formNodeIdRef` dans `NodeEditorPanel`) ;
  - **titre effacé** : toute mutation du graphe reconstruisait le document depuis les nœuds seuls (`syncDocAndLayout`) et l'autosave enregistrait un dialogue sans `title` — les champs de tête du document sont désormais conservés.

## Reste ouvert (deferred)

- 409 du document : le graphe ouvert l'emporte ; une modification faite en parallèle dans l'onglet Édition est écrasée (toast informatif). Vraie résolution : signal de rechargement depuis Édition.
- Fermeture d'onglet pendant une sauvegarde déjà en vol : la sauvegarde keepalive attend derrière et peut ne pas partir.
- Autosave en 4xx déterministe : relance toutes les 10 s sans plafond.
- 18.9 : bascule d'onglet inspecteur et focus du formulaire sur « Éditer ».
