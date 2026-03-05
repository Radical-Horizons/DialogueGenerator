# E2E ADR-008 – Pièges et contournements

Ce document décrit les causes de flakiness ou d’échecs rencontrés sur les tests E2E de l’éditeur de graphe (Story 16.6, specs `documents-layout-adr008.spec.ts`, `graph-load-display-nodes.spec.ts`) et les bonnes pratiques pour les éviter.

## 1. Liste des dialogues en double (Édition / Graphe)

**Constat** : La liste des dialogues Unity est rendue à la fois dans l’onglet « Édition » et dans l’onglet « Éditeur de Graphe ». C’est volontaire (deux modes d’édition, même liste).

**Problème** : Un sélecteur `page.getByTestId('unity-dialogue-list')` sans scope peut cibler la première instance dans le DOM (celle de l’onglet Édition si elle est encore montée), donc cliquer sur un item ne charge pas le graphe.

**Contournement** : Toujours scoper la liste au contexte de l’onglet actif :

```ts
page.getByTestId('graph-editor').getByTestId('unity-dialogue-list')
```

Après avoir cliqué sur l’onglet « Éditeur de Graphe », utiliser ce locator pour attendre et interagir avec la liste. Référence : `.cursor/rules/frontend_testing.mdc`.

---

## 2. react-hook-form et Playwright `fill()`

**Constat** : En E2E, après `page.locator('input[name="speaker"]').fill(valeur)`, l’input affiche la valeur mais le fichier sauvegardé contient parfois l’ancienne valeur.

**Cause** : react-hook-form met à jour son store interne principalement via l’événement natif `change`. Playwright `fill()` déclenche surtout `input`. Lors du flush avant save (`flush-node-editor-form` → `form.getValues()`), les valeurs peuvent être encore anciennes.

**Contournements** :

- **Option A** : Après les `fill()`, déclencher un blur (ex. `page.keyboard.press('Tab')` ou clic sur le canvas) pour forcer `change`, puis attendre le debounce (~300 ms) avant de déclencher la sauvegarde.
- **Option B** : Ne pas asserter la valeur exacte persistée dans le fichier après save ; vérifier que la requête save retourne 200 et que le fichier contient des nœuds valides (structure). Ou asserter la persistance via **API** (GET du fichier) dans un test dédié sans dépendre du formulaire RHF en E2E.

Référence : `.cursor/rules/frontend_testing.mdc` (section Formulaires + Playwright).

---

## 3. Format document vs legacy (GET unity-dialogue)

**Constat** : Les fixtures E2E créées via `PUT /api/v1/documents/{id}` écrivent un document au format `{ "schemaVersion": "1.1.0", "nodes": [...] }`. Si l’endpoint `GET /api/v1/unity-dialogues/{filename}` n’acceptait que le format legacy (tableau de nœuds à la racine), la lecture renvoyait 422 et les tests échouaient.

**Solution** : Le backend accepte les deux formats : si le JSON lu est un objet avec une clé `nodes`, il renvoie uniquement le tableau `nodes` (normalisé) pour compatibilité avec `loadGraph`. Voir `api/routers/unity_dialogues.py` (get_unity_dialogue).

**Non-régression** : Le test API `test_read_unity_dialogue_document_format` dans `tests/api/test_unity_dialogues.py` vérifie qu’un fichier au format document est accepté et que `json_content` est bien le tableau de nœuds.

---

## 4. Seed E2E et 409 (optimistic locking)

**Constat** : Un `beforeAll` ou setup qui fait un `PUT /api/v1/documents/{id}` peut recevoir 409 si le document existe déjà avec une révision plus récente.

**Contournement** : Boucle de retry : en cas de 409, lire la `revision` dans le corps de la réponse et réessayer le PUT avec cette révision. Convention documentée dans `.cursor/rules/frontend_testing.mdc` et utilisée dans `e2e/documents-layout-adr008.spec.ts`.

---

## Références

- Specs E2E : `e2e/documents-layout-adr008.spec.ts`, `e2e/graph-load-display-nodes.spec.ts`, `e2e/graph-node-accept-reject.spec.ts`
- Règles : `.cursor/rules/frontend_testing.mdc`
- Backend : `api/routers/unity_dialogues.py` (GET normalization document → nodes)
- Tests API : `tests/api/test_unity_dialogues.py` (TestReadUnityDialogue.test_read_unity_dialogue_document_format)
