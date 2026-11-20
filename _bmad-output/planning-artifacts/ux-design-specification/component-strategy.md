# Component Strategy

> ⚠️ **Remplacée le 2026-11-20 pour tout écran repris par l'epic 20 (refonte « Scène »).** Font foi :
> [`docs/design/refonte-scene/README.md`](../../../docs/design/refonte-scene/README.md) (écrans, composants,
> raccourcis, table « où va chaque fonction »), les boards `docs/design/refonte-scene/*.dc.html`,
> [`docs/architecture/refonte-scene-architecture.md`](../../../docs/architecture/refonte-scene-architecture.md)
> (A1–A16) et [`epic-20.md`](../epics/epic-20.md). En cas de contradiction, la refonte l'emporte. Restent valables :
> la charte de `design-system-foundation.md` (couleurs, polices, filets, un seul bouton bleu) et les exigences
> d'accessibilité générales. Ce document est conservé pour l'historique ; ne pas en tirer de critère d'acceptation.

## Design System Components

**Composants disponibles (déjà implémentés) :**

**Layout Components:**
- **ResizablePanels** : Panneaux redimensionnables pour layout 3 colonnes
- **Tabs** : Navigation par onglets (génération, détails contexte)

**Graph Components:**
- **DialogueNode** : Nœud de dialogue (bleu #4A90E2, width 280px)
- **TestNode** : Nœud de test (orange #F5A623, width 250px) - **À transformer en barre 4 résultats**
- **EndNode** : Nœud terminal (gris #B8B8B8)

**Panel Components:**
- **NodeEditorPanel** : Panel d'édition contextuel (s'affiche quand nœud sélectionné)
- **AIGenerationPanel** : Modal génération IA avec streaming
- **ContextSelector** : Sélecteur de contexte narratif (GDD)

**Shared Components:**
- **ConfirmDialog** : Dialogs de confirmation (restauration draft, budget block)
- **SaveStatusIndicator** : Indicateur auto-save (saved/saving/unsaved/error)
- **KeyboardShortcutsHelp** : Aide raccourcis clavier

**Theme Tokens:**
- **theme.ts** : Design tokens (couleurs, espacements, états, bordures, texte)

## Custom Components

### 1. TestNode Barre 4 Résultats

**Purpose:** Visualisation compacte des 4 résultats de test (échec critique, échec, réussite, réussite critique) comme hub visuel entre DialogueNode et réponses PNJ.

**Usage:** Apparaît automatiquement quand un choix PJ contient un attribut `test`.

**Anatomy:**
- **Barre compacte** : Rectangle horizontal mince (hauteur ~40px, largeur ~250px)
- **4 handles circulaires** : Positionnés à 12.5%, 37.5%, 62.5%, 87.5% de la largeur
- **Couleurs handles** :
  - Critical Failure : `#C0392B` (rouge foncé)
  - Failure : `#E74C3C` (rouge)
  - Success : `#27AE60` (vert)
  - Critical Success : `#229954` (vert foncé)
- **Pas de labels visibles** : Labels uniquement en tooltip au hover

**States:**
- **Default** : Barre visible avec 4 handles colorés
- **Hover handle** : Tooltip affiche "Échec critique" / "Échec" / "Réussite" / "Réussite critique"
- **Connected** : Handle connecté à un DialogueNode (indicateur visuel)
- **Selected** : Highlight si nœud sélectionné

**Variants:** Aucune (composant unique)

**Accessibility:**
- ARIA label : `role="group"`, `aria-label="Test results: 4 outcomes"`
- Chaque handle : `role="button"`, `aria-label="[Outcome name]"`
- Navigation clavier : Tab pour naviguer entre handles

**Content Guidelines:**
- Barre doit rester compacte (pas de texte visible)
- Tooltips doivent être informatifs mais concis

**Interaction Behavior:**
- Click handle → créer connexion vers DialogueNode
- Drag depuis handle → créer edge ReactFlow
- Hover handle → afficher tooltip avec label

### 2. Wizard Onboarding

**Purpose:** Guider Mathieu (writer occasionnel) lors de sa première utilisation pour créer son premier dialogue rapidement.

**Usage:** Activé automatiquement si détection première utilisation ou mode guidé activé.

**Anatomy:**
- **Modal overlay** : Centré, z-index élevé, backdrop sombre
- **Header** : "Créer votre premier dialogue" + bouton fermer
- **Steps** : 4 étapes avec indicateur de progression
- **Form fields** : Inputs avec suggestions/autocomplete
- **Navigation** : Boutons "Précédent" / "Suivant" / "Générer"

**States:**
- **Step 1** : Sélection lieu (input avec autocomplete)
- **Step 2** : Sélection personnage (dropdown ou input)
- **Step 3** : Contexte ou thème (textarea)
- **Step 4** : Instructions spéciales (textarea avec template pré-rempli)
- **Loading** : Génération en cours (Step 5)
- **Complete** : Premier nœud généré, wizard se ferme

**Variants:**
- **Guided mode** : Wizard complet avec toutes les étapes
- **Quick start** : Version raccourcie (2-3 étapes) pour utilisateurs expérimentés

**Accessibility:**
- ARIA labels pour chaque step
- Navigation clavier : Tab, Enter, Escape
- Focus management : Focus sur premier input de chaque step

**Content Guidelines:**
- Instructions claires et concises
- Suggestions contextuelles basées sur GDD
- Templates pré-remplis pour réduire saisie

**Interaction Behavior:**
- "Suivant" → validation step actuel → passage step suivant
- "Précédent" → retour step précédent (sans perte données)
- "Générer" → lance génération → ferme wizard → ouvre graphe

### 3. Tooltip Component

**Purpose:** Afficher labels au hover pour la barre 4 résultats (progressive disclosure).

**Usage:** Hover sur handle de TestNode, ou autres éléments nécessitant info contextuelle.

**Approche d'implémentation (Phase 1 - Story 0.10) :**
- **Utiliser tooltips ReactFlow natifs** : ReactFlow `Handle` component supporte les tooltips via props `title` ou `data-tooltip`
- **Pas de composant Tooltip custom** : Utiliser les capacités natives de ReactFlow pour réduire complexité
- **Phase 2 (V1.0)** : Créer composant Tooltip réutilisable si besoin identifié ailleurs (NodeEditorPanel, etc.)

**Anatomy (via ReactFlow Handle) :**
- **Container** : Géré par ReactFlow (petit rectangle arrondi avec ombre)
- **Texte** : Label concis (ex: "Échec critique") via prop `title` ou `data-tooltip`
- **Positioning** : Auto-positionnement géré par ReactFlow

**States:**
- **Hidden** : Non visible
- **Visible** : Affiché au hover (délai géré par ReactFlow)
- **Positioning** : Auto-positionnement (top/bottom/left/right selon espace disponible)

**Variants:**
- **Default** : Tooltip simple avec texte (via ReactFlow Handle `title`)
- **Rich** : Tooltip avec contenu enrichi (Phase 2 - composant custom si nécessaire)

**Accessibility:**
- Support clavier : Focus sur Handle → tooltip visible (géré par ReactFlow)
- ARIA : `role="tooltip"`, `aria-describedby` (géré par ReactFlow)

**Content Guidelines:**
- Texte concis (max 50 caractères)
- Pas de contenu interactif dans tooltip

**Interaction Behavior:**
- Hover → affichage après délai (géré par ReactFlow)
- Mouse leave → masquage (géré par ReactFlow)
- Focus → affichage (accessibilité clavier, géré par ReactFlow)

### 4. Toast/Notification Component

**Purpose:** Feedback actions utilisateur (génération complète, erreurs, succès).

**Usage:** Notifications non-bloquantes en bas à droite de l'écran.

**Anatomy:**
- **Container** : Rectangle arrondi avec ombre
- **Icon** : Icône selon type (success, error, info, warning)
- **Message** : Texte de notification
- **Close button** : Bouton X pour fermer

**States:**
- **Success** : Vert, icône check
- **Error** : Rouge, icône X
- **Info** : Bleu, icône info
- **Warning** : Jaune, icône warning
- **Auto-dismiss** : Disparaît après 3-5 secondes

**Variants:**
- **Default** : Notification simple
- **Action** : Notification avec bouton action (ex: "Annuler génération")

**Accessibility:**
- ARIA live region : `role="alert"` ou `role="status"`
- Support clavier : Focus sur notification, Escape pour fermer

**Content Guidelines:**
- Messages concis et actionnables
- Pas de notifications multiples simultanées (queue)

**Interaction Behavior:**
- Auto-dismiss après délai
- Click close → fermeture immédiate
- Click notification → action associée (si applicable)

### 5. Badge Validation

**Purpose:** Indicateur qualité graphe dans toolbar (nombre erreurs/avertissements).

**Usage:** Affiché en permanence dans toolbar GraphEditor.

**Anatomy:**
- **Badge** : Petit rectangle arrondi avec texte
- **Couleur** : Vert (valide), Rouge (erreurs), Jaune (avertissements)
- **Texte** : "✓ Graphe valide" / "✗ X erreur(s)" / "⚠ X avertissement(s)"
- **Click** : Zoom sur erreurs dans graphe

**States:**
- **Valid** : Vert, "✓ Graphe valide"
- **Errors** : Rouge, "✗ X erreur(s)"
- **Warnings** : Jaune, "⚠ X avertissement(s)"
- **Loading** : Gris, "Validation en cours..."

**Variants:** Aucune (composant unique)

**Accessibility:**
- ARIA label : `aria-label="Graph validation status"`
- Click → focus sur première erreur

**Content Guidelines:**
- Texte concis et clair
- Nombre d'erreurs toujours visible

**Interaction Behavior:**
- Click → zoom sur erreurs
- Hover → preview liste erreurs (tooltip)

## Component Implementation Strategy

**Foundation Components (déjà disponibles) :**
- `ResizablePanels` : Layout panneaux redimensionnables
- `Tabs` : Navigation par onglets
- `ConfirmDialog` : Dialogs de confirmation
- `SaveStatusIndicator` : Indicateur sauvegarde

**Custom Components (à créer/améliorer) :**
1. **TestNode Barre 4 Résultats** : Nouveau composant ReactFlow custom (priorité haute - Story 0.10)
2. **Wizard Onboarding** : Nouveau composant modal optionnel (priorité moyenne - V1.0)
3. **Tooltip** : Utiliser tooltips ReactFlow natifs pour Story 0.10, composant réutilisable en Phase 2 si besoin
4. **Toast/Notification** : Composant système (priorité moyenne - V1.0)
5. **Badge Validation** : Composant simple (priorité haute - Story 0.5)

**Approche d'implémentation :**
- **Utiliser design tokens** : Tous les styles dérivent de `theme.ts` (pas de valeurs hardcodées)
- **Suivre patterns existants** : Modals, panels, composants ReactFlow custom
- **Accessibilité** : ARIA labels, navigation clavier, contraste suffisant
- **Réutilisabilité** : Props cohérentes, composants modulaires

## Implementation Roadmap

**Phase 1 - Core Components (Story 0.10) :**
- **TestNode Barre 4 Résultats** : Critique pour nouvelle fonctionnalité tests 4 résultats
- **Tooltip (ReactFlow natifs)** : Utiliser tooltips ReactFlow natifs pour labels barre 4 résultats (progressive disclosure)
- **Badge Validation** : Feedback qualité graphe (déjà partiellement implémenté, à améliorer)

**Phase 2 - Supporting Components (V1.0) :**
- **Toast/Notification** : Feedback actions utilisateur (génération, erreurs)
- **Wizard Onboarding (optionnel)** : Guide rapide optionnel accessible via bouton toolbar (pas automatique)
- **Tooltip (composant réutilisable)** : Créer composant Tooltip custom si besoin identifié ailleurs (NodeEditorPanel, etc.)

**Phase 3 - Enhancement Components (V1.5+) :**
- Composants d'optimisation basés sur feedback utilisateurs
- Patterns réutilisables identifiés lors de l'usage
