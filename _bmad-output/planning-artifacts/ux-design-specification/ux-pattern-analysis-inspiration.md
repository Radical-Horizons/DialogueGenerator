# UX Pattern Analysis & Inspiration

## Inspiring Products Analysis

**Articy Draft X (Référence principale - Éditeur de dialogue professionnel)**

**Forces UX identifiées :**

1. **Nested Flows & Hierarchy**
   - Structure hiérarchique claire : Flows → Dialogues → Fragments
   - Permet de gérer des dialogues complexes sans surcharge visuelle
   - **Pattern transférable** : Groupement logique, navigation hiérarchique

2. **Pins System (Input/Output)**
   - Pins visibles sur les côtés des dialogues pour connexions
   - Conditions et instructions attachées aux pins
   - **Pattern transférable** : Handles de sortie clairs, connexions conditionnelles

3. **Quick Create & Templates**
   - Menu "Quick Create" pour ajouter plusieurs fragments rapidement
   - Templates avec propriétés par défaut
   - **Pattern transférable** : Génération batch, presets avec defaults intelligents

4. **Hub-Based Dialogue**
   - Hubs comme points de branchement/merge pour réduire la complexité
   - Évite les "spaghetti connections"
   - **Pattern transférable** : Barre intermédiaire 4 résultats (comme hub visuel)

5. **Multiple Views & Workspace Layout**
   - Navigator gauche (hiérarchie) + Content area droite (éditeur)
   - Onglets pour différentes vues
   - **Pattern transférable** : Layout 3 colonnes (Contexte/Liste | Canvas | Détails)

6. **Progressive Disclosure**
   - Détails des nodes seulement sur demande (hover, click)
   - Vue d'ensemble d'abord, drill-down ensuite
   - **Pattern transférable** : Labels barre 4 résultats en infobulle, détails dans panel

**Patterns d'éditeurs de graphes généraux (Miro, Figma, outils node-based)**

**Forces UX identifiées :**

1. **Canvas & Spatial Interaction**
   - Zoom/pan fluides, snapping au grid, minimap pour orientation
   - **Pattern transférable** : Mode plein écran, navigation spatiale claire

2. **Node Creation & Linking**
   - Drag-and-drop depuis palette, quick linking (drag port → port)
   - Preview de connexion pendant le drag, snap-to targets
   - **Pattern transférable** : Génération depuis modal, auto-apply connexions

3. **Visual Feedback & States**
   - Highlight connexions au hover/selection, états visuels (selected, hover, drag-over)
   - Animations subtiles pour transitions
   - **Pattern transférable** : Highlight barre 4 résultats au hover, feedback génération

4. **Inline Editing**
   - Double-click ou context menu pour éditer sans quitter le canvas
   - **Pattern transférable** : Panel droit pour édition sans perdre contexte graphe

   > ⚠️ **Révisé par [Epic 18](../epics/epic-18.md) (2026-10-01).** La conclusion ci-dessus
   > écartait l'édition in-situ au profit du seul panneau droit. Décision inversée : le
   > pattern Articy est **adopté** — édition de la réplique PNJ et des réponses PJ
   > directement dans le nœud, **au clic simple**. Le panneau droit est conservé en
   > complément, pour les champs denses (conditions, effets, skill checks, métadonnées).
   >
   > **Le double-clic reste libre de toute attribution d'édition.** Une version antérieure
   > de cette note affirmait qu'il « reste attribué à l'`AIGenerationPanel` » : c'est
   > **faux**. Aucun code n'ouvre l'`AIGenerationPanel` au double-clic —
   > `useReactFlowHandlers.ts:260-262` le câble sur `focusNode` (recentrage animé). Ne pas
   > chercher à préserver un comportement qui n'existe pas. `ux-consistency-patterns.md:105`
   > est périmé sur ce point.
   >
   > Cadrage complet :
   > [`research/ux-edition-in-situ-articy-notion-2026-10-01.md`](../research/ux-edition-in-situ-articy-notion-2026-10-01.md).
   > ⚠️ Cette note ne couvre qu'un paragraphe. **22 affirmations contredisent encore Epic 18
   > dans 9 shards**, dont les anti-patterns `:154-156` et `:217-219` qui interdisent
   > explicitement FR127 — inventaire exhaustif et périmètre de révision dans
   > `epic-18.md` § UX-DR1. La réécriture est un livrable de la story 18.1.

5. **Undo/Redo & Safety**
   - Undo/redo essentiel, confirmations pour actions destructives
   - **Pattern transférable** : Auto-save, session recovery, retry facile

## Transferable UX Patterns

**Navigation & Layout Patterns :**

1. **Layout 3 colonnes (inspiré Articy Draft X)**
   - Navigator gauche (Contexte/Liste dialogues) + Canvas centre + Content area droite (Détails/Édition)
   - **Application** : Respecter cette structure, optimiser l'espace canvas

2. **Progressive Disclosure (inspiré patterns généraux)**
   - Vue d'ensemble d'abord, détails sur demande
   - **Application** : Barre 4 résultats compacte (ronds seulement), labels en infobulle

3. **Multiple Views (inspiré Articy Draft X)**
   - Onglets pour différentes vues (Génération, Détails contexte, Édition nœud)
   - **Application** : Panel droit avec onglets, pas de doublon central

**Interaction Patterns :**

4. **Quick Create / Batch Generation (inspiré Articy Draft X)**
   - Menu rapide pour créer plusieurs éléments avec defaults
   - **Application** : "Générer tous les choix" comme first-class, batch génération

5. **Auto-apply Connections (inspiré patterns généraux)**
   - Connexions appliquées automatiquement avec preview
   - **Application** : `auto_apply: true` dans Story 0.5.5, highlight automatique

6. **Inline Editing (inspiré patterns généraux)**
   - Édition sans quitter le canvas, panel contextuel
   - **Application** : Panel droit pour édition, focus automatique après génération

7. **Hub-Based Branching (inspiré Articy Draft X)**
   - Points de branchement visuels pour réduire complexité
   - **Application** : Barre 4 résultats comme "hub visuel" pour tests

**Visual Design Patterns :**

8. **Color Coding & Visual Differentiation**
   - Couleurs distinctes pour types de nodes, états, importance
   - **Application** : Barre 4 résultats (rouge → jaune → vert → bleu), nodes test (orange)

9. **Highlight on Hover/Selection**
   - Connexions et nodes liés highlightés au hover
   - **Application** : Highlight barre 4 résultats au hover, chemin visible

10. **Readable Labels & Adaptive Text**
    - Labels complets en tooltip, texte adaptatif selon zoom
    - **Application** : Infobulles barre 4 résultats, preview avant génération

**Performance & Scalability Patterns :**

11. **Lazy Rendering / Viewport Rendering**
    - Rendre uniquement ce qui est visible
    - **Application** : Graphe 500+ nœuds : rendering <1s (PRD NFR-P1)

12. **Clustering & Grouping**
    - Groupement logique pour réduire complexité visuelle
    - **Application** : Groupement par dialogue, collapse/expand si nécessaire

## Anti-Patterns to Avoid

**1. "Spaghetti Connections" (Hairballs)**
   - Trop de connexions qui se croisent, illisible
   - **À éviter** : Auto-layout intelligent, minimiser croisements, routing propre

**2. "Star-bursts" (Node avec trop de connexions)**
   - Un seul node avec énormément d'edges qui domine la vue
   - **À éviter** : Hub-based branching (barre 4 résultats), clustering

**3. "Snowstorms" (Nodes isolés flottants)**
   - Beaucoup de nodes déconnectés sans structure
   - **À éviter** : Auto-apply connexions, validation structure (orphans)

**4. Modal Overload**
   - Trop de modals qui interrompent le workflow
   - **À éviter** : Panel contextuel plutôt que modal, feedback discret

**5. Perte de Contexte**
   - Navigation qui fait perdre le focus, zoom, sélection
   - **À éviter** : Auto-focus après génération, state persistence

**6. Doublon d'Information**
   - Même info affichée à plusieurs endroits
   - **À éviter** : Panel unique pour édition, pas de duplication centre/droite

**7. Friction Cognitive**
   - Trop de clics, pas de defaults, pas d'auto-apply
   - **À éviter** : Quick create, batch génération, auto-apply connexions

## Design Inspiration Strategy

**What to Adopt (Patterns à adopter directement) :**

1. **Layout 3 colonnes** (Articy Draft X)
   - Structure éprouvée, claire, scalable
   - **Application** : Conserver structure actuelle, optimiser espace canvas

2. **Progressive Disclosure** (Patterns généraux)
   - Barre 4 résultats compacte, labels en infobulle
   - **Application** : Mode compact par défaut, explicite au hover

3. **Quick Create / Batch Generation** (Articy Draft X)
   - "Générer tous les choix" comme first-class
   - **Application** : Bouton visible, pas caché, feedback progression

4. **Auto-apply Connections** (Patterns généraux)
   - Connexions appliquées automatiquement avec `auto_apply: true`
   - **Application** : Story 0.5.5, highlight automatique, pas de confirmation

5. **Inline Editing** (Patterns généraux)
   - Panel contextuel, pas de modal bloquante
   - **Application** : Panel droit pour édition, focus automatique

**What to Adapt (Patterns à adapter pour notre contexte) :**

1. **Hub-Based Branching** (Articy Draft X)
   - **Original** : Hubs comme nodes séparés pour branchement/merge
   - **Adaptation** : Barre 4 résultats comme "hub visuel" intégré (pas de node séparé)
   - **Raison** : Plus compact, moins de nodes dans le graphe

2. **Pins System** (Articy Draft X)
   - **Original** : Pins avec conditions/instructions attachées
   - **Adaptation** : Handles simples pour connexions, conditions dans panel édition
   - **Raison** : Simplifier visuellement, conditions dans panel (moins de clutter)

3. **Nested Flows** (Articy Draft X)
   - **Original** : Hiérarchie Flows → Dialogues → Fragments
   - **Adaptation** : Liste dialogues (gauche) + Canvas graphe (centre)
   - **Raison** : Structure plus plate, focus sur dialogue individuel

**What to Avoid (Anti-patterns à éviter) :**

1. **Spaghetti Connections**
   - Auto-layout intelligent, minimiser croisements
   - Routing propre (courbes, pas de chevauchements)

2. **Modal Overload**
   - Panel contextuel plutôt que modal pour édition
   - Modal uniquement pour génération (workflow principal)

3. **Perte de Contexte**
   - Auto-focus après génération
   - State persistence (zoom, sélection, panneau)

4. **Doublon d'Information**
   - Panel unique pour édition (droite)
   - Pas de duplication centre/droite

5. **Friction Cognitive**
   - Defaults intelligents, auto-apply, batch génération
   - Pas de clics inutiles, workflow fluide
