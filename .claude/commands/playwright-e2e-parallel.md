---
description: Lancer plusieurs subagents Playwright E2E en parallèle sur des lots de specs disjoints.
argument-hint: "[specs ou domaine, ex. 'graph' ou 'e2e/auth.spec.ts e2e/presets-crud.spec.ts']"
---

Tu es l'agent parent. Sous Claude Code, `subagent_type: playwright-e2e-specialist` **existe** — l'utiliser directement (l'ancien harnais Cursor imposait un contournement par agents génériques, ce n'est plus le cas).

Périmètre demandé : $ARGUMENTS

## Règle d'or

**Chaque enfant parallèle = une commande avec des chemins explicites** (`e2e/….spec.ts`).
**Interdit** de confier à un enfant `npx playwright test` sans arguments (suite entière) : inutile en parallèle, et ça fait exploser le temps et les ports.

## Déroulé

1. Découpe la suite en **lots disjoints** (1 spec, ou 2–5 fichiers listés).
2. **Un message, N appels `Agent`** en parallèle, chacun avec :
   - `subagent_type` : **`playwright-e2e-specialist`**
   - `prompt` : la **commande exacte**, ex. `npx playwright test e2e/X.spec.ts e2e/Y.spec.ts --reporter=list --workers=1`
3. **Toi (parent)** : après synthèse des lots, **une seule** passe `npm run test:e2e:verify` si tu veux une preuve globale (ou laisse la CI le faire).

## Exemple de lots (chemins explicites)

- Enfant A : `e2e/auth.spec.ts` (le setup `auth.setup.ts` est tiré par les deps du projet Playwright, pas besoin de le dupliquer)
- Enfant B : `e2e/graph-load-display-nodes.spec.ts` `e2e/graph-manual-node.spec.ts`
- Enfant C : `e2e/graph-connection-target-dropdown.spec.ts` `e2e/graph-small-dialogue-unity-export.spec.ts`
- Enfant D : `e2e/presets-crud.spec.ts` `e2e/cost-governance.spec.ts`

Lister les fichiers **un par un** dans le prompt si le glob shell est ambigu sous Windows.

Éviter deux agents sur le même `document_id` / fixture : les specs utilisent `uniqueE2EDocumentId` dans `e2e/helpers.ts`.
