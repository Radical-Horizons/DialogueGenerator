# Visual Design Foundation

> **Obsolète pour les couleurs, la typographie et l'espacement** (2026-09-27). Ces valeurs datent de
> janvier 2026, avant la refonte UI : fond `#1a1a1a`, accent `#007bff`, police système, grille de 4 px.
> Référence actuelle : `design-system-foundation.md`, l'artifact design system et
> `frontend/src/theme/redesignTokens.ts`. Les sections « Mécaniques » et « Validation Strategy » restent valables.

## Color System

**Mode sombre comme base (déjà en place)**

Le système de couleurs actuel est optimisé pour le mode sombre, idéal pour un outil de travail intensif (concentration, longues sessions).

**Palette de couleurs sémantiques :**

**Backgrounds (hiérarchie visuelle) :**
- `primary` : `#1a1a1a` - Fond principal (canvas, body)
- `secondary` : `#242424` - Fond secondaire (panneaux, containers)
- `tertiary` : `#2d2d2d` - Fond tertiaire (inputs, éléments interactifs)
- `panel` : `#2a2a2a` - Fond panneaux (graph canvas)
- `panelHeader` : `#333333` - En-têtes de panneaux

**Text (hiérarchie de contenu) :**
- `primary` : `rgba(255, 255, 255, 0.95)` - Texte principal (titres, contenu important)
- `secondary` : `rgba(255, 255, 255, 0.75)` - Texte secondaire (descriptions, métadonnées)
- `tertiary` : `rgba(255, 255, 255, 0.55)` - Texte tertiaire (labels, hints)
- `inverse` : `#213547` - Texte sur fond clair (rare, pour contrastes)

**Borders (séparation et focus) :**
- `primary` : `#505050` - Bordures standard
- `secondary` : `#5a5a5a` - Bordures secondaires
- `focus` : `#646cff` - Bordures focus (accent bleu/violet)

**États sémantiques :**
- `error` : `#ff6b6b` (texte) / `#3a1a1a` (fond) / `#ff4444` (bordure)
- `success` : `#51cf66` (texte) / `#1a3a2a` (fond)
- `info` : `#74c0fc` (texte) / `#1a2a3a` (fond)
- `warning` : `#ffd43b` (texte) / `#3a3a1a` (fond)
- `selected` : `#74c0fc` (texte) / `#1a3a5a` (fond)

**Boutons :**
- `default` : `#333333` (fond) / `rgba(255, 255, 255, 0.87)` (texte)
- `primary` : `#007bff` (fond) / `#ffffff` (texte)
- `selected` : `#1a3a5a` (fond) / `#ffffff` (texte) / `#007bff` (bordure)

**Couleurs spécialisées (Graph Editor) :**
- Dialogue Node : `#4A90E2` (bleu)
- Test Node : `#F5A623` (orange)
- End Node : `#B8B8B8` (gris)
- Barre 4 résultats : Rouge → Jaune → Vert → Bleu (échec critique → réussite critique)

**Accessibilité :**
- Contraste minimum WCAG AA : Tous les textes respectent 4.5:1 minimum
- Focus visible : `#646cff` avec outline `rgba(100, 108, 255, 0.3)`
- États hover : Feedback visuel clair (background `#333333`)

## Typography System

**Recommandation : System Font Stack (performance + familiarité)**

Pour un outil de travail, privilégier les fonts système pour :
- Performance (pas de chargement de font externe)
- Familiarité (fonts natives du système)
- Lisibilité optimale (optimisées pour l'écran)

**Font Stack :**
```css
font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Roboto', 'Oxygen', 'Ubuntu', 'Cantarell', 'Fira Sans', 'Droid Sans', 'Helvetica Neue', sans-serif;
```

**Type Scale (hiérarchie claire) :**

**Headings :**
- `h1` : `1.5rem` (24px) / `font-weight: 700` - Titres principaux (dialogue name, section headers)
- `h2` : `1.2rem` (19.2px) / `font-weight: 600` - Sous-titres (panel headers)
- `h3` : `1rem` (16px) / `font-weight: 600` - Titres de sections

**Body Text :**
- `body` : `0.9rem` (14.4px) / `font-weight: 400` - Texte principal (dialogue content, descriptions)
- `small` : `0.85rem` (13.6px) / `font-weight: 400` - Texte secondaire (labels, métadonnées)
- `tiny` : `0.75rem` (12px) / `font-weight: 400` - Texte tertiaire (hints, tooltips)

**Special Cases :**
- `large` : `1rem` (16px) - Pour éléments importants (boutons, inputs)
- `monospace` : `'Courier New', 'Monaco', monospace` - Pour code, IDs, JSON

**Line Heights (lisibilité) :**
- Headings : `1.2` (compact, hiérarchie claire)
- Body : `1.5` (confortable pour lecture longue)
- Small : `1.4` (équilibré pour texte dense)

**Font Weights :**
- `400` (normal) - Texte standard
- `500` (medium) - Emphase légère
- `600` (semibold) - Titres, labels importants
- `700` (bold) - Titres principaux, éléments critiques

**Usage par contexte :**
- **Graph Nodes** : `0.9rem` body pour dialogue, `0.85rem` small pour speaker
- **Panel Headers** : `1rem` h3 avec `font-weight: 600`
- **Inputs** : `0.9rem` body pour cohérence
- **Labels** : `0.85rem` small avec `font-weight: 600`
- **Tooltips** : `0.75rem` tiny

## Spacing & Layout Foundation

**Recommandation : Système basé sur 4px (granularité fine)**

Système 4px pour flexibilité et cohérence :
- Base : `4px` (0.25rem)
- Scale : 4, 8, 12, 16, 20, 24, 32, 40, 48, 64px

**Spacing Scale :**

**Micro (éléments proches) :**
- `xs` : `4px` (0.25rem) - Espacement minimal (icône ↔ texte, éléments inline)
- `sm` : `8px` (0.5rem) - Espacement petit (éléments liés, padding inputs)

**Standard (éléments normaux) :**
- `md` : `12px` (0.75rem) - Espacement moyen (gap entre éléments de formulaire)
- `base` : `16px` (1rem) - Espacement de base (marges standard, padding panels)
- `lg` : `20px` (1.25rem) - Espacement large (sections, groupes d'éléments)

**Macro (séparation majeure) :**
- `xl` : `24px` (1.5rem) - Espacement extra-large (sections principales)
- `2xl` : `32px` (2rem) - Espacement très large (panels, containers)
- `3xl` : `48px` (3rem) - Espacement maximal (séparation majeure)

**Layout Principles :**

**1. Densité optimisée (outil de travail)**
- Espacement modéré : Pas trop dense (fatigue visuelle), pas trop aéré (perte d'espace)
- Focus sur contenu : Espacement sert la hiérarchie, pas la décoration
- **Application** : Panels avec padding `16px`, gap entre éléments `12px`

**2. Hiérarchie visuelle claire**
- Groupement logique : Éléments liés proches (`8px`), groupes séparés (`16px`)
- Sections distinctes : Séparation claire entre sections (`24px`)
- **Application** : Formulaires avec gap `12px` entre champs, `24px` entre sections

**3. Responsive aux interactions**
- Hover states : Padding suffisant pour zones cliquables (`8px` minimum)
- Focus states : Outline visible (`2px` avec `#646cff`)
- **Application** : Boutons avec padding `8px 16px`, inputs avec padding `8px 12px`

**4. Contraintes d'espace (Graph Editor)**
- Espacement compact : Maximiser l'espace canvas (panels `16px` padding)
- Redimensionnable : Panels collapsibles, mode plein écran
- **Application** : Panels latéraux min `100px`, padding interne `12px`

**Grid System :**

Pas de grid system strict nécessaire (layout flex/panels), mais principes :
- Alignement : Snap to grid `15px` pour nodes ReactFlow (déjà en place)
- Cohérence : Multiples de 4px pour tous les espacements
- **Application** : Canvas avec grid `15px` (proche de `16px` base), nodes alignés

**Component Spacing :**

**Panels :**
- Padding interne : `16px` (base)
- Gap entre sections : `24px` (xl)
- Gap entre éléments : `12px` (md)

**Forms :**
- Gap entre champs : `12px` (md)
- Gap entre groupes : `20px` (lg)
- Padding inputs : `8px 12px` (sm horizontal, md vertical)

**Buttons :**
- Padding : `8px 16px` (sm horizontal, base vertical)
- Gap entre boutons : `8px` (sm)
- Margin groupes : `16px` (base)

**Graph Nodes :**
- Padding interne : `12px` (md)
- Gap contenu : `8px` (sm)
- Espacement entre nodes : Auto (ReactFlow layout)

## Accessibility Considerations

**Contraste (WCAG AA minimum) :**
- Text primary (`rgba(255, 255, 255, 0.95)`) sur background primary (`#1a1a1a`) : **Ratio 12.6:1** ✅
- Text secondary (`rgba(255, 255, 255, 0.75)`) sur background secondary (`#242424`) : **Ratio 7.2:1** ✅
- Text tertiary (`rgba(255, 255, 255, 0.55)`) sur background tertiary (`#2d2d2d`) : **Ratio 4.8:1** ✅
- Tous les textes respectent WCAG AA (4.5:1) et la plupart WCAG AAA (7:1)

**Focus Management :**
- Focus visible : Outline `2px solid #646cff` avec `rgba(100, 108, 255, 0.3)` (déjà en place)
- Navigation clavier : Raccourcis clavier documentés (`useKeyboardShortcuts`)
- Skip links : Non nécessaire (application SPA, pas de navigation complexe)

**Tailles de texte :**
- Minimum : `0.75rem` (12px) pour tooltips (acceptable, usage limité)
- Standard : `0.9rem` (14.4px) pour body (confortable)
- Headings : `1rem`+ (16px+) pour hiérarchie claire

**Couleurs et états :**
- Pas de dépendance à la couleur seule : Icônes, formes, labels textuels
- États visuels clairs : Hover, focus, selected avec feedback visuel
- États sémantiques : Error, success, warning avec couleurs + icônes

**Interactions :**
- Zones cliquables : Minimum `44x44px` (touch targets)
- Feedback immédiat : Hover, click, focus states visibles
- Retry facile : Actions destructives avec confirmation

**Mécaniques spécifiques par type de génération :**

**Génération pour choix spécifique :**
- Initiation : Clic sur handle de choix PJ
- Interaction : Sélection choix → Génération
- Feedback : 1 nœud généré, connexion auto-appliquée
- Completion : Nœud visible, auto-focus

**Génération batch (tous les choix) :**
- Initiation : Clic "Générer tous les choix"
- Interaction : Sélection "Générer pour tous (5 choix)" → Génération batch
- Feedback : Progression "2/5 nœuds générés", streaming visible
- Completion : 5 nœuds générés, connexions auto-appliquées, auto-focus premier nœud

**Génération nextNode (navigation linéaire) :**
- Initiation : Clic "Generate Next" sur nœud terminal
- Interaction : Génération nœud suivant (pas de choix PJ)
- Feedback : 1 nœud généré, connexion `nextNode` auto-appliquée
- Completion : Nœud visible, auto-focus

## Validation Strategy

**Métriques de succès à mesurer :**

1. **Performance & Efficacité**
   - Temps pour générer un dialogue complet (avant/après implémentation)
   - Nombre de clics/interactions nécessaires pour compléter un workflow standard
   - Taux d'erreur (connexions manquantes, nodes orphelins, validations échouées)

2. **Satisfaction Utilisateur**
   - Survey post-usage (NPS, facilité d'utilisation, satisfaction globale)
   - Feedback qualitatif sur les patterns spécifiques (barre 4 résultats, batch génération, auto-apply)
   - Fréquence d'utilisation des features (batch vs génération individuelle)

3. **Adoption des Patterns**
   - Validation que les patterns Articy Draft X sont transférables à notre contexte
   - Identification des patterns qui nécessitent adaptation après tests utilisateurs
   - Confirmation que les simplifications (pins system, nested flows) ne limitent pas la fonctionnalité

**Approche de validation :**

1. **Prototype rapide** : Valider l'UX de la barre 4 résultats avec un prototype interactif avant implémentation complète
2. **Tests utilisateurs** : Sessions avec 3-5 utilisateurs cibles pour valider les patterns "What to Adopt"
3. **Métriques continues** : Tracking des métriques post-déploiement pour itérer rapidement

**Priorisation d'implémentation :**

1. **Phase 1 - Patterns "What to Adopt" (moins risqués)**
   - Layout 3 colonnes (déjà en place, optimiser)
   - Progressive Disclosure (barre 4 résultats compacte)
   - Quick Create / Batch Generation (first-class)
   - Auto-apply Connections (Story 0.5.5)
   - Inline Editing (panel contextuel)

2. **Phase 2 - Patterns "What to Adapt" (après validation Phase 1)**
   - Hub-Based Branching (barre 4 résultats comme hub visuel)
   - Pins System simplifié (handles simples, conditions dans panel)
   - Nested Flows adaptés (structure plate, focus dialogue individuel)

3. **Phase 3 - Anti-patterns mitigation (itérations continues)**
   - Auto-layout intelligent (minimiser croisements)
   - State persistence (zoom, sélection, panneau)
   - Validation structure (détecter orphans, cycles)
