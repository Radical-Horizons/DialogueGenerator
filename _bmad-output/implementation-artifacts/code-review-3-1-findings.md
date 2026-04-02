# Code Review – Story 3.1 (FR11) – Parcourir entités GDD

**Story:** 3-1-parcourir-entités-gdd-disponibles-personnages-lieux-régions-thèmes-fr11  
**Statut story:** review  
**Date:** 2026-03-14  
**Reviewer:** Amelia (Dev Agent – revue adverse)

---

## Git vs File List

- **Fichiers modifiés (git) hors File List :** `_bmad/` (hors périmètre app), `sprint-status.yaml` (présent dans File List). Pas de divergence bloquante.
- **File List vs implémentation :** Tous les fichiers listés dans la story sont bien modifiés/créés (gddSummary, useDebounce, constants, ContextList, ContextSelector, ContextDetail, Dashboard, context.ts, api.ts). Aucune réclamation fausse.

---

## Synthèse des constats

| Sévérité | Nombre | Exemples |
|----------|--------|----------|
| CRITICAL | 0 | — |
| HIGH | 1 | Onglet Thèmes vide (AC#1 non respecté) |
| MEDIUM | 3 | getItem() charge toute la liste ; pas de test dédié ContextList ; total_pages manquant dans mocks |
| LOW | 4 | ESLint unused var ; Thèmes non documenté ; Régions détail via getLocation ; act() warning (hors story) |

---

## CRITICAL

*Aucun.*

---

## HIGH

### 1. Onglet « Thèmes » affiché mais jamais alimenté (AC#1 partiel)

- **AC#1 :** « je vois des onglets pour chaque type d'entité : … Thèmes » **et** « chaque onglet affiche la liste des entités disponibles ».
- **Constat :** L’onglet Thèmes existe dans `ContextSelector.tsx` mais `themes` est initialisé à `[]` et n’est jamais rempli. Aucun appel API type `listThemes()` ; le backend n’expose pas d’endpoint `/context/themes`.
- **Fichiers :** `frontend/src/components/context/ContextSelector.tsx` (l.47, onglet Thèmes), backend `api/routers/context.py` (aucun route thèmes).
- **Recommandation :** Soit implémenter un endpoint + chargement des thèmes (si les données GDD le permettent), soit retirer temporairement l’onglet Thèmes et documenter la limite en Dev Notes / AC.

---

## MEDIUM

### 2. `getItem(name)` charge toute la liste (performance, 500+ entités)

- **Constat :** `frontend/src/api/context.ts` (l.86–93) : `getItem(name)` appelle `listItems()` sans pagination, puis fait un `find` sur le tableau. Avec 500+ objets, chaque détail d’objet déclenche un chargement complet.
- **Impact :** Latence et charge inutile (AC#5 : chargement initial &lt;200 ms, navigation fluide).
- **Recommandation :** Ajouter un endpoint `GET /api/v1/context/items/{name}` côté backend (comme pour characters/locations) et l’utiliser dans `getItem()`, ou au minimum paginer/cache côté client pour ne pas recharger toute la liste.

### 3. Pas de tests unitaires dédiés à `ContextList`

- **Constat :** La story liste `ContextSelector.test.tsx` et `ContextDetail.test.tsx` mais pas de `ContextList.test.tsx`. Or `ContextList` porte la recherche (debounce 300 ms), les badges de type, le scroll infini et le tri — comportements critiques pour AC#2 et AC#4.
- **Recommandation :** Ajouter `ContextList.test.tsx` (ou étendre les tests existants) pour : filtrage par recherche, debounce, badge type d’entité, appel à `onScrollToBottom` au scroll.

### 4. Mocks de liste sans `total_pages` dans les tests

- **Constat :** `ContextSelector.test.tsx` mocke les réponses list avec `{ characters: [...], total: 1 }` sans `total_pages`. Le code utilise `charsRes.total_pages ?? 1`, donc les tests passent par défaut mais ne valident pas la pagination (loadMore, total_pages &gt; 1).
- **Fichiers :** `frontend/src/components/context/ContextSelector.test.tsx` (l.71–95).
- **Recommandation :** Ajouter `total_pages` (et éventuellement `page`, `page_size`) dans les mocks pour refléter l’API et couvrir le cas « plusieurs pages ».

---

## LOW

### 5. Variable délibérément inutilisée dans `ContextList`

- **Constat :** `ContextList.tsx` l.49 : `onSelectDetail: _onSelectDetail` avec commentaire eslint-disable. Le callback n’est pas utilisé dans le composant (la sélection détail est gérée par le parent via `onItemClick`). Cohérent avec le design actuel mais reste un code mort.
- **Recommandation :** Retirer la prop du type si le parent n’en a pas besoin, ou documenter pourquoi elle est conservée pour une évolution future.

### 6. Onglet Thèmes non documenté dans la story

- **Constat :** Les Dev Notes / File List ne mentionnent pas l’absence de source de données pour Thèmes. Un lecteur pourrait croire que les 7 onglets sont tous fonctionnels.
- **Recommandation :** Dans la story (Dev Notes ou Completion Notes), indiquer explicitement que Thèmes est en attente d’API / données GDD.

### 7. Régions : détail via `getLocation(name)`

- **Constat :** Pour l’onglet Régions, au clic sur une entrée on appelle `getLocation(name)` (l.174–176). Les régions sont des noms retournés par `listRegions()` ; le backend n’a pas de `GET /regions/{name}`. Utiliser le lieu du même nom peut être voulu si les régions sont des lieux avec catégorie « Région », mais ce n’est pas évident.
- **Recommandation :** Vérifier avec le backend / GDD que région → `getLocation(name)` est le comportement attendu ; sinon prévoir un endpoint dédié ou un fallback (ex. sous-lieux uniquement).

### 8. Warning `act()` dans un test hors story

- **Constat :** Les tests Vitest signalent un warning « An update to JumpToNodeModal inside a test was not wrapped in act(...) » dans `JumpToNodeModal.test.tsx`. Hors périmètre de la story 3.1.
- **Recommandation :** À traiter dans un autre ticket pour garder les tests propres.

---

## Validation des AC (résumé)

| AC | Statut | Commentaire |
|----|--------|-------------|
| AC#1 | Partiel | Onglets OK ; Thèmes sans données. |
| AC#2 | OK | Liste virtualisée / paginée, recherche debounce, badges type. |
| AC#3 | OK | Panneau détails avec nom, résumé, sections expand/collapse. |
| AC#4 | OK | Recherche temps réel, badge type dans les résultats. |
| AC#5 | OK | Première page limitée (50), indicateur chargement ; NFR &lt;200 ms par conception. |

---

## Validation des tâches marquées [x]

- **Task 1 (Panneau Contexte GDD, onglets) :** Fait. Titre « Contexte GDD », 7 onglets dont Thèmes (données Thèmes manquantes).
- **Task 2 (Liste virtualisée, recherche, badges) :** Fait. Pagination API, loadMore, debounce 300 ms, badges.
- **Task 3 (Panneau détails expand/collapse) :** Fait. ContextDetail avec sections, aria, clavier.
- **Task 4 (Performance) :** Fait. Chargement première page, indicateur, pas de sur-fetch initial.

---

## Recommandation de statut

- **HIGH restant (Thèmes) :** À traiter avant de passer la story en **done** (soit implémentation, soit retrait de l’onglet + doc).
- Une fois ce point décidé (et éventuellement les MEDIUM traités ou reportés), mettre à jour le statut de la story et synchroniser `sprint-status.yaml` selon le workflow.
