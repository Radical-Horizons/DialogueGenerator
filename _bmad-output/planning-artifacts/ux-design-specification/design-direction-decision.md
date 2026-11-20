# Design Direction Decision

> ⚠️ **Remplacée le 2026-11-20 pour tout écran repris par l'epic 20 (refonte « Scène »).** Font foi :
> [`docs/design/refonte-scene/README.md`](../../../docs/design/refonte-scene/README.md) (écrans, composants,
> raccourcis, table « où va chaque fonction »), les boards `docs/design/refonte-scene/*.dc.html`,
> [`docs/architecture/refonte-scene-architecture.md`](../../../docs/architecture/refonte-scene-architecture.md)
> (A1–A16) et [`epic-20.md`](../epics/epic-20.md). En cas de contradiction, la refonte l'emporte. Restent valables :
> la charte de `design-system-foundation.md` (couleurs, polices, filets, un seul bouton bleu) et les exigences
> d'accessibilité générales. Ce document est conservé pour l'historique ; ne pas en tirer de critère d'acceptation.

## Design Directions Explored

**Contexte brownfield :** L'interface Graph Editor existe déjà et fonctionne. La direction de design documente l'état actuel + améliorations proposées (approche itérative, pas de refonte complète).

**Direction actuelle :** Mode sombre professionnel, layout 3 colonnes, densité optimisée pour outil de travail, composants custom.

## Chosen Direction

**Direction : Itération sur l'existant avec améliorations ciblées**

**Style visuel :**
- Mode sombre professionnel (fond #1a1a1a) - conservé
- Densité optimisée (outil de travail, pas trop dense, pas trop aéré)
- Layout 3 colonnes (Contexte/Liste | Canvas | Détails) - conservé
- Composants custom (pas de bibliothèque externe) - conservé

**Améliorations proposées :**
1. Barre 4 résultats compacte (hub visuel pour tests) - nouveau pattern
2. Mode plein écran pour canvas (raccourci discret) - optimisation espace
3. Panels collapsibles optimisés - optimisation espace
4. Progressive disclosure (labels en infobulle) - réduction clutter

## Design Rationale

**Pourquoi itérer sur l'existant :**
- Interface fonctionnelle : L'outil est utilisé en production, pas de refonte risquée
- Workflow établi : Les utilisateurs connaissent l'interface, éviter disruption
- Approche pragmatique : Améliorer les points de friction identifiés, pas tout refaire
- Timeline réaliste : Itérations progressives, pas de big bang

**Pourquoi ces améliorations spécifiques :**
- Barre 4 résultats : Nouvelle fonctionnalité (Story 0-10), nécessite nouveau pattern visuel
- Mode plein écran : Contrainte d'espace identifiée (panneaux latéraux réduisent canvas)
- Progressive disclosure : Réduire clutter visuel (labels barre 4 résultats)
- Panels optimisés : Maximiser espace canvas sans perdre fonctionnalité

## Implementation Approach

**Architecture complète des interfaces Graph Editor :**

**1. Layout Principal (GraphEditor.tsx)**

**Structure 3 colonnes :**
- **Panneau gauche** : `UnityDialogueList` (width: `clamp(260px, 22vw, 340px)`, min: `240px`)
  - Liste des dialogues Unity avec recherche et tri
  - Sélection dialogue → charge dans graphe
  - Border right : `1px solid ${theme.border.primary}`
  - Background : `theme.background.panel`

- **Panneau central** : GraphCanvas + Toolbar
  - **Toolbar (en-tête)** : Titre dialogue, badge validation, auto-save, boutons actions
  - **GraphCanvas** : ReactFlow avec nodes, edges, controls, minimap
  - Background : `theme.background.panel`
  - Flex: 1 (prend tout l'espace restant)

- **Panneau droit** : `NodeEditorPanel` (panel latéral contextuel)
  - S'affiche quand nœud sélectionné
  - Édition propriétés nœud (speaker, line, choices, etc.)
  - Width : Variable (redimensionnable via ResizablePanels si intégré)

**2. Panneau Gauche : UnityDialogueList**

**Composants :**
- **Barre de recherche** : Input avec raccourci `/` pour focus
- **Tri** : Select (name-asc, name-desc, date-asc, date-desc)
- **Liste scrollable** : `UnityDialogueItem` pour chaque dialogue
- **États** : Loading, error (avec retry), empty

**UnityDialogueItem :**
- Affichage : Titre (filename formaté), title (si différent), size, date modifiée
- Sélection : Background `theme.state.selected.background` si sélectionné
- Hover : Background `theme.state.hover.background`
- Highlight : Recherche met en évidence texte correspondant

**3. Panneau Central : GraphCanvas + Toolbar**

**Toolbar (en-tête) :**
- **Titre** : "Éditeur de Graphe - {dialogue.title}" + filename (secondary)
- **Badge validation** : 
  - Vert (✓ Graphe valide) si aucune erreur
  - Rouge (✗ X erreur(s)) si erreurs
  - Jaune (⚠ X avertissement(s)) si warnings uniquement
  - Clic → zoom sur erreurs
- **SaveStatusIndicator** : Auto-save draft (saved/saving/unsaved/error)
- **Boutons actions** :
  - "✓ Valider" : Validation graphe
  - Select layout direction (TB/LR/BT/RL)
  - "🔄 Auto-layout" : Réorganiser graphe
  - "✨ Générer" : Ouvrir AIGenerationPanel (si nœud sélectionné)
  - "📥 Exporter" : Ouvrir dialog format export (PNG/SVG)
  - "💾 Sauvegarder" : Export vers Unity

**GraphCanvas (ReactFlow) :**
- **Background** : Grid `15px` gap, opacity `0.2`
- **Controls** : Zoom, pan, fit view (ReactFlow native)
- **MiniMap** : Vue d'ensemble graphe (bottom-right)
- **Nodes** : DialogueNode (bleu #4A90E2), TestNode (orange #F5A623), EndNode (gris #B8B8B8)
- **Edges** : Smoothstep, stroke `theme.text.secondary`, width `2px`
- **Interactions** : Click node → sélection, drag → reposition, connect handles → créer edge

**4. Panel Overlay : AIGenerationPanel**

**Modal overlay** (centré, z-index élevé) :
- **Header** : Titre "Générer la suite avec l'IA" + bouton fermer
- **Contexte parent** : Affiche speaker + line (tronqué 150 chars) du nœud parent
- **Instructions utilisateur** : Textarea pour instructions optionnelles
- **Mode génération** : Toggle "Suite (nextNode)" / "Branche alternative (choice)"
- **Sélection choix** : 
  - Liste choix disponibles avec preview texte
  - Indicateur "déjà connecté" (grisé, non cliquable)
  - Sélection unique ou "Générer pour tous les choix" (batch)
- **Options avancées** :
  - Sélecteur modèle LLM
  - Tags narratifs (tension, humour, dramatique, etc.)
  - MaxChoices (limite génération batch)
- **Bouton générer** : Lance génération avec progression visible
- **Budget block modal** : ConfirmDialog si budget dépassé

**5. Panel Latéral : NodeEditorPanel**

**Panel contextuel** (s'affiche quand nœud sélectionné) :
- **Header** : Type nœud (Dialogue/Test/End) + bouton fermer
- **Formulaires selon type** :
  - **DialogueNode** : Speaker, Line (textarea), Choices (array), nextNode
  - **TestNode** : Test, Line, successNode, failureNode (→ 4 résultats Story 0-10)
  - **EndNode** : Aucun champ (nœud terminal)
- **ChoiceEditor** : Pour chaque choix
  - Text (textarea)
  - targetNode (input monospace)
  - Condition (input monospace)
  - Test (input monospace)
  - influenceDelta, respectDelta (number inputs)
  - traitRequirements (textarea JSON)
  - Bouton "✨ Générer" (si non connecté)
  - Bouton "🗑️ Supprimer"
- **Actions** :
  - Bouton "Sauvegarder" : Update nœud
  - Bouton "Supprimer nœud" : Delete avec confirmation
  - Bouton "Générer depuis nœud" : Ouvrir AIGenerationPanel

**6. Modals/Dialogs**

**ConfirmDialog (restauration draft) :**
- Message : "Un brouillon plus récent que le fichier a été trouvé..."
- Actions : "Restaurer" / "Ignorer" / "Supprimer brouillon"

**Dialog export format :**
- Sélection format : PNG ou SVG
- Boutons : "Exporter PNG" / "Exporter SVG" / "Annuler"

**ConfirmDialog (budget block) :**
- Message : Budget dépassé (détails dans `budgetBlockMessage`)
- Actions : "OK" (ferme modal)

**7. Validation Errors Panel (Overlay)**

**Panel overlay** (bottom-left, z-index 1000) :
- **Header** : Icône + "X erreur(s)" ou "X avertissement(s)"
- **Groupement par type** :
  - Orphan nodes (🔗)
  - Broken references (🔴)
  - Empty nodes (⚪)
  - Missing tests (❓)
  - Unreachable nodes (📍)
  - Cycles detected (🔄)
- **Liste erreurs** : 
  - Format : `[node_id] message`
  - Clic → zoom sur nœud problématique
  - Hover → highlight
- **Filtrage** : Cycles intentionnels masqués si marqués `intentionalCycles`

**8. Nodes ReactFlow (Custom)**

**DialogueNode :**
- **Shape** : Rectangle arrondi
- **Couleur** : Bleu #4A90E2
- **Contenu** : Speaker (titre), Line (dialogue tronqué), Choices count
- **Handles** : 1 output handle (droite) pour connexions
- **Interactions** : Click → sélection, double-click → ouvrir AIGenerationPanel

**TestNode :**
- **Shape** : Rond orange
- **Couleur** : Orange #F5A623
- **Contenu** : Test (attribut+compétence:DD), Line (dialogue optionnel)
- **Handles** : 2 output handles (success/failure) → **4 handles (Story 0-10)**
- **Interactions** : Click → sélection, double-click → ouvrir AIGenerationPanel

**EndNode :**
- **Shape** : Rectangle arrondi gris
- **Couleur** : Gris #B8B8B8
- **Contenu** : "Fin du dialogue"
- **Handles** : Aucun (nœud terminal)

**9. ChoiceEditor (dans NodeEditorPanel)**

**Composant inline** pour éditer un choix :
- **Header** : "Choix #X" + indicateur "(connecté)" si `targetNode` rempli
- **Champs** :
  - Text (textarea, required)
  - targetNode (input monospace)
  - Condition (input monospace, format: FLAG_NAME, NOT FLAG_NAME, expression)
  - Test (input monospace, format: Attribut+Compétence:DD)
  - influenceDelta, respectDelta (number inputs)
  - traitRequirements (textarea JSON, format: `[{"trait": "Nom", "minValue": 5}]`)
- **Actions** :
  - Bouton "✨ Générer" (si non connecté)
  - Bouton "🗑️ Supprimer"

**10. États et Interactions**

**États visuels :**
- **Sélection** : Nœud sélectionné → highlight, NodeEditorPanel ouvert
- **Hover** : Nodes, edges, boutons → feedback visuel
- **Loading** : "Chargement du graphe..." (centré)
- **Empty** : "Sélectionnez un dialogue Unity" (centré, message guidant)

**Interactions clavier :**
- `/` : Focus recherche (UnityDialogueList)
- `Ctrl+S` : Sauvegarder dialogue
- `Escape` : Fermer modals/panels
- Raccourcis personnalisés via `useKeyboardShortcuts`

**Workflow principal :**
1. Sélection dialogue (liste gauche) → Charge dans graphe
2. Click nœud → Sélection + NodeEditorPanel ouvert
3. Double-click nœud → AIGenerationPanel ouvert
4. Génération → Nœuds créés + auto-apply connexions + auto-focus
5. Édition → NodeEditorPanel → Sauvegarder
6. Validation → Badge + Errors panel (si erreurs)

**Améliorations UX proposées :**

**1. Barre 4 résultats (nouveau pattern)**
- **Visualisation** : DialogueNode → Fil → Barre compacte (4 ronds colorés) → 4 DialogueNodes
- **Couleurs** : Rouge → Jaune → Vert → Bleu (échec critique → réussite critique)
- **Labels** : Infobulle au hover (pas de labels visibles sur barre)
- **Implementation** : Node ReactFlow custom ou overlay SVG

**2. Mode plein écran**
- **Raccourci** : `F11` ou bouton discret dans toolbar
- **Comportement** : Masque panneaux latéraux, canvas prend 100% viewport
- **Exit** : `F11` ou `Escape` pour revenir layout normal

**3. Progressive disclosure**
- **Barre 4 résultats** : Ronds seulement, labels en tooltip
- **Nodes** : Contenu tronqué, détails dans NodeEditorPanel
- **Choices** : Preview dans ChoiceEditor, détails au expand

**4. Panels optimisés**
- **Collapsibles** : Panneaux gauche/droite collapsibles (min ~100px)
- **Redimensionnables** : ResizablePanels pour ajuster largeurs
- **State persistence** : Sauvegarder tailles panels dans localStorage
