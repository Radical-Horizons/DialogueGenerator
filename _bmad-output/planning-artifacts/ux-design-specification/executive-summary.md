# Executive Summary

> ⚠️ **Remplacée le 2026-11-20 pour tout écran repris par l'epic 20 (refonte « Scène »).** Font foi :
> [`docs/design/refonte-scene/README.md`](../../../docs/design/refonte-scene/README.md) (écrans, composants,
> raccourcis, table « où va chaque fonction »), les boards `docs/design/refonte-scene/*.dc.html`,
> [`docs/architecture/refonte-scene-architecture.md`](../../../docs/architecture/refonte-scene-architecture.md)
> (A1–A16) et [`epic-20.md`](../epics/epic-20.md). En cas de contradiction, la refonte l'emporte. Restent valables :
> la charte de `design-system-foundation.md` (couleurs, polices, filets, un seul bouton bleu) et les exigences
> d'accessibilité générales. Ce document est conservé pour l'historique ; ne pas en tirer de critère d'acceptation.

## Project Vision

DialogueGenerator est un outil de génération assistée par IA pour dialogues arborescents (type Disco Elysium), permettant aux auteurs de générer des dialogues complets (centaines de nœuds) en ≤1H. L'éditeur de graphe est le **point critique de l'UI** : interface complexe avec contraintes d'espace importantes (panneaux latéraux réduisent l'espace du canvas).

**Contexte brownfield** : L'interface actuelle fonctionne et sert de baseline. Les améliorations UX doivent itérer progressivement sans casser le workflow existant.

## Target Users

**Primary Users :**
- **Marc** : Power user, 40h+/semaine, développe aussi l'application
- **Mathieu** : Casual user, quelques heures/semaine, besoin d'efficacité optimale

**Workflow actuel (phase test) :** Génération → Sélection → Génération (suite) → Génération (suite)
- Objectif immédiat : Produire un premier dialogue complet
- Graphes actuels : 2 nœuds max (phase test)
- Pas encore à l'échelle 100+ nœuds

## Key Design Challenges

**1. Contraintes d'espace dans le Graph Editor**
- Panneaux latéraux (Contexte gauche + Détails droite) réduisent l'espace du canvas
- Panneaux collapsibles/redimensionnables (min ~100px) mais rarement masqués
- Zone centrale contient beaucoup d'infos (liste dialogues + canvas graphe)
- Besoin d'un mode plein écran pour le canvas (raccourci discret)

**2. Gestion des 4 résultats de test (nouvelle fonctionnalité)**
- Visualisation : Nœud de test (rond orange) → fil → petite barre avec 4 ronds colorés (un par niveau) → chaque rond relié à un nœud de réponse PNJ
- 4 résultats distincts qui envoient dans 4 directions (comme des choix normaux)
- Les résultats sont des nodes normaux (réponses PNJ) édités dans le panel standard

**3. Doublon d'information dans "Édition de Dialogues"**
- Problème : Liste dialogues (gauche) + détails (centre) + panel édition (droite) = doublon
- Solution : Utiliser directement le panel tout à droite au lieu du panneau central

**4. Organisation des panneaux**
- Panel de droite : Visible en permanence (contient onglets génération + détails contexte)
- Liste dialogues à gauche du graphe : Pourrait être masquable pour se concentrer sur le dialogue

## Design Opportunities

**1. Visualisation claire des 4 résultats de test**
- Pattern visuel innovant : Barre intermédiaire avec 4 ronds colorés pour clarifier les connexions
- Couleurs distinctes : Échec critique (rouge foncé #c0392b), Échec (rouge #e74c3c), Réussite (vert #27ae60), Réussite critique (vert foncé #229954)

**2. Optimisation de l'espace canvas**
- Mode plein écran avec raccourci discret (F11 ou ⌘+K)
- Liste dialogues masquable pour focus sur le dialogue
- Panneaux redimensionnables pour ajustement fin

**3. Élimination des doublons**
- Simplifier "Édition de Dialogues" en utilisant uniquement le panel droit
- Réduire la redondance d'information entre panneaux

## Diagrammes Excalidraw Créés

Les diagrammes suivants clarifient l'UI du graph editor :

1. **`wireframe-graph-editor-layout-20260119-150046.excalidraw`**
   - Layout actuel avec contraintes d'espace
   - Visualisation des panneaux latéraux et leur impact sur le canvas

2. **`wireframe-test-4-results-visualization-20260119-150046.excalidraw`**
   - **CRITIQUE** : Visualisation des 4 résultats de test
   - Pattern : Test Node → Fil → Barre avec 4 ronds colorés → Nodes PNJ
   - Couleurs et labels pour chaque niveau

3. **`wireframe-edition-dialogues-duplication-20260119-150046.excalidraw`**
   - Problème de doublon dans "Édition de Dialogues"
   - Solution : Utiliser directement le panel de droite

4. **`wireframe-graph-editor-optimizations-20260119-150046.excalidraw`**
   - Opportunités d'optimisation (mode plein écran, panneaux masquables)
   - Raccourcis et toggles pour maximiser l'espace canvas
