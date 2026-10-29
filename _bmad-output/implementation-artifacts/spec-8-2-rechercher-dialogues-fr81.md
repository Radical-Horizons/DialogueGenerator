---
title: 'Story 8.2 — Rechercher des dialogues (nom, personnage, réplique) (FR81)'
type: 'feature'
created: '2026-08-03'
status: 'done'
baseline_commit: '3ab4c50414741f82642abf4ab5ed552a6c274d0d'
review_loop_iteration: 0
context:
  - '{project-root}/_bmad-output/implementation-artifacts/epic-8-context.md'
  - '{project-root}/_bmad-output/implementation-artifacts/spec-8-1-lister-tous-les-dialogues-fr80.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** La recherche de la bibliothèque (`useDialogueListData`) ne filtre que sur `filename`/`title`. FR81 veut retrouver un dialogue par **personnage** ou par le **contenu des répliques**, non exposés au front. `lieu`/`thème` n'existent dans aucun dialogue Unity persisté (retirés à l'export) → hors périmètre MVP.

**Approach:** Enrichir chaque item du listing avec `speakers` (personnages uniques) et `search_text` (répliques concaténées, minuscules, bornées), extraits du JSON **déjà parsé** lors du listing (aucune relecture disque). Étendre le filtre client-side existant (cohérent 8.1) pour matcher nom + personnage + réplique, insensible à la casse. Afficher les personnages sur l'item pour rendre le match lisible.

## Boundaries & Constraints

**Always:**
- Réutiliser `GET /api/v1/unity-dialogues`, `UnityDialogueMetadata`, `useDialogueListData`, `UnityDialogueItem` (étendre, pas dupliquer).
- Extraction dans la passe JSON existante de `unity_dialogues.py` : `speakers` = `speaker` uniques (ordre d'apparition, dédupe exacte) ; `search_text` = `line` concaténés minuscules, borné à `SEARCH_TEXT_MAX_CHARS` (2000).
- Recherche **client-side**, insensible à la casse, sur `filename`, `title`, `speakers`, `search_text` (un seul terme libre en MVP).
- Champs optionnels/rétrocompat ; `None` si JSON illisible (jamais de crash, item conservé). Types TS alignés Pydantic ; docstrings + annotations Python ; `pathlib.Path`/UTF-8.

**Ask First:**
- Si `search_text` embarqué devient coûteux (>quelques centaines de dialogues) → escalader vers l'index serveur 8.6, ne pas optimiser ici.
- Filtres multi-critères combinables (badges, ET) = 8.3, ne pas anticiper.

**Never:**
- Pas de `lieu`/`thème` (aucune donnée source ; ne pas modifier le format Unity ni utiliser les snapshots GDD non exportés).
- Pas d'endpoint `/dialogues/search`, `DialogueSearchService`, ni index SQLite full-text (8.6).
- Ne pas régresser recherche/pagination/tri ni les autres consommateurs du listing (combobox, palette).

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Behavior |
|----------|--------------|-------------------|
| Personnage | query « ures », nœud `speaker:"Uresaïr"` | dialogue matché |
| Réplique | query « fissures » présent dans un `line` | matché via `search_text` |
| Casse | « URESAÏR » vs « uresaïr » | même résultat |
| Non-régression nom | fragment de `filename`/`title` | toujours matché |
| Speakers uniques | 2 nœuds « Uresaïr » + 1 « Voknir » | `["Uresaïr","Voknir"]` |
| JSON illisible | `.json` non parsable | `speakers`/`search_text` = null, item listé, log warning |
| Sans speaker | nœuds sans `speaker` | `speakers`=[] ; nom/réplique cherchables |
| Texte long | répliques > 2000 car. | `search_text` tronqué (limite MVP assumée) |

</frozen-after-approval>

## Code Map

- `api/routers/unity_dialogues.py` -- passe de listing (JSON parsé L239-251) ; ajouter helper d'extraction `speakers` + `search_text` dans la même passe
- `api/schemas/dialogue.py` -- `UnityDialogueMetadata` (~L678) : `speakers: list[str] | None`, `search_text: str | None`
- `frontend/src/types/api.ts` -- `UnityDialogueMetadata` (~L534) : mirror `speakers?`, `search_text?`
- `frontend/src/hooks/useDialogueListData.ts` -- prédicat de recherche (L90-100) : étendre à `speakers` + `search_text`
- `frontend/src/components/unityDialogues/UnityDialogueItem.tsx` -- afficher les personnages (compact)
- `tests/api/test_unity_dialogues.py` + `useDialogueListData.test.ts` + `UnityDialogueList.test.tsx` -- couverture

## Tasks & Acceptance

**Execution:**
- [x] `api/schemas/dialogue.py` -- ajouter `speakers`/`search_text` optionnels à `UnityDialogueMetadata`
- [x] `api/routers/unity_dialogues.py` -- extraire `speakers` (uniques, ordre) et `search_text` (`line` concaténés, minuscules, borné 2000) dans la passe JSON existante ; `None` si illisible
- [x] `frontend/src/types/api.ts` -- mirror des deux champs
- [x] `frontend/src/hooks/useDialogueListData.ts` -- étendre le filtre à `speakers` + `search_text` (insensible casse)
- [x] `frontend/src/components/unityDialogues/UnityDialogueItem.tsx` -- afficher les personnages
- [x] `tests/api/test_unity_dialogues.py` -- speakers uniques (legacy + document), search_text minuscule/borné, illisible → null
- [x] `frontend/src/hooks/useDialogueListData.test.ts` -- match personnage, réplique, casse, non-régression nom
- [x] `frontend/src/components/unityDialogues/UnityDialogueList.test.tsx` -- taper un personnage filtre ; item affiche les personnages

**Acceptance Criteria:**
- Given un nœud `speaker:"Uresaïr"`, when je tape « ures », then le dialogue apparaît.
- Given « fissures » dans une réplique, when je tape « fissures », then le dialogue apparaît.
- Given une recherche sans résultat, when elle s'applique, then « Aucun dialogue trouvé » et « (sur N total) » restent corrects.
- Given un item avec personnages, when il s'affiche, then ils sont visibles sur la ligne.
- Given une recherche par nom, when je tape, then le comportement 8.1 est inchangé (combobox/palette/pagination/tri).

## Design Notes

Client-side + extraction listing (pas endpoint/index) : l'endpoint parse déjà chaque JSON une fois pour `title`/`node_count` ; ajouter `speakers`/`search_text` y est marginal et évite un 2e scan. Le filtre reste dans `useDialogueListData` sur le corpus complet (pattern 8.1), préservant recherche+pagination sans nouvel endpoint. Index full-text et perf 1000+ = 8.6. Limites MVP assumées (dette 8.6) : `lieu`/`thème` non cherchables (aucune donnée), `search_text` borné à 2000 caractères.

## Verification

**Commands:**
- `npm run test:backend:fast` -- `test_unity_dialogues*` verts
- `npm --prefix frontend run lint` -- zéro erreur
- `npm run test:frontend:quick` -- hook + liste (match personnage/réplique) verts

**Manual checks:**
- `npm run dev` → taper un personnage filtre la liste ; taper un extrait de réplique filtre ; personnages visibles sur l'item.

## Suggested Review Order

**Extraction backend (source des champs cherchables)**

- Point d'entrée : extraction personnages + texte en une passe sur le JSON déjà parsé.
  [`unity_dialogues.py:106`](../../api/routers/unity_dialogues.py#L106)

- Câblage dans la boucle de listing (uniquement si nœuds parsables → None sinon).
  [`unity_dialogues.py:296`](../../api/routers/unity_dialogues.py#L296)

- Champs exposés sur la métadonnée renvoyée.
  [`unity_dialogues.py:332`](../../api/routers/unity_dialogues.py#L332)

**Contrat API**

- Schéma Pydantic : `speakers` / `search_text` optionnels.
  [`dialogue.py:707`](../../api/schemas/dialogue.py#L707)

- Miroir TypeScript aligné.
  [`api.ts:543`](../../frontend/src/types/api.ts#L543)

**Recherche client-side (comportement FR81)**

- Prédicat étendu : nom + personnage + réplique, trim + casse.
  [`useDialogueListData.ts:98`](../../frontend/src/hooks/useDialogueListData.ts#L98)

- Affichage des personnages sur l'item (borné « +N »).
  [`UnityDialogueItem.tsx:150`](../../frontend/src/components/unityDialogues/UnityDialogueItem.tsx#L150)

**Tests (support)**

- Backend : extraction speakers/search_text + edge cases.
  [`test_unity_dialogues.py:358`](../../tests/api/test_unity_dialogues.py#L358)

- Front : match personnage/réplique, sous-chaîne, casse, champs null, trim.
  [`useDialogueListData.test.ts:109`](../../frontend/src/hooks/useDialogueListData.test.ts#L109)
