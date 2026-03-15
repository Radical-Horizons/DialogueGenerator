# Rapport d’échec – Positions des nœuds et chargement des dialogues

**Date** : 2026-03-14  
**Contexte** : Correction du bug « position des nœuds non persistée au changement d’onglet » et ouverture des dialogues lorsque l’API documents renvoie 404.  
**Demande** : Rapport factuel des échecs, sans proposition de solution. Demande d’aide d’un dev senior.

---

## 1. Échecs observés par l’utilisateur

1. **Même nœud dans deux dialogues**  
   Un même nœud s’affiche dans deux dialogues différents, seul, sans ses handles de test.

2. **Dialogue généré puis disparu**  
   Un dialogue supplémentaire a été généré ; il restait visible jusqu’à refresh de la page, puis changement d’onglet, changement de dialogue et retour. Après ce parcours, le contenu a disparu.

3. **Positions des nœuds**  
   Le bug initial (position des nœuds qui revient à l’ancienne place après changement d’onglet et retour) n’a pas été résolu de façon fiable par les changements effectués.

---

## 2. Modifications effectuées pendant la session (résumé)

- **Loader**  
  - Suppression du fallback `getUnityDialogue` + `loadDialogue` (appel à `loadGraph` backend) pour éviter les positions « sous le parent » venant du backend.  
  - Tentative de deux `documentId` (avec/sans `.json`) avant échec.  
  - En cas d’échec des deux : `getUnityDialogue` + `loadDialogueFromRawJson` (projection frontend uniquement, sans `loadGraph`).

- **Nouvelle action store**  
  - `loadDialogueFromRawJson(jsonContent, documentId)` : parse du JSON, construction du document (tableau legacy → `{ schemaVersion, nodes }`), `documentToGraph(doc, layout)`, avec layout récupéré d’abord via `getLayout(documentId)` puis, en cas d’échec, via `sessionStorage` (clé `graph_layout_raw:${documentId}`).

- **Persistance layout « raw »**  
  - Lors d’un chargement en raw : tentative `getLayout(documentId)` puis lecture du layout en `sessionStorage` si besoin.  
  - Lors d’une sauvegarde legacy (`saveGraphAndWrite`) : écriture du layout courant en `sessionStorage` sous `graph_layout_raw:${documentId}`.

- **Instrumentation debug**  
  - Ajout de logs (fetch vers endpoint ingest) dans `useDialogueLoader` et `persistenceSlice` ; retirée à la demande utilisateur.

---

## 3. Fichiers modifiés (liste non exhaustive)

- `frontend/src/hooks/useDialogueLoader.ts`  
  - Logique de chargement (deux documentId, plus de fallback `loadDialogue` avec réponse backend, fallback `loadDialogueFromRawJson`).  
  - Loader par route aligné (deux documentId + `loadDialogueFromRawJson` en échec).
- `frontend/src/store/slices/persistenceSlice.ts`  
  - `loadDialogueFromRawJson`, lecture layout API puis sessionStorage, écriture layout en sessionStorage dans le chemin legacy save.
- `frontend/src/store/types/graphState.ts`  
  - Ajout du type `loadDialogueFromRawJson`.

---

## 4. Ce qui n’a pas été identifié

- Cause exacte du « même nœud dans deux dialogues » (fuite de state, mauvais `documentId`, partage de store entre dialogues, autre).
- Cause exacte de la disparition du dialogue généré après refresh + changement d’onglet + retour (sauvegarde non faite, mauvais documentId, écrasement, autre).
- Preuve par logs ou scénario reproductible que le layout en sessionStorage est bien lu/écrit avec le bon `documentId` et appliqué au bon dialogue.

---

## 5. Demande

Aide demandée d’un développeur senior pour :

- Reproduire et diagnostiquer les régressions (même nœud dans deux dialogues, dialogue généré qui disparaît).
- Clarifier la frontière entre « document présent dans l’API documents » et « document uniquement disponible via raw JSON / legacy » et les flux de chargement/sauvegarde associés.
- Définir une stratégie de persistance des positions (et du contenu) qui évite les doubles sources de vérité et les états incohérents entre onglets et après refresh.
