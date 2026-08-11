---
description: FR94 game systems — skill checks, Effort, Réputation, preview, diagnostics
paths:
  - "services/game_systems_*.py"
  - "frontend/src/utils/skillChecks.ts"
  - "frontend/src/utils/effortPreview.ts"
  - "frontend/src/utils/reputationFr94.ts"
  - "frontend/src/utils/socialDiagnostics.ts"
  - "frontend/src/components/**/GameSystemsIntegrationPanel.tsx"
---
- **Source de vérité** : logique dans `services/game_systems_*.py` + miroirs `frontend/src/utils/*` — pas le LLM, pas de heuristique non testée.
- **Parité BE/FE** : toute règle d'évaluation (skill check, effort, réputation, diagnostics) doit rester alignée entre service Python et utilitaire TS ; ajouter/mettre à jour les tests des deux côtés.
- **Clés réputation FR94** : `fr94::{heroineId}::{targetKind}::{targetId}::{axis}::{readMode}` — voir `ReputationCondition.state_key()` dans `game_systems_reputation.py`.
- **Legacy** : `axisId::factionId` reste supporté via `reputation_states` (Story 9.2/9.4).
- **Interdits** : ne pas stocker `RepPalier*` dans `dialogueFlags` ; `Influence`/`Respect` ne sont pas des axes Réputation (diagnostic `social_system_confusion`).
- **Skill checks** : choix toujours visibles en preview ; 4 issues (`succès_critique`, `succès`, `échec`, `échec_critique`) ; routage via `branches[issue]`.
- **Effort** : `effortCost` grise le choix si pool preview insuffisant (défaut 10 PE).
- **Preview ≠ runtime Unity** : `runtime_source.status` est `disconnected` en local ; `simulation_limits` signale ce que la preview ne reproduit pas (agrégat communautaire, témoins).
- **Tests ciblés** : `pytest tests/api/test_mechanics_systems_integration.py tests/api/test_documents_preview_game_systems.py tests/services/test_game_systems_*.py` ; Vitest panel + utils FR94.
- **Doc** : [`docs/guides/game-systems-integration.md`](../../docs/guides/game-systems-integration.md), contrats [`docs/api/api-contracts-api.md`](../../docs/api/api-contracts-api.md).
