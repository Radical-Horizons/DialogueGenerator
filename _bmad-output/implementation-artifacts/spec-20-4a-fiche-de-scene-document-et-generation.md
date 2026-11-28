---
title: 'Story 20.4, lot A — La scène garde sa distribution'
type: 'feature'
created: '2026-11-28'
status: 'done'
route: 'dispatch'
review_loop_iteration: 0
baseline_commit: '5ffea2bd5b50f3e42b999545792a1baea711434e'
context:
  - '{project-root}/docs/design/refonte-scene/Fiche.dc.html'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** La distribution et le contexte d'une génération viennent de la colonne Contexte GDD, globale, ou sont devinés à chaque appel : une suite d'un dialogue peut parler avec le PNJ d'une autre scène (vécu le 2026-11-19).

**Approach:** Le dialogue porte sa fiche de scène (A1) : enregistrée à côté du document, jamais exportée, déduite quand elle manque, montrée en tête de la vue Graphe, et seule source de PNJ, PJ, lieu, brief et fiches pour toute génération du dialogue ouvert.

## Boundaries & Constraints

**Always:**
- Clé `scene` : `npcs[]`, `pc`, `place` (`{entryId, name}` ; `entryId` = `notion_page_id`, nul pour un nom libre), `brief`, `tones`, `authorProfileId`, `linkedEntries`, `contextBudget`. Les champs sans interface ici sont conservés tels quels.
- Disque : `Assets/Scenes/{id}.scene.json` seulement, dans le même instantané, la même restauration et la même révision que le document. `PUT` sans `scene` : fiche inchangée ; `scene: null` : fiche supprimée. Supprimer le dialogue la supprime ; une création n'hérite pas d'une fiche orpheline.
- Aucun chemin d'export ne contient `scene` ; les attendus du golden ne changent pas.
- Fiche absente : déduite du seul dialogue (jamais de la colonne), mention « déduite — vérifier », enregistrée au premier geste de l'auteur sur la fiche ou à la première génération.
- Générations du dialogue ouvert (suite, test, lot et job, régénération, estimations) : la fiche remplace la colonne, l'instantané du nœud et la déduction à la volée. PNJ = locuteur du parent s'il est un PNJ de la fiche, sinon le premier ; les autres PNJ sont envoyés en fiches. PNJ ou PJ absent de la fiche : lu dans le dialogue. Le brief précède la consigne envoyée, sans entrer dans la consigne mémorisée sur le nœud.
- Graphies multiples ou locuteur vide : proposés dans la fiche ; un `speaker` n'est réécrit qu'au clic, en un seul CTRL+Z.
- Fiche : repliée en une ligne (titre, PNJ, PJ, lieu, brief), dépliable ; PJ parmi les jouables, PNJ hors L'Éthérée ; titre en lecture. Sauvegarde automatique. Invité ou sans droit d'écriture : lecture seule.
- Fiches cochées dans la colonne Contexte GDD (décidé) : un bouton « Reprendre les fiches cochées » de la fiche les copie dans `linkedEntries`, sans doublon, en liste visible et retirable. Sans ce geste, la colonne ne compte pour aucune génération du dialogue ouvert.
- Page Générer (décidé) : inchangée, exception nommée dans le test d'inventaire jusqu'à son retrait (20.11). Le dialogue qu'elle crée reçoit une fiche déduite, sans lieu ni brief.

**Never:**
- Lots B et C : `@`, tons, profil d'auteur, premier emplacement, menu « fiche de scène ▾ ».
- Enveloppe (20.5), tiroir Contexte (20.25).
- Changer la construction du prompt côté serveur, le format des nœuds ou le golden ; réécrire un `speaker` seul ; appel LLM facturé.

## I/O & Edge-Case Matrix

| Scénario | État | Attendu |
|---|---|---|
| Aller-retour | PUT avec `scene`, puis GET | `scene` identique, révision +1, fichier du dialogue sans `scene` |
| Sans fiche | PUT sans `scene`, aucun compagnon | document valide, aucun fichier créé |
| Échec d'écriture | erreur après le compagnon | document, `.meta` et fiche restaurés |
| Fiche mal formée | `scene` non objet | 400, rien d'écrit |
| Scène A après B | colonne remplie par B, suite dans A | requête avec les PNJ, PJ, lieu de A seulement |
| 409, fiche non touchée | fiche changée ailleurs | celle du serveur est gardée et adoptée |
| Onglet Éditer | enregistre après un changement de fiche | fiche inchangée |
| Export d'un document avec `scene` | front, invité, `save-and-write`, lot, aperçu | clé absente |

</frozen-after-approval>

## Code Map

- `services/document_persistence_service.py` -- `read_document`, `write_document`, `delete_document` (liste de chemins), `_snapshot` / `_restore`. Séparer `scene` ici couvre aussi `unity/export`, `save-and-write`, `expand-tree`. Dériver `base_dir.parent / "Scenes"` (les mocks de `ConfigurationService` rendraient un `MagicMock`) ; en test, `tmp_path / "Dialogue"`. Ne pas muter le dict de l'appelant ; indexer sans `scene`.
- `api/routers/documents.py` -- GET et charge utile du 409 rendent `scene`.
- `services/unity_export_normalizer.py` (`normalize_unity_export_document`) -- garde les clés de tête inconnues : retirer `scene` (le lot « preserve » réécrit le fichier).
- `frontend/src/store/slices/persistenceSlice.ts` -- chargement (l. 292, 397) et `saveDialogue` (l. 540), qui rebâtit le document par `graphToDocument`. Tenir la fiche hors de `state.document`.
- `frontend/src/components/generation/UnityDialogueEditor.tsx` (l. 440) -- renvoie `{...documentLu}` : en retirer `scene`.
- `frontend/src/hooks/useUnityExport.ts` (l. 115) -- invité : sérialise `state.document`.
- `frontend/src/utils/sceneDramatis.ts` -- `resolveGraphGenerationDramatis` (déduction, sans repli) ; `resolveDialogueDramatis` a aujourd'hui le dernier mot sur les ids passés. `utils/gddEntityNames.ts` -- rapprochement des noms.
- Appels à brancher : `generationSlice.ts` (générer l. 207, régénérer l. 775, détection l. 36), `AIGenerationPanel.tsx` (l. 43, 242), `NodeEditorPanel.tsx` (l. 131, 664), `GraphCanvas.tsx` (l. 287, 410, 443), `useBatchGenerateFromNodes.ts` (l. 50-108, 171).
- Serveur inchangé : `services/scene_dramatis.py` enrichit à partir de `scene_protagonists`, `scene_location`, `*_full` / `*_excerpt` ; il remplace un PJ non jouable ; la régénération ne lit le PNJ que dans `scene_protagonists`.
- Interface : `GraphEditor.tsx` (sous `GraphEditorHeader`) ; `useGraphContextBreadcrumb.ts` montre les personnages de la colonne ; `FuzzyPickerInput.tsx` pour les champs ; board `Fiche`.

## Tasks & Acceptance

**Execution:**
- [x] `services/document_persistence_service.py`, `api/routers/documents.py`, `services/unity_export_normalizer.py`, `.gitignore` -- compagnon, contrat GET / PUT, retrait à l'export.
- [x] `tests/services/`, `tests/api/` -- matrice côté serveur, suppression, orpheline ; golden Python avec `scene`.
- [x] `frontend/src/utils/sceneSheet.ts` (nouveau) -- déduction, graphies, contexte de génération depuis la fiche ; fonctions pures testées.
- [x] `persistenceSlice.ts`, `UnityDialogueEditor.tsx`, `useUnityExport.ts` -- état de la fiche, sauvegarde, 409, retrait aux exports ; golden front avec `scene`.
- [x] Les appels cités -- la fiche, et rien de `contextStore` ; test d'inventaire et test scène A après B.
- [x] `components/scene/SceneSheetBar.tsx` (nouveau), `GraphEditor.tsx`, fil d'Ariane -- la fiche et ses tests.
- [x] `docs/deployment/DATA_MAINTENANCE.md` -- `Assets/Scenes/`.

**Acceptance Criteria:**
- Given un dialogue sans fiche, when on l'ouvre sans rien toucher, then la fiche déduite s'affiche et rien n'est écrit.
- Given les graphies `T'vok` et `T’vok`, when la fiche est déduite, then le rapprochement est proposé et aucun `speaker` ne change sans clic.
- Given les fichiers d'appel de génération du graphe, when l'un lit `contextStore`, then un test échoue.

## Implementation Notes

- `NodeEditorPanel` : les listes (choix, conditions) ne se montent qu'une fois le formulaire à jour ; la fiche affichée en tête du graphe avait fait réapparaître l'héritage des choix d'un nœud à l'autre.
- `e2e/graph-test-node-generation-4results.spec.ts` redemande le recentrage tant que celui de l'application l'écrase.
- `linkedEntries` écarte à la lecture une entrée sans `category` ou `name` ; l'architecture (A1) est alignée.
- Vérification finale : `test:premerge` vert (2850 pytest, 2224 Vitest), typecheck zéro, deux specs e2e du graphe (4 passés), preuve UI sur une copie temporaire du forgeron.

## Spec Change Log

## Review Triage Log

Passe 1 — B : relecteur sans contexte, E : cas limites, V : trous de vérification, I : rapport d'implémentation.

- B1 · medium · patch — `deduceFromNodes` groupe par graphie brute puis résout les alias (`matchesAliasOrHistoricalName`) : deux PNJ identiques possibles.
- B2 (alias) · medium · patch — `buildSceneGeneration` compare le locuteur brut du parent aux noms canoniques : avec 2 PNJ, un alias fait parler le premier.
- B2 (locuteur hors fiche) · false · rejeté — l'intention gelée dit « sinon le premier ».
- B3 · false · rejeté — « PNJ ou PJ absent de la fiche : lu dans le dialogue » (intention gelée) ; le panneau affiche ce qui part.
- B4 (catalogue absent) · low · rejeté — fenêtre étroite, le chargement repart au remontage de la barre ; le correctif rendrait l'enregistrement asynchrone.
- B4 (fiche vide figée) · low · patch — `ensureSceneStored` écrit une déduction sans PNJ ni PJ, qui n'est plus recalculée.
- B4 (course de révisions) · low · rejeté — il faut une re-sync GDD pendant le chargement ; garde supplémentaire.
- B5 (graphie du lieu) · low · patch — `setPlace` garde la saisie au lieu du nom du catalogue.
- B5 (lieu sans notion_page_id, renommage) · low · rejeté — les 69 lieux ont un `notion_page_id` ; la re-résolution par `entryId` serait une fonction de plus.
- B6 · low · rejeté — seul un auteur qui a supprimé tous ses nœuds écrit un graphe vide, ce qu'il voit à l'écran ; échec de chargement : pas de `documentId` neuf.
- B7 · low · rejeté — l'autosave existant (50 ms, champs du nœud à 100 ms) écrit déjà à ce rythme ; un anti-rebond ajoute un chemin de perte.
- B8 · low · patch — `parseSceneSheet` laisse passer des `linkedEntries` nulles que le rendu lit.
- B9 (`UnicodeDecodeError`) · low · patch — c'est un `ValueError`, non attrapé ; le GET échouerait.
- B9 (compagnon corrompu écrasé) · low · rejeté — écriture atomique par l'application ; corruption à la main seulement.
- B10 · low · patch — l'ancienne empreinte GDD est gardée à côté du nouvel instantané.
- B11 · low · defer — le recalcul à l'application du rapport existait avant (colonne globale).
- B12 · low · patch — un locuteur « PNJ » n'est signalé nulle part.
- B13 · medium · patch — correctif `listsReady` sans test unitaire.
- B14 · low · patch — le test d'inventaire n'interdit pas `sceneSelection`.
- E1 · medium · patch — PJ absent de la fiche : un autre PNJ de la fiche peut être envoyé comme PJ (`notPlayer` non passé).
- E2 · medium · patch — même défaut que B1.
- E3 · medium · patch — même défaut que B2 (alias).
- E4 · low · rejeté — voir B4 (catalogue absent).
- E5 · low · patch — voir B4 (fiche vide figée).
- E6 · low · rejeté — voir B4 (course de révisions).
- E7 · low · patch — voir B8.
- E8 · low · patch — voir B5 (graphie du lieu).
- E9 · low · patch — `isForbiddenNpc` ne neutralise pas l'apostrophe typographique ; le GDD écrit l'apostrophe droite, donc seul un catalogue absent y mène.
- E10 · low · patch — voir B9 (`UnicodeDecodeError`).
- E11 · low · defer — voir B11.
- E12 · low · patch — voir B10.
- E13 · low · defer — le fait « PJ/PNJ » de `CLAUDE.md` cite un helper supprimé (fichier de contexte d'agent).
- E14 (figurant) · low · defer — le serveur ajoute un figurant en extrait depuis avant cette story ; l'intention interdit de changer le prompt serveur.
- E14 (libellé) · low · patch — la fiche affirme que seuls PNJ, PJ et lieu partent.
- V1 · medium · patch — rien ne vérifie que `GraphEditor` monte la fiche.
- V2 · medium · patch — chargement du catalogue jamais exercé.
- V3 · medium · patch — la requête d'estimation n'est vérifiée nulle part.
- V4 · medium · patch — édition de la fiche pendant un enregistrement non testée.
- V5 · medium · patch — gardes d'adoption sur 409 non testées.
- V6 · medium · patch — voir B13.
- V7 · low · patch — instantané et empreinte après régénération non vérifiés.
- V8 · low · patch — « Attribuer à » et retrait d'un PNJ non testés.
- V9 · low · patch — `scene: null` non testé à la frontière HTTP.
- V autre 1 · medium · patch — voir E1.
- V autre 2 · low · rejeté — voir B4 (catalogue absent).
- V autre 3 · low · defer — l'analyse manuelle de context dropping lit toujours la colonne (comportement inchangé, désormais différent de l'analyse automatique).
- I1 · medium · patch — brief sans consigne (lot, job) : la consigne par défaut du serveur (guillemets, didascalies) est remplacée par « Continue la conversation… ».

## Design Notes

La fiche reste hors de `state.document` : les exports qui en partent sont propres par construction, et un `PUT` ne la porte que si l'auteur l'a changée, ce qui évite qu'une copie périmée l'écrase.

`linkedEntries` : `[{category, name, mode, entryId}]`, avec `category` = clé de base de `ContextSelection` (`characters`, `locations`, `items`, …) et `mode` = `full` ou `excerpt` (absent pour les catégories sans mode), de quoi reconstruire la sélection envoyée au serveur sans relire la colonne. Le PNJ, le PJ et le lieu de la fiche ne sont pas recopiés dans la liste.

## Verification

**Commands:**
- `node scripts/getPythonPath.js -m pytest` sur les tests ajoutés, de persistance et golden -- verts
- `npm --prefix frontend run typecheck`, `npm --prefix frontend run lint` -- zéro erreur
- `npm run test:premerge` -- vert

**Manual checks:**
- Navigateur intégré, `dialogue-generator-dev-sans-llm` : fiche déduite, corrigée, relue après rechargement ; `Assets/Dialogue/{id}.json` sans `scene` ; captures comparées au board `Fiche` ; `npm run dev:stop`.
