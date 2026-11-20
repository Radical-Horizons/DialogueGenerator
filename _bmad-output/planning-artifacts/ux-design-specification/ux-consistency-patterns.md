# UX Consistency Patterns

> ⚠️ **Remplacée le 2026-11-20 pour tout écran repris par l'epic 20 (refonte « Scène »).** Font foi :
> [`docs/design/refonte-scene/README.md`](../../../docs/design/refonte-scene/README.md) (écrans, composants,
> raccourcis, table « où va chaque fonction »), les boards `docs/design/refonte-scene/*.dc.html`,
> [`docs/architecture/refonte-scene-architecture.md`](../../../docs/architecture/refonte-scene-architecture.md)
> (A1–A16) et [`epic-20.md`](../epics/epic-20.md). En cas de contradiction, la refonte l'emporte. Restent valables :
> la charte de `design-system-foundation.md` (couleurs, polices, filets, un seul bouton bleu) et les exigences
> d'accessibilité générales. Ce document est conservé pour l'historique ; ne pas en tirer de critère d'acceptation.

## Button Hierarchy

**When to Use:**
- **Primary actions** : Actions principales (Générer, Sauvegarder, Valider)
- **Secondary actions** : Actions secondaires (Exporter, Auto-layout, Fermer)
- **Tertiary actions** : Actions discrètes (Supprimer, Annuler)

**Visual Design (État actuel - itération progressive) :**
- **Primary** : `theme.button.primary` (bleu #007bff), visible, padding généreux
- **Secondary** : `theme.button.default` (gris #333333), moins proéminent
- **Tertiary** : Texte avec icône, style minimal (ex: "🗑️ Supprimer")
- **Note** : Tokens `button.secondary` et `button.tertiary` à ajouter au thème au besoin (pas de refactoring massif)

**Behavior:**
- **Primary** : Action principale du contexte (ex: "Générer" dans modal génération)
- **Secondary** : Actions complémentaires (ex: "Exporter PNG" dans toolbar)
- **Tertiary** : Actions destructives ou discrètes (ex: "Supprimer nœud" dans NodeEditorPanel)

**Accessibility:**
- Focus visible avec `theme.border.focus`
- Labels ARIA clairs
- Navigation clavier : Tab, Enter, Escape

**Variants:**
- **Loading state** : Bouton désactivé avec spinner
- **Disabled state** : Opacité réduite, cursor not-allowed
- **Success state** : Feedback visuel après action (check icon temporaire)

## Feedback Patterns

**When to Use:**
- **Success** : Génération complète, sauvegarde réussie, validation OK
- **Error** : Génération échouée, erreur validation, API down
- **Warning** : Avertissements validation, budget proche limite
- **Info** : Auto-save, progression génération, suggestions

**Visual Design:**
- **Success** : `theme.state.success` (vert #51cf66), icône check
- **Error** : `theme.state.error` (rouge #ff6b6b), icône X
- **Warning** : `theme.state.warning` (jaune #ffd43b), icône warning
- **Info** : `theme.state.info` (bleu #74c0fc), icône info

**Behavior:**
- **Streaming progression** : Feedback temps réel (Prompting → Generating → Validating)
- **Auto-connect feedback** : Highlight visuel connexions créées automatiquement
- **Toast notifications** : Non-bloquantes, auto-dismiss 3-5 secondes (Phase 2)
- **Badge validation** : Indicateur permanent dans toolbar

**Accessibility:**
- ARIA live regions pour notifications
- Messages concis et actionnables
- Support clavier pour fermer notifications

**Variants:**
- **Inline feedback** : Messages dans formulaires (erreurs validation)
- **Toast notifications** : Notifications système (génération complète) - Phase 2
- **Badge indicators** : Indicateurs permanents (validation graphe)

## Form Patterns

**When to Use:**
- **NodeEditorPanel** : Édition propriétés nœud (speaker, line, choices)
- **ChoiceEditor** : Édition choix individuel (text, targetNode, test, conditions)
- **AIGenerationPanel** : Configuration génération (instructions, sélection choix)

**Visual Design:**
- **Inputs** : `theme.input.background` (#2a2a2a), border `theme.input.border` (#404040)
- **Focus** : `theme.input.focus.border` (#646cff), outline avec opacité
- **Labels** : `theme.text.secondary`, font-weight bold
- **Errors** : `theme.state.error`, message sous input

**Behavior:**
- **Validation** : Validation en temps réel (pas de submit si erreurs)
- **Auto-save** : Sauvegarde automatique toutes les 2min (suspendu pendant génération)
- **Progressive disclosure** : Champs avancés masqués par défaut (expand/collapse)

**Accessibility:**
- Labels associés aux inputs (`<label for="...">`)
- Messages d'erreur avec `aria-describedby`
- Navigation clavier : Tab entre champs, Enter pour submit

**Variants:**
- **Required fields** : Indicateur visuel (astérisque ou "requis")
- **Optional fields** : Pas d'indicateur (par défaut)
- **Read-only fields** : Opacité réduite, cursor not-allowed

## Navigation Patterns

**When to Use:**
- **Graphe** : Navigation dans le graphe (zoom, pan, sélection nœuds)
- **Liste dialogues** : Recherche et tri dans UnityDialogueList
- **Panneaux** : Navigation entre panneaux (Contexte, Génération, Détails)

**Visual Design:**
- **ReactFlow controls** : Zoom, pan, fit view (contrôles natifs)
- **MiniMap** : Vue d'ensemble graphe (bottom-right)
- **Search input** : Input avec raccourci `/` pour focus
- **Tabs** : Navigation par onglets (génération, détails contexte)

**Behavior:**
- **Auto-focus** : Zoom/center automatique vers nouveau nœud généré
- **Click nœud** : Sélection + ouverture NodeEditorPanel
- **Double-click nœud** : Ouverture AIGenerationPanel
- **Keyboard shortcuts** : `/` pour recherche, `Ctrl+S` pour sauvegarder

**Accessibility:**
- Navigation clavier : Tab, Arrow keys, Enter, Escape
- Focus visible sur éléments interactifs
- ARIA labels pour contrôles ReactFlow

**Variants:**
- **Mode plein écran** : Masquer panneaux latéraux (raccourci F11)
- **Layout direction** : Toggle TB/LR/BT/RL pour orientation graphe

## Modal and Overlay Patterns

**When to Use:**
- **AIGenerationPanel** : Modal génération IA avec streaming
- **ConfirmDialog** : Confirmations (restauration draft, budget block)
- **Wizard Onboarding** : Modal guidé optionnel (accessible via bouton "Guide rapide")

**Visual Design:**
- **Backdrop** : Overlay sombre (opacité ~0.7), z-index élevé
- **Modal** : Centré, background `theme.background.panel`, border arrondi
- **Header** : Titre + bouton fermer (X)
- **Body** : Contenu scrollable si nécessaire
- **Footer** : Actions (boutons Primary/Secondary)

**Behavior:**
- **Ouverture** : Animation fade-in (300ms)
- **Fermeture** : Click backdrop ou Escape ou bouton fermer
- **Focus trap** : Focus reste dans modal (Tab cycle)
- **Auto-close** : Modal se ferme après action réussie (ex: génération complète)

**Accessibility:**
- ARIA modal : `role="dialog"`, `aria-modal="true"`
- Focus management : Focus sur premier élément interactif à l'ouverture
- Escape pour fermer
- Focus trap : Tab ne sort pas de la modal

**Variants:**
- **Full-screen modal** : Wizard Onboarding (toute la hauteur) - Phase 2
- **Centered modal** : AIGenerationPanel (taille adaptative)
- **Alert dialog** : ConfirmDialog (petite taille, centré)

## Empty States and Loading States

**When to Use:**
- **Empty state** : Aucun dialogue sélectionné, graphe vide
- **Loading state** : Chargement dialogue, génération en cours, validation

**Visual Design:**
- **Empty state** : Message centré, icône, action suggérée (ex: "Sélectionnez un dialogue Unity")
- **Loading state** : Spinner ou skeleton, message "Chargement..."
- **Streaming** : Texte qui apparaît caractère par caractère (génération IA)

**Behavior:**
- **Empty state** : Message guidant + action suggérée (bouton ou lien)
- **Loading state** : Feedback visuel immédiat (pas d'attente muette)
- **Streaming** : Progression visible (Prompting → Generating → Validating)

**Accessibility:**
- ARIA live regions pour loading states
- Messages descriptifs (pas juste "Loading...")
- Support clavier même pendant loading

**Variants:**
- **Skeleton loading** : Placeholders pour contenu en chargement
- **Progress bar** : Barre de progression pour actions longues
- **Spinner** : Spinner simple pour actions courtes

## Search and Filtering Patterns

**When to Use:**
- **UnityDialogueList** : Recherche dialogues par nom/titre
- **ContextSelector** : Filtrage entités GDD (personnages, lieux, etc.)

**Visual Design:**
- **Search input** : Input avec icône loupe, placeholder "Rechercher..."
- **Filter dropdown** : Select avec options (name-asc, name-desc, date-asc, date-desc)
- **Highlight** : Mise en évidence texte correspondant dans résultats

**Behavior:**
- **Recherche** : Filtrage en temps réel (pas de submit)
- **Raccourci** : `/` pour focus recherche
- **Clear** : Bouton X pour effacer recherche
- **Tri** : Dropdown pour changer ordre résultats

**Accessibility:**
- ARIA labels pour inputs recherche
- Navigation clavier : Tab, Enter, Escape
- Messages pour résultats vides

**Variants:**
- **Autocomplete** : Suggestions pendant saisie (ex: Wizard Onboarding) - Phase 2
- **Advanced filters** : Filtres multiples (Phase 2)
