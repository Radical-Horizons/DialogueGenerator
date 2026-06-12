# Intégration systèmes de jeu (FR94)

**Dernière mise à jour :** 2026-06-12  
**Référence d'implémentation :** le code et les tests font foi (`services/game_systems_*.py`, `frontend/src/utils/*`, tests `test_game_systems_*`).

Ce guide décrit le comportement **livré** dans l'éditeur de graphe et l'API documents. En cas d'écart avec un document de planification, vérifier le code.

---

## Vue d'ensemble

Trois familles de systèmes sont intégrées aux dialogues :

| Famille | ID catalogue | Rôle dans l'éditeur |
|---------|--------------|---------------------|
| Caractéristiques & Compétences | `attributes_skills` | Tests tentables (`skillCheck`) sur les choix |
| Gestion de l'Effort | `effort` | Coût PE (`effortCost`), grisage si pool insuffisant |
| Réputation | `reputation` | Conditions/effets FR94, paliers calculés à la volée |

La logique d'évaluation est **déterministe** (services Python + utilitaires TypeScript miroirs). Elle ne passe pas par le LLM.

---

## Ouvrir le panneau catalogue

1. Ouvrir l'**Éditeur de Graphe** avec un dialogue actif.
2. Menu **Actions** de la toolbar → **⚙️ Systèmes de jeu**.
3. Le panneau latéral **« Intégration systèmes de jeu »** (`GameSystemsIntegrationPanel`) affiche les familles et l'état de la source runtime.

**Code :** `frontend/src/components/graph/GraphEditorHeader.tsx`, `GameSystemsIntegrationPanel.tsx`.

---

## Catalogue et source runtime

`GET /api/v1/mechanics/systems/integration` renvoie :

- `families` : les trois familles ci-dessus (libellés et descriptions statiques).
- `runtime_source` : état de connexion à Unity / API externe / fichier config.

**Comportement actuel (local) :** `runtime_source.status` vaut toujours `disconnected`, `editing_blocked` est `false`. L'édition et la preview simulée restent possibles.

**Reste à faire (non implémenté) :** branchement d'une source runtime live qui passerait `status` à `connected` et alimenterait les stats depuis le jeu.

---

## Preview scénario avec stats simulées

Le panneau **Preview** (`DialoguePreviewPanel`) et le store `graphViewStore.previewGameSystemsState` permettent de simuler :

| Champ | Défaut | Usage |
|-------|--------|-------|
| `attributes` | `{}` | Valeurs de caractéristiques pour skill checks |
| `skills` | `{}` | Valeurs de compétences pour skill checks |
| `effortPool` | `10` | Pool d'Effort (PE) pour griser les choix coûteux |
| `reputationValues` | `{}` | Clés FR94 → valeur numérique |
| `factionTitles` | `{}` | Titres de faction simulés |

`POST /api/v1/documents/{document_id}/preview` accepte le même état dans `game_systems_state` (snake_case côté API). La réponse échoe cet état et peut inclure `simulation_limits`.

### Exemple `game_systems_state` (API)

```json
{
  "attributes": { "sociabilite": 4 },
  "skills": { "tromperie": 3 },
  "effort_pool": 10,
  "reputation_values": {
    "fr94::HEROINE_A::community::garde::Admiration::community_calculated": 35
  },
  "faction_titles": { "garde": "garde_capitaine" }
}
```

### Clés de réputation FR94

Format stable (voir `ReputationCondition.state_key()` dans `services/game_systems_reputation.py`) :

```
fr94::{heroineId}::{targetKind}::{targetId}::{axis}::{readMode}
```

- **Axes :** `Admiration`, `Prestige`, `Crainte`
- **Cible :** `heroine` | `npc` | `community`
- **Mode lecture :** `raw_npc` | `final_npc` | `community_calculated`

Le format legacy `axisId::factionId` reste supporté pour la réputation Story 9.2/9.4 (`reputation_states`).

### `simulation_limits`

Quand la preview locale ne peut pas reproduire le runtime (ex. agrégat communautaire avec témoins/propagation), la réponse inclut des messages explicites. Exemple actuel :

> Agrégat communautaire simulé localement : témoins, propagation et poids PNJ restent responsabilité runtime.

---

## Tests de compétence (skill checks)

Sur un choix, champ `skillCheck` (camelCase dans le JSON dialogue) :

```json
{
  "skillCheck": {
    "attributeId": "sociabilite",
    "skillId": "tromperie",
    "dc": 7,
    "modifier": 0,
    "branches": {
      "succès": "SUCCESS",
      "échec_critique": "CRIT_FAILURE"
    }
  }
}
```

**Score :** `attribute + skill + modifier` vs `dc`.

**Quatre issues :** `succès_critique` (marge ≥ 5), `succès` (marge ≥ 0), `échec` (marge ≤ -1), `échec_critique` (marge ≤ -5).

Les choix avec skill check **restent visibles** en preview ; le routage utilise `branches[issue]` → `targetNode`.

**Code :** `services/game_systems_skill_checks.py`, `frontend/src/utils/skillChecks.ts`.

---

## Effort

Champ `effortCost` (nombre) sur un choix. En preview, si `effortCost > effortPool` simulé, le choix est **grisé/désactivé** avec explication du déficit.

**Code :** `services/game_systems_effort.py`, `frontend/src/utils/effortPreview.ts`.

---

## Réputation FR94

### Conditions (`visibilityConditions`)

Kind `reputation_fr94` :

```json
{
  "kind": "reputation_fr94",
  "heroineId": "HEROINE_A",
  "target": { "kind": "community", "id": "garde" },
  "axis": "Admiration",
  "readMode": "community_calculated",
  "operator": ">=",
  "threshold": 30
}
```

### Effets (`choiceEffects`)

Kind `reputation_delta_fr94` : même structure de cible + `delta` numérique.

### Paliers (`RepPalier`)

Calculés à la volée depuis la valeur numérique (9 paliers : Hostilité → Icône). **Ne pas** persister `RepPalier*` dans `dialogueFlags` — la validation document le rejette.

### Titres de faction

Kind `faction_title` : doit référencer `Flag_faction_titre_{faction}` ou un `titleId` du catalogue. Les titres ne sont **pas** accordés automatiquement par palier de réputation.

**Code :** `services/game_systems_reputation.py`, `frontend/src/utils/reputationFr94.ts`.

---

## Diagnostics à la sauvegarde

`PUT /api/v1/documents/{document_id}` fusionne `validate_document_social_systems()` dans `validationReport`.

| Code | Signification |
|------|---------------|
| `social_system_confusion` | `Influence` ou `Respect` utilisés comme axe de Réputation — ils appartiennent au système **Influence & Respect (PJ possédés)** |
| `reputation_palier_runtime_only` | Tentative de stocker un palier (`RepPalier*`) dans `dialogueFlags` |

**Code :** `services/game_systems_social_diagnostics.py`, `frontend/src/utils/socialDiagnostics.ts`.

---

## Distinction avec la couche prompt LLM

[`docs/mechanics/INTEGRATION_MECANIQUES_STABLE.md`](../mechanics/INTEGRATION_MECANIQUES_STABLE.md) traite l'injection de traits/compétences dans les **prompts de génération** LLM. Ce guide couche **runtime / preview / validation** des dialogues JSON — périmètres différents.

---

## Références code

| Zone | Fichiers |
|------|----------|
| API catalogue | `api/routers/mechanics_systems.py`, `services/game_systems_integration_service.py` |
| API preview | `api/routers/documents.py`, `api/schemas/dialogue_preview.py`, `api/schemas/game_systems.py` |
| UI | `GameSystemsIntegrationPanel.tsx`, `DialoguePreviewPanel.tsx`, `DialogueNode.tsx` |
| Tests | `tests/api/test_mechanics_systems_integration.py`, `tests/api/test_documents_preview_game_systems.py`, `tests/services/test_game_systems_*.py` |

Contrats HTTP détaillés : [`docs/api/api-contracts-api.md`](../api/api-contracts-api.md).
