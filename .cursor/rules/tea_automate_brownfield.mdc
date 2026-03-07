---
description: TEA Test Automation en mode brownfield — éviter les doublons avec la suite existante
alwaysApply: false
globs: ["_bmad/tea/**", "_bmad-output/test-artifacts/**"]
---
# TEA Automate — Brownfield

- Le projet est en **brownfield** : suite de tests existante (1200+ tests). Le workflow TA (_bmad/tea/workflows/testarch/automate) ne doit **pas** générer de tests en doublon.
- **Variable workflow** : `brownfield: true` dans `_bmad/tea/workflows/testarch/automate/workflow.yaml`.
- **Étape 2 (identify-targets)** : exécuter le bloc **3b. Brownfield** : découvrir les tests existants dans `tests/`, inférer la couverture (routes, modules), calculer les **gaps** (cibles − déjà couvert), et ne transmettre à l’étape 3 que ce plan d’écarts + `existing_tests_summary`.
- **Étape 3 (workers)** : ne générer des tests que pour les cibles du plan (gaps). Ne pas générer pour les routes/modules listés dans `existing_tests_summary`.
- Lors d’une exécution TA, s’assurer que le contexte passé aux workers inclut `brownfield` et `existing_tests_summary` (sortie de l’étape 2).
