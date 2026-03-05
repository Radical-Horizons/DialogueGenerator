# ADR-008 – Cibles performance (Story 16.6)

Référence : ADR-008 Tests Required, objectifs-contraintes (zéro régression, cible perf).

## Cibles

| Contexte | N nœuds | Choices typiques | p95 load (GET + projection + affichage) | p95 drag (déplacer un nœud) | p95 frappe (éditer un champ) |
|----------|---------|------------------|----------------------------------------|-----------------------------|------------------------------|
| **Confort** | &lt; 500 | 4 (métier cinéma) | &lt; 3 s | &lt; 200 ms | &lt; 100 ms |
| **Stress** | milliers (ex. 2000–5000) | 8 (hors cinéma) | &lt; 8 s | &lt; 500 ms | &lt; 150 ms |

- **Pas de nœuds invisibles** : après chargement, tous les nœuds du document sont rendus (vérification visuelle ou snapshot).
- Les seuils ci-dessus sont des objectifs raisonnables ; en CI les tests perf peuvent être marqués **non bloquants** si flaky (environnement variable).

## Mesure

- **Load** : temps entre début GET document (ou loadDialogueByDocumentId) et fin du premier rendu des nœuds (ex. `.react-flow__node` visible).
- **Drag** : temps entre mousedown sur un nœud et mouseup après déplacement.
- **Frappe** : temps entre premier caractère saisi et mise à jour du champ (debounce compris).

## Fichiers de test

- E2E : `e2e/perf-document-load.spec.ts` (optionnel, peut être exclu en CI).
- Fixtures : documents de référence en `frontend/src/__tests__` ou `e2e/fixtures` (ex. 500 nœuds, 4 choices ; 2000 nœuds, 8 choices).
