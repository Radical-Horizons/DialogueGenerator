# Suivi livraison — Cibles de connexion (graphe) & cohérence formulaire

**Usage :** suivi produit / technique (pas de spec fonctionnelle détaillée).  
**ADR canonique :** [`../../_bmad-output/planning-artifacts/architecture/v10-architectural-decisions-adrs.md`](../../_bmad-output/planning-artifacts/architecture/v10-architectural-decisions-adrs.md) — **ADR-009**.  
**Artifact implémentation :** [`../../_bmad-output/implementation-artifacts/graph-connection-targets-ui-dashboard-vs-standalone-2026-03.md`](../../_bmad-output/implementation-artifacts/graph-connection-targets-ui-dashboard-vs-standalone-2026-03.md).  
**Détail technique (`docs/`) :** [`../architecture/adr-graph-connection-targets-ui-shell.md`](../architecture/adr-graph-connection-targets-ui-shell.md)

## Livré (2026-03)

| Thème | Description |
|--------|-------------|
| Sélecteurs de cibles | Combobox (`ConnectionTargetSelect`) pour choix, `nextNode`, 4 sorties TestNode ; appels `connectNodes` / `disconnectNodes`. |
| Libellés | `nodeTargetLabel` / `formatTargetOptionLabel` ; liste `targetPickerOptions` (+ `Fin (END)`). |
| Carte dialogue | Titre affiché en en-tête quand renseigné (sinon aperçu speaker + line). |
| Merge pur | `mergeNodeEditorForm.ts` — évite que le flush RHF écrase les champs edge-owned. |
| Resync | `NodeEditorPanel` — empreinte des connexions quand le même nœud reste sélectionné. |
| Autosave | Comparaison UI/store des ids de dialogue normalisée (`.json` / casse). |
| Tests | Vitest (merge, labels, `ConnectionTargetSelect`, jump-to, virtualization orphan testNode, autosave mock documents, etc.). |
| E2E | `e2e/graph-connection-target-dropdown.spec.ts` (Dashboard + combobox Nœud suivant + save + GET document). |

## Hors périmètre / plus tard

- Vue mobile dédiée pour le panel.
- Refactor « connexions 100 % hors formulaire » (réduction surface form/edges).
- Doc utilisateur grand public (README utilisateur) — à traiter séparément.

## Vérification rapide

- `npx vitest run` (frontend) ; `npx playwright test e2e/graph-connection-target-dropdown.spec.ts --project=chromium`.
