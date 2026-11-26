---
title: 'Story 20.1 (volet 1) — Golden d''export Unity en CI'
type: 'chore'
created: '2026-11-26'
status: 'done'
baseline_commit: 'ad67bb836ac551c7489927247d9ef6f69f192693'
route: 'dispatch'
review_loop_iteration: 1
context:
  - '{project-root}/_bmad-output/test-artifacts/test-design-epic-20.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** l'export Unity a quatre chemins (Python graphe → document de `save-and-write`, Python lot `export_persisted_document`, front `documentToGraph → graphToDocument → exportToUnity`, front invité `JSON.stringify(state.document)`) et aucun ne compare sa sortie à une référence ; l'epic 20 va toucher graphe, nœuds de test et document (risque R-01, score 9).

**Approach:** committer 5 dialogues réels comme fixtures, générer **depuis le code actuel, sans le modifier**, un fichier attendu par fixture et par chemin, et deux tests `p0` (pytest, Vitest) qui comparent la sortie au texte attendu et échouent sur toute différence. Volet 2 de la story (`parse`/`serialize`) : travail différé, protégé par ce golden.

## Boundaries & Constraints

**Always:** aucun fichier de code d'export ou de conversion modifié dans cette PR ; fichiers attendus produits par les tests eux-mêmes en mode `UPDATE_GOLDEN=1`, jamais écrits à la main ; ils figent aussi les défauts actuels ; comparaison sur le texte décodé UTF-8, fins de ligne LF (`.gitattributes` force `eol=lf`) ; noms de fichiers ASCII ; tests exécutés par la CI de PR (pytest `not slow`, Vitest sans `VITEST_FULL`) et par `npm run test:backend:smoke`.

**Never:** corriger un écart entre chemins (PR à part, qui régénère le golden) ; comparer après normalisation JSON (perdrait l'ordre des clés et l'indentation) ; e2e Playwright ; lire `Assets/Dialogue/` depuis les tests (absent de la CI).

## I/O & Edge-Case Matrix

| Scénario | Entrée | Attendu | Erreur |
|---|---|---|---|
| Sortie inchangée | fixture + chemin | texte identique au fichier attendu | N/A |
| Régression | export modifié | test rouge, message nommant fixture, chemin et première ligne différente | N/A |
| Régénération | `UPDATE_GOLDEN=1` | réécrit les attendus, test vert | N/A |
| Attendu absent | nouveau fichier d'entrée sans attendu | test rouge « lancer avec UPDATE_GOLDEN=1 » | jamais de création silencieuse hors mode mise à jour |
| Chemin qui rejette l'entrée | ex. tableau nu | l'erreur actuelle (type + message) est figée dans `<nom>.error.txt` | même règle de comparaison |

</frozen-after-approval>

## Code Map

- `api/routers/graph_io.py:248` -- `save-and-write` reçoit le graphe du **store front** et appelle `graph_to_unity_json_content(request_data.nodes, request_data.edges, dialogue_flags=request_data.dialogue_flags, title=request_data.metadata.title)` (`services/unity_graph_export_serialization.py:22`). Le payload vient de `buildGraphSchemaApiPayload(state.nodes, state.edges, state.dialogueFlagBindings)` (`frontend/src/utils/buildGraphApiPayload.ts:63`) avec `metadata: state.dialogueMetadata` (`frontend/src/hooks/useUnityExport.ts:113-117`). `graph_to_unity_document` ne lit pas `position`. **Ne pas** alimenter ce rendu par `GraphConversionService.unity_json_to_graph` : production ne le fait jamais (seuls `graph/load` et la validation par lot l'appellent).
- `services/batch_export_service.py:81` `export_persisted_document` -- chemin lot ; config mockée (`tests/services/test_batch_export_service.py:57`), `skip_validation=True`. Écrit par `Path.write_text` (CRLF sous Windows, LF en CI).
- `frontend/src/store/slices/persistenceSlice.ts:267` `loadDialogueFromRawJson` puis `:701` `exportToUnity` -- chemin front canonique (mocker `documentsAPI.getLayout` en 404) ; accepte aussi le tableau nu.
- `frontend/src/hooks/useUnityExport.ts:86-92` -- chemin invité ; modèle de mocks : `frontend/src/hooks/useUnityExport.test.ts`.
- `pytest.ini` -- marqueurs `p0`, `unit`. `frontend/vitest.config.ts` -- jsdom ; Vitest tourne depuis `frontend/` (CI, scripts npm) et `import.meta.url` est inutilisable sous jsdom : ancrer sur `process.cwd()` comme les tests PWA.
- Sources : `F:\Projets\DialogueGenerator\Assets\Dialogue\` — `rencontre_avec_le_forgeron_itinérant.json` (19 nœuds, 48 tests, CRLF), `voknir_latelier_du_cartographe.json` (import Notion, `*[Vous`, `title`), `rencontre_dans_les_plis_dossements.json` (21 tests, espace insécable, CRLF), `Loffre_sous_les_braises.json` (instantané GDD) ; plus `data/interactions/rencontre_dans_la_nef_centrale_unity.json` **tel que versionné dans git** (tableau nu).

## Tasks & Acceptance

**Execution:**
- [x] `tests/fixtures/unity_dialogues/inputs/{forgeron-itinerant,voknir-atelier-cartographe,rencontre-plis-ossements,offre-sous-les-braises,nef-centrale}.json` + `inputs/.gitattributes` (`*.json -text`, sinon `eol=lf` réécrit les deux sources CRLF) -- copies octet pour octet.
- [x] `frontend/src/__tests__/unityExport.golden.test.ts` -- fixture × {`front-canonique`, `front-invite`, `front-payload`}. `front-payload` = JSON indenté de `{ ...buildGraphSchemaApiPayload(state.nodes, state.edges, state.dialogueFlagBindings), metadata: state.dialogueMetadata }` (vrai builder, non mocké) après `loadDialogueFromRawJson`, positions mises à `{x:0,y:0}`. `beforeEach` remet aussi `useAuthStore` à zéro. Une erreur propre au harnais (mocks, validation bloquée) **échoue** au lieu d'être figée en `.error.txt` ; un rejet non-`Error` est décrit par `JSON.stringify`. `compareWithGolden` prend le dossier attendu en paramètre et a ses tests (écart nommant fixture, chemin et ligne ; attendu absent sans écriture). `p0` dans le nom du `describe`.
- [x] `tests/services/test_unity_export_golden.py` -- fixture × {`python-graphe`, `python-lot`}, marqueurs `p0` + `unit`. `python-graphe` rend `expected/front-payload/<fixture>.json` exactement comme `graph_io.py:248`. Tests `p0` : liste de fixtures non vide, aucun attendu orphelin dans `expected/*/`. Tests `unit` du comparateur : écart, attendu absent, mise à jour qui retire l'autre forme, chemin qui lève → `.error.txt`.
- [x] `tests/fixtures/unity_dialogues/README.md` -- provenance, structure `expected/<chemin>/`, « figé, défauts compris », ordre de régénération : **Vitest d'abord** (`front-payload` alimente `python-graphe`), puis pytest.
- [x] `tests/fixtures/unity_dialogues/expected/**` -- générés par les deux tests en `UPDATE_GOLDEN=1`, relus, committés.
- [x] `scripts/golden-export-local.py` -- contrôle local par le chemin `python-lot` sur tous les dialogues d'`Assets/Dialogue/` du dépôt principal : `--snapshot` écrit `tmp/golden-local/`, `--check` compare et liste les écarts ; « relancer --snapshot » pour un dialogue nouveau.
- [x] `_bmad-output/implementation-artifacts/deferred-work.md` -- une entrée par écart d'export **réel** constaté dans les attendus (chemin, fixture, effet, cause vérifiée dans le code), sans attribuer à un chemin un défaut qui vient d'ailleurs.

**Acceptance Criteria:**
- Given l'arbre committé, when la CI de PR tourne, then les deux tests passent et `npm run test:backend:smoke` inclut le pytest.
- Given un octet changé dans un fichier attendu (y compris `front-payload`), when on relance le test concerné, then il échoue en nommant fixture et chemin.
- Given la PR, then `git diff --stat origin/main` ne montre que `tests/fixtures/unity_dialogues/**`, les deux tests, le script, la doc et les artefacts BMAD.

## Implementation Notes

- 2026-11-26, passe 2 de revue (correctifs 21–38) : `python-graphe` passe par la vraie route `save-and-write` (`TestClient`) ; elle refuse en **422** le forgeron, les Plis d'ossements et la nef centrale (`id` hors schéma), figés en `.error.txt`. `front-payload` est capturé dans l'appel réel de `useUnityExport` (identique octet pour octet au corps reconstruit de l'itération 1).
- Mutation (AC2) : un octet changé dans `expected/front-payload/nef-centrale.json` fait échouer Vitest (« golden nef-centrale / front-payload … ligne 7 ») ; dans `expected/python-lot/voknir-atelier-cartographe.json`, pytest (« … / python-lot … ligne 3 »). Originaux restaurés.
- Vérification finale : Vitest 23 passed ; pytest 20 passed ; `npm run test:backend:smoke` 279 passed, dont les 12 `p0` du golden ; lint et typecheck à zéro ; script local 36 dialogues, 0 écart.
- Les attendus front (`front-canonique`, `front-invite`) supposent `validate-schema` valide (mocké) : pour les trois fixtures ci-dessus, le bouton « Exporter » est en réalité bloqué. Écarts consignés dans `deferred-work.md`, à corriger dans des PR à part avant 20.4 / 20.8.

## Spec Change Log

- **Itération 1 (2026-11-26)** -- *Déclencheur* : revue (trous de vérification, chasseur aveugle) — `python-graphe` rendait la sortie de `unity_json_to_graph`, graphe que `save-and-write` ne reçoit jamais ; le défaut « START disparaît » en découlait et était attribué à tort à l'export. *Amendé* : Code Map (entrée réelle de `save-and-write`) ; tâches (chemin `front-payload` figé par Vitest et rendu par pytest ; gardes fixtures présentes et attendus orphelins ; tests du comparateur front ; isolation du store d'auth ; erreurs du harnais non figées ; script réduit au chemin lot) ; vérification. *État évité* : golden vert alors que l'export « Exporter depuis l'aperçu », ou celui d'un dialogue jamais enregistré, régresse. *KEEP* (référence : `C:\Users\ecali\AppData\Local\Temp\claude\f1f87b41880f5dd1\003d806a-e59a-4c4a-8182-a2f0b76628df\scratchpad\iteration-0\`) : copies d'entrée et `.gitattributes` identiques ; structure `expected/<chemin>/<fixture>.json|.error.txt` ; comparaison du texte décodé UTF-8 après CRLF→LF ; message « golden <fixture> / <chemin> … ligne N » ; `UPDATE_GOLDEN=1` qui retire l'autre forme ; `python-lot` via `export_persisted_document` et config mockée ; front canonique (`loadDialogueFromRawJson` → `exportToUnity`, `getLayout` en 404) et invité (vrai `useUnityExport`, capture de `registerSuccessfulExport`) ; ancre `process.cwd()`.

## Review Triage Log

| # | Source | Constat | Verdict | Preuve / route |
|---|---|---|---|---|
| 1 | VG, BH | `python-graphe` alimenté par `unity_json_to_graph`, pas par le payload front | high | `graph_io.py:248`, `useUnityExport.ts:113` ; bad_spec (la Code Map l'imposait) |
| 2 | VG | Défaut « START disparaît » attribué à `save-and-write` | medium | `_determine_node_type` n'est appelé que par `unity_json_to_graph` ; même cause que 1 |
| 3 | VG, BH, ECH | Liste de fixtures vide → paramétrage sauté sans échec | medium | pytest « empty parameter set » ; repris en tâche |
| 4 | ECH, BH | Attendus orphelins jamais signalés | low | une assertion ; repris |
| 5 | BH | `compareWithGolden` front sans test | low | réimplémentation non testée ; repris |
| 6 | BH, ECH | Rôle invité non réinitialisé entre cas | low | `beforeEach` ne remet que le graphe ; repris |
| 7 | BH | Erreurs du harnais figées en `.error.txt` | medium | `renderGuest` lève sa propre erreur, avalée par `render` ; repris |
| 8 | ECH | Rejet non-`Error` décrit « [object Object] » | low | correction directe ; repris |
| 9 | ECH, BH | Script : message « UPDATE_GOLDEN » pour un dialogue nouveau | low | correction directe ; repris |
| 10 | BH | `UPDATE_GOLDEN` qui fuirait en CI | low | rejeté : la CI ne la pose pas ; ajouterait une garde |
| 11 | BH | Messages d'erreur figés non portables | maybe-false | rejeté : aucune fixture ne lève ; se verra au premier `.error.txt` |
| 12 | BH | Comparaison non octet pour octet | false | CRLF→LF voulu (bloc figé) ; le BOM survit à `decode` et `readFileSync` |
| 13 | BH, ECH | Ancre `process.cwd()` | low | rejeté : `import.meta.url` inutilisable sous jsdom ; convention des tests PWA |
| 14 | BH | `dialogueFlags`, noms de fichier, `skip_validation` non figés | low | rejeté : aucune source réelle n'a de `dialogueFlags` ; hors contenu exporté |
| 15 | BH | Le script importe un module de test | low | rejeté : un seul consommateur, local |
| 16 | BH | Comptes « 10 passed » faux dans la spec | low | rejeté : correctif = éditer la spec (repris par l'amendement) |
| 17 | BH | Entrée différée `source_spec: none` ; une seule clé de suivi | low | rejeté : entrée écrite avant la spec ; suivi par commentaire assumé |
| 18 | ECH | Script : UTF-8 invalide, `--source` vide | low | rejeté : improbable, ajoute des branches |
| 19 | ECH | `nef-centrale` ≠ copie de travail du dépôt principal | false | la source est le blob git (LF) ; la copie de travail principale est en CRLF |
| 20 | VG | `front-canonique` saute `saveDialogue()` | low | rejeté : `saveDialogue` persiste sans réécrire ce qu'exporte `exportToUnity` ; mock lourd |
| 21 | ECH, VG | `python-graphe` s'arrête avant la validation de schéma de la route (`graph_io.py:254`) | high | vérifié : le validateur refuse forgeron, Plis d'ossements, nef centrale (`id` hors schéma) ; patch : passer par la route (`TestClient`) |
| 22 | VG | Glue de la route (`title`, flags) non couverte : le test appelle le sérialiseur lui-même | medium | `test_graph_crud.py:323` ne vérifie ni titre ni contenu ; même correctif que 21 |
| 23 | VG | `front-payload` reconstruit le corps au lieu de capturer celui que `useUnityExport` envoie | medium | `renderPayload` appelle le builder directement ; patch : capturer `saveGraphAndWrite.mock.calls[0][0]` avec `documentId: null` |
| 24 | VG | `python-lot` toujours en `skip_validation=True` | medium | défaut de l'API = validation ; defer (gèlerait des `.error.txt`, relève de la PR des écarts) |
| 25 | ECH, BH | Attendu `python-graphe` périmé quand `front-payload` devient une erreur (skip silencieux) | low | correction directe ; patch |
| 26 | ECH | Fichier posé directement sous `expected/` jamais signalé | low | une ligne ; patch |
| 27 | ECH | `describeError` sur rejet circulaire / `undefined` | low | try/catch direct ; patch |
| 28 | ECH, BH | Instantané local sans provenance (source) | low | patch limité : enregistrer la source, refuser `--check` si elle diffère |
| 29 | ECH, BH | Entrées différées : cause et story concernée imprécises (export en réalité bloqué par la validation pour 3 fixtures) | medium | vérifié par 21 ; patch : réécrire les entrées du diff |
| 30 | BH | Contrôle local limité à `python-lot` | medium | defer : choix de la spec ; à reprendre avec le script du volet 2 |
| 31 | BH | Aucune fixture au modèle actuel avec une issue à `END` | medium | defer : le bloc figé fixe 5 dialogues ; à ajouter avant 20.8 |
| 32 | BH | `nef-centrale` décrite comme legacy alors que c'est un artefact à un nœud | low | patch README |
| 33 | BH | Passage `.json` ↔ `.error.txt` silencieux en mise à jour | low | rejeté : visible au diff ; ajouterait un mode |
| 34 | BH | Config du lot en `MagicMock` sans `spec` | low | `create_autospec` direct ; patch |
| 35 | BH | Plan de test et contexte d'epic parlent de « trois chemins » et « mêmes fichiers attendus » | medium | 20.4 et 20.8 seraient rédigées sur une liste fausse ; patch des deux documents |
| 36 | BH | AC2 sans étape de vérification sur les vrais attendus | low | rejeté : correctif = éditer la spec ; mutation citée dans les notes |
| 37 | BH | README : « sans fixture ni chemin » (ET au lieu de OU), « 36 » figé dans un titre | low | patch README |
| 38 | BH | Cas « autre forme » sans test dans le comparateur Vitest | low | un test ; patch |
| 39 | BH | `python-graphe` : titre toujours « Dialogue Unity », aucun flag | low | rejeté : limite des fixtures réelles ; la route couvre désormais la glue |
| 40 | ECH | Fixture sans nœud prise pour une panne du banc | maybe-false | rejeté : aucune fixture vide |
| 41 | VG | « Exporter depuis l'aperçu » d'un dialogue déjà sur disque → 409 `canonical_revision_required` | maybe-false (medium si vrai) | defer : préexistant, lu dans le code, non exécuté |

## Design Notes

Un fichier attendu **par chemin** : la sonde du 2026-11-26 montre que les chemins diffèrent déjà ; un fichier unique obligerait à modifier l'export, interdit ici. `front-payload` est à la fois un attendu (il fige `buildGraphSchemaApiPayload`) et l'entrée de `python-graphe` : seule façon de tester `save-and-write` sur ce qu'il reçoit vraiment, sans e2e. Positions à zéro : le rendu Python ne les lit pas, et la redisposition de 20.7 ne doit pas faire tomber le golden. La sélection remplace *Le prix d'une vérité d'Uresaïr* (1 nœud) par les Plis d'ossements.

## Verification

**Commands:**
- `cd frontend && npx vitest run src/__tests__/unityExport.golden.test.ts --reporter=dot` -- tout vert (15 cas golden + tests du comparateur)
- `node scripts/getPythonPath.js -m pytest tests/services/test_unity_export_golden.py -v` -- tout vert (10 cas golden + gardes + tests du comparateur)
- `npm run test:backend:smoke` -- le golden y figure, vert
- `npm --prefix frontend run lint` et `npm --prefix frontend run typecheck` -- zéro erreur
- `.venv/Scripts/python.exe scripts/golden-export-local.py --snapshot` puis `--check` -- 0 écart
