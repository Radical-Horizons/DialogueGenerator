# Implémentation — Cibles de connexion UI + standalone vs Dashboard (2026-03)

**ADR canonique :** [`../planning-artifacts/architecture/v10-architectural-decisions-adrs.md`](../planning-artifacts/architecture/v10-architectural-decisions-adrs.md) — **ADR-009**  
**Synthèse livraison (tableau) :** [`../../docs/features/graph-connection-targets-delivery.md`](../../docs/features/graph-connection-targets-delivery.md)

## Objectif

Réduire les divergences formulaire / edges pour les cibles de nœuds ; exposer des sélecteurs lisibles ; documenter **où** le panel d’édition est disponible.

## Fichiers clés

| Zone | Fichiers |
|------|-----------|
| Sélecteur | `frontend/src/components/graph/ConnectionTargetSelect.tsx` |
| Choix / panel | `frontend/src/components/graph/ChoiceEditor.tsx`, `NodeEditorPanel.tsx` |
| Libellés / options | `frontend/src/utils/nodeTargetLabel.ts`, `targetPickerOptions.ts` |
| Merge | `frontend/src/utils/mergeNodeEditorForm.ts` |
| Jump-to (refactor label) | `frontend/src/store/slices/uiSlice.ts` (`findNodesByQuery`) |
| Autosave id dialogue | `frontend/src/hooks/useDialogueLoader.ts` |
| Shell UI | `frontend/src/pages/GraphEditorPage.tsx` (standalone), `frontend/src/components/layout/Dashboard.tsx` (embedded + `NodeEditorPanel`) |

## E2E

- **`e2e/graph-connection-target-dropdown.spec.ts`** — Passe par le **Dashboard** (pas seul `/graph-editor` standalone) car le panel n’y est pas monté.

## Commandes de vérification

```bash
cd frontend && npx vitest run src/__tests__/mergeNodeEditorForm.test.ts src/__tests__/nodeTargetLabel.test.ts src/__tests__/ConnectionTargetSelect.test.tsx
cd .. && npx playwright test e2e/graph-connection-target-dropdown.spec.ts --project=chromium
```

## Piste future (non livrée)

Connexions 100 % hors RHF (surface minimale) — voir discussions merge/resync.
