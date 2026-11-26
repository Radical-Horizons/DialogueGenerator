# Golden de l'export Unity

Référence de sortie des chemins d'export Unity (Story 20.1, risque R-01 du plan de test de
l'epic 20). Deux tests `p0` lisent cette arborescence et échouent sur le moindre caractère
différent :

- `frontend/src/__tests__/unityExport.golden.test.ts` : chemins front ;
- `tests/services/test_unity_export_golden.py` : chemins Python.

Les deux tournent dans la CI de PR (Vitest sans `VITEST_FULL`, pytest `not slow`) et le
pytest dans `npm run test:backend:smoke`.

## Entrées (`inputs/`)

Copies octet pour octet, renommées en ASCII. `inputs/.gitattributes` les soustrait à la
normalisation `eol=lf` du dépôt : le forgeron et les Plis d'ossements sont en CRLF.

| Fichier | Source (dépôt principal) | Ce qu'il couvre |
|---|---|---|
| `forgeron-itinerant.json` | `Assets/Dialogue/rencontre_avec_le_forgeron_itinérant.json` | 19 nœuds, 48 tests, métadonnées éditeur (`status`, `contextGddHash`…), test au niveau du nœud (`START`), choix vides `__idx_N` |
| `voknir-atelier-cartographe.json` | `Assets/Dialogue/voknir_latelier_du_cartographe.json` | import Notion, `title` en tête, `*[Vous`, choix à la fois testés et ciblés |
| `rencontre-plis-ossements.json` | `Assets/Dialogue/rencontre_dans_les_plis_dossements.json` | 11 nœuds, 21 tests, espace insécable |
| `offre-sous-les-braises.json` | `Assets/Dialogue/Loffre_sous_les_braises.json` | instantané de contexte GDD (`gddContextSelectionsSnapshot`, empreintes) |
| `nef-centrale.json` | `data/interactions/rencontre_dans_la_nef_centrale_unity.json`, blob versionné dans git (LF) | artefact d'un seul nœud (id uuid) dont `line` contient un tableau JSON sous forme de chaîne ; gardé pour l'enveloppe du tableau nu (forme legacy, sans `schemaVersion`) |

Toute nouvelle entrée déposée dans `inputs/` est prise d'office par les deux tests ; sans
attendu, ils échouent en demandant `UPDATE_GOLDEN=1`.

## Attendus (`expected/<chemin>/`)

Un fichier par chemin et par entrée, car les chemins diffèrent déjà entre eux :

| Chemin | Test | Code exercé |
|---|---|---|
| `front-canonique` | Vitest | `loadDialogueFromRawJson` (layout en 404) puis `exportToUnity` (`documentToGraph → graphToDocument`) : export d'un document qui a un `documentId` |
| `front-invite` | Vitest | vrai `useUnityExport` en session invitée : `JSON.stringify(state.document)` |
| `front-payload` | Vitest | corps que le vrai `useUnityExport` passe à `saveGraphAndWrite` (capturé sur le mock) pour le dialogue chargé, `documentId` remis à `null`, positions mises à `{x: 0, y: 0}` |
| `python-graphe` | pytest | `POST /api/v1/unity-dialogues/graph/save-and-write` (vraie route, `TestClient`, dossier Unity temporaire) avec `expected/front-payload/<fixture>.json` pour corps : `json_content` de la réponse 2xx, sinon `.error.txt` |
| `python-lot` | pytest | `export_persisted_document` (export par lot, `skip_validation=True`), réécrit sur place |

`<fixture>.json` contient la sortie telle quelle ; si le chemin rejette l'entrée,
`<fixture>.error.txt` fige l'erreur : `Type: message`, ou pour `python-graphe`
`HTTP <statut>: <corps JSON>` (clés triées, sans `request_id` ni chemin local). Aujourd'hui la
route refuse en 422 le forgeron, les Plis d'ossements et la Nef centrale (ids de nœud hors
schéma) ; ces trois `.error.txt` sont ce que l'utilisateur obtient. Une défaillance du banc
(mock, validation bloquée, corps `front-payload` absent) fait échouer le test sans rien
figer ; si `front-payload` devient un `.error.txt`, un ancien attendu `python-graphe` fait
échouer le pytest (retiré en mode mise à jour).
La comparaison porte sur le texte UTF-8, fins de ligne ramenées à LF (le chemin lot écrit
en CRLF sous Windows). Aucune normalisation JSON : l'ordre des clés et l'indentation font
partie du contrat. Un attendu sans fixture, ou rangé sous un chemin inconnu (ou hors de
tout chemin, directement sous `expected/`), fait échouer le pytest.

`front-payload` est à la fois un attendu (il fige le corps construit par `useUnityExport`)
et l'entrée de `python-graphe` : c'est ainsi que `save-and-write` est testé, validation et
glue de la route comprises, sur ce qu'il reçoit vraiment, sans e2e. Les positions sont mises à zéro parce que le rendu Python ne les lit
pas et qu'une redisposition ne doit pas faire tomber le golden. `loadDialogueFromRawJson`
pose `metadata.title = "Dialogue Unity"` : c'est le titre que `python-graphe` écrit pour
toutes les fixtures acceptées (en production, `save-and-write` ne reçoit que des dialogues sans
`documentId`, avec leur propre titre).

## Figé, défauts compris

Les attendus ont été générés depuis le code du 2026-11-26 (`ad67bb836`), sans le modifier.
Ils figent aussi les défauts actuels. Ceux qui sont réels, avec leur cause, sont dans
`_bmad-output/implementation-artifacts/deferred-work.md` (source : spec 20-1a). En bref :

- `python-graphe` refuse en 422 trois fixtures sur cinq (ids hors schéma) ; `validate-schema`
  les refuse aussi, donc « Exporter » est bloqué pour elles quel que soit le chemin ;
- `python-graphe` perd toutes les issues des choix testés (6 sur Voknir ; le défaut touche
  aussi le forgeron et les Plis, masqué par le refus) : `buildGraphApiPayload` n'envoie pas
  le `sourceHandle` des arêtes ;
- un choix à la fois testé et ciblé garde sa cible par le lot, la perd par `front-canonique`,
  et reçoit `END` par `python-graphe` ;
- les chemins Python normalisent (flags en majuscules, lettres accentuées perdues, choix
  vides `__idx_N` retirés même s'ils portent un test, `null` et `condition` vides retirés,
  `targetNode: "END"` sur les choix testés) ; les chemins front ne le font pas ;
- métadonnées éditeur et `title` : gardées par le lot, en partie par le front, retirées par
  `python-graphe`.

Corriger un de ces écarts se fait dans une PR à part, qui régénère les attendus et dit
pourquoi dans sa description. Un attendu ne s'écrit jamais à la main.

## Régénérer

**Vitest d'abord** : `front-payload` alimente `python-graphe`.

```bash
# racine du dépôt
cd frontend && UPDATE_GOLDEN=1 npx vitest run src/__tests__/unityExport.golden.test.ts && cd ..
UPDATE_GOLDEN=1 node scripts/getPythonPath.js -m pytest tests/services/test_unity_export_golden.py
```

PowerShell : `$env:UPDATE_GOLDEN='1'` avant les commandes, puis `Remove-Item Env:UPDATE_GOLDEN`.
Relancer ensuite les deux tests sans la variable, puis relire `git diff` des attendus.

## Contrôle local des dialogues d'`Assets/Dialogue/`

`Assets/Dialogue/` n'est pas dans la CI. Avant et après un changement d'export, par le chemin
`python-lot` :

```bash
.venv/Scripts/python.exe scripts/golden-export-local.py --snapshot   # avant
.venv/Scripts/python.exe scripts/golden-export-local.py --check      # après : liste les écarts
```

L'instantané va dans `tmp/golden-local/` (ignoré par git). Depuis un worktree, le script lit
`Assets/Dialogue/` du dépôt principal ; `--source` choisit un autre dossier. `--snapshot`
note la source dans `tmp/golden-local/source.txt`, et `--check` refuse (code 2) de comparer
à un instantané pris depuis une autre source. Un dialogue
ajouté depuis l'instantané est signalé : relancer `--snapshot`.
