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
| `front-canonique` | Vitest | `loadDialogueFromRawJson` (layout en 404) puis `exportToUnity` (`documentToGraph → graphToDocument`) : projection graphe → document, celle que l'autosave persiste ; n'est plus le fichier téléchargé (voir `python-apercu`) |
| `front-invite` | Vitest | vrai `useUnityExport` en session invitée : `JSON.stringify(state.document)` |
| `front-payload` | Vitest | corps que le vrai `useUnityExport` passe à `saveGraphAndWrite` (capturé sur le mock) pour le dialogue chargé, `documentId` remis à `null`, positions mises à `{x: 0, y: 0}` |
| `python-graphe` | pytest | `POST /api/v1/unity-dialogues/graph/save-and-write` (vraie route, `TestClient`, dossier Unity temporaire) avec `expected/front-payload/<fixture>.json` pour corps : `json_content` de la réponse 2xx, sinon `.error.txt` |
| `python-lot` | pytest | `export_persisted_document` (export par lot, `skip_validation=True`), réécrit sur place |
| `python-lot-valide` | pytest | le même avec la validation de schéma Unity, défaut de `POST /dialogues/batch-export` |
| `python-apercu` | pytest | `preview_persisted_document` (`GET /dialogues/{id}/preview-export`) : ce que télécharge « Exporter », depuis le menu ou l'aperçu, pour un dialogue qui a un `documentId`, après sauvegarde par révision ; un document refusé par le schéma est figé en `.error.txt` |

`<fixture>.json` contient la sortie telle quelle ; si le chemin rejette l'entrée,
`<fixture>.error.txt` fige l'erreur : `Type: message`, ou pour `python-graphe`
`HTTP <statut>: <corps JSON>` (clés triées, sans `request_id` ni chemin local). Seule la Nef
centrale est refusée (id uuid nu, voir plus bas). Une défaillance du banc
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

## Figé : ce qui est voulu, ce qui reste

Générés d'abord depuis le code du 2026-11-26 (`ad67bb836`) sans le modifier, les attendus
ont été régénérés par la PR des écarts d'export (`fix/export-unity-golden-ecarts`) :

- ids `NODE_…` de l'ancien générateur (`NODE_START_CHOICE_3`…) acceptés par le schéma :
  le forgeron et les Plis d'ossements s'exportent (`python-graphe` passe de `.error.txt` à
  `.json`) ;
- `front-payload` porte le `sourceHandle` des arêtes : `python-graphe` rend les issues des
  choix testés comme le lot ;
- flags translittérés (`RéparationImparfaite` → `REPARATIONIMPARFAITE`, plus
  `R_PARATIONIMPARFAITE`) ;
- « Exporter » d'un dialogue enregistré sert `python-apercu`, identique octet pour octet à
  `python-lot` et `python-lot-valide`.

Voulu, figé tel quel :

- **Nef centrale refusée** : artefact de l'ancien stockage `data/interactions/` (obsolète),
  un seul nœud à id uuid dont `line` contient tout le dialogue en chaîne JSON. Le refus
  vient de l'id ; l'exporter produirait un nœud illisible dans Unity.
- **Choix testé et ciblé** : les 4 issues routent le choix, sa `targetNode` n'est qu'un
  champ requis par le schéma (`END`). Le lot garde la cible d'un fichier source jamais
  réédité parce qu'il réécrit le document tel quel (`preserve_source_fields`).
- **Choix vides `__idx_N` retirés même testés** : sans texte ni cible, ils feraient des
  boutons vides dans Unity ; la Santé signale le nœud (« contenu vide »).
- **`front-invite` non normalisé** : un invité n'a pas accès à `preview-export` (lecture
  réservée au propriétaire) ; il télécharge le document tel qu'il est stocké.

Reste ouvert (`deferred-work.md`) : métadonnées éditeur (`status`, `contextGddHash`…)
retirées par `python-graphe`, gardées par le lot et l'aperçu, à ramener à une seule liste
avant 20.4.

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
