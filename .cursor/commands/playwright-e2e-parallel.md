---
name: playwright-e2e-parallel
description: Lancer plusieurs sous-agents Playwright E2E en parallèle (Task + rôle playwright-e2e-specialist).
---

Tu es l’agent parent. **Ne pas** supposer que `subagent_type: playwright-e2e-specialist` existe dans l’outil `Task`.

## Règle d’or

**Chaque enfant parallèle = une commande avec des chemins explicites** (`e2e/….spec.ts`).  
**Interdit** de confier à un enfant `npx playwright test` sans arguments (suite entière) : ça sert à rien en parallèle et ça fait exploser le temps / les ports.

## Déroulé

1. Lis `.cursor/agents/playwright-e2e-specialist.md`.
2. Découpe la suite en **lots disjoints** (1 spec, ou 2–5 fichiers listés).
3. **Un message, N `Task`** en parallèle, chacun avec :
   - `subagent_type`: **`generalPurpose`**
   - `prompt` : *« Applique `.cursor/agents/playwright-e2e-specialist.md`. Commande exacte : `npx playwright test e2e/X.spec.ts … --reporter=list --workers=1` »* (adapter `--workers` si besoin).
4. **Toi (parent)** : après synthèse des lots, **une seule** passe `npx playwright test --reporter=list` si tu veux une preuve globale (ou laisse la CI le faire).

## Exemple de lots (chemins explicites)

- Enfant A : `e2e/auth.spec.ts` (le setup `auth.setup.ts` est tiré par les deps du projet Playwright, pas besoin de le dupliquer sauf besoin)
- Enfant B : `e2e/graph-load-display-nodes.spec.ts` `e2e/graph-manual-node.spec.ts`
- Enfant C : `e2e/graph-connection-target-dropdown.spec.ts` `e2e/graph-small-dialogue-unity-export.spec.ts`
- Enfant D : `e2e/presets-crud.spec.ts` `e2e/cost-governance.spec.ts`

Lister les fichiers **un par un** dans le prompt si le glob shell est ambigu sous Windows.
