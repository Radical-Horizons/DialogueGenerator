# Fix de la scrollbar dans EstimatedPromptPanel

## Problème initial

La scrollbar du panneau "Prompt Estimé" n'était pas visible, malgré plusieurs tentatives de correction. Le contenu dépassait la zone visible mais la scrollbar n'apparaissait pas.

## Analyse du problème

### Causes identifiées

1. **Conflit `overflow` dans les styles inline React**
   - React combine `overflowY` et `overflowX` en une seule propriété `overflow`
   - Utiliser `overflow: 'auto'` dans le style inline créait `overflow: "hidden auto"` (invalide)
   - Solution : Utiliser `overflowY: 'auto'` et `overflowX: 'hidden'` séparément

2. **Parents avec `overflow: 'hidden'`**
   - Le composant `Tabs` et ses parents avaient `overflow: 'hidden'`
   - Cela masquait la scrollbar même si elle existait techniquement
   - Solution : Ajouter `scrollbarGutter: 'stable'` sur le conteneur de contenu du `Tabs`

3. **Styles CSS personnalisés trop agressifs**
   - Les styles webkit avec `!important` forçaient des couleurs personnalisées
   - Cela créait une incohérence avec les autres scrollbars de l'application
   - Solution : Supprimer les styles personnalisés et utiliser les scrollbars par défaut du navigateur

4. **Conteneur non contraint en hauteur**
   - Le conteneur scrollable s'étendait à sa hauteur de contenu au lieu d'être contraint
   - Solution : Utiliser `height: 0` et `flex: '1 1 0%'` pour forcer le respect de la hauteur parent

## Solution finale

### Code appliqué

```tsx
<div 
  style={{ 
    flex: '1 1 0%', // Utilise flex-basis: 0% pour forcer le respect de la hauteur parent
    minHeight: 0,
    height: 0, // Force le conteneur à respecter la hauteur du parent flex
    // NE PAS utiliser overflow: 'auto' car React le combine mal avec overflowX/overflowY
    // Utiliser overflowY et overflowX séparément (comme ContextSelector ligne 330)
    overflowY: 'auto', // Comme les autres scrollbars visibles de l'app
    overflowX: 'hidden', // Pas de scroll horizontal
    padding: '1rem',
    boxSizing: 'border-box',
    // Force la scrollbar à être visible
    scrollbarGutter: 'stable',
  }}
>
```

### Modifications dans Dashboard.tsx

```tsx
<Tabs
  tabs={rightPanelTabs}
  activeTabId={rightPanelTab}
  onTabChange={(tabId) => setRightPanelTab(tabId as 'prompt' | 'variants' | 'details')}
  style={{ flex: 1, minHeight: 0, overflow: 'hidden' }}
  // Important: overflow: 'hidden' pour éviter le double scroll, mais scrollbar-gutter réserve l'espace
  // Le contenu enfant gère son propre scroll avec scrollbar-gutter: stable
  contentStyle={{ overflow: 'hidden', scrollbarGutter: 'stable' }}
/>
```

## Pourquoi ça marche maintenant

1. **`overflowY: 'auto'` et `overflowX: 'hidden'` séparés** : Évite le conflit React qui créait `overflow: "hidden auto"` (invalide)

2. **`height: 0` et `flex: '1 1 0%'`** : Force le conteneur à respecter la hauteur du parent flex au lieu de s'étendre à sa hauteur de contenu

3. **`scrollbarGutter: 'stable'`** : Réserve l'espace pour la scrollbar même quand elle n'est pas visible, évitant les décalages de layout

4. **Pas de styles personnalisés par composant** : le style de barre est unique et global (`frontend/src/index.css`, sélecteur `*` — barre fine depuis la refonte 2026), garantissant la cohérence visuelle

## Références

- `frontend/src/components/context/ContextSelector.tsx:330` : Exemple de scrollbar fonctionnelle
- `frontend/src/components/context/ContextList.tsx:65` : Exemple de scrollbar fonctionnelle
- `frontend/src/components/shared/Tabs.tsx` : Composant modifié pour supporter `contentStyle`

## Leçons apprises

1. **React combine `overflowY` et `overflowX`** : Toujours les définir séparément dans les styles inline
2. **Flexbox et hauteur** : Utiliser `height: 0` avec `flex: '1 1 0%'` pour contraindre un conteneur flex
3. **Un seul style de barre** : jamais de style local à un composant — il cohabiterait avec le style global de `index.css` et on verrait deux barres différentes côte à côte
4. **`scrollbarGutter: 'stable'`** : Utile pour éviter les décalages de layout avec les scrollbars overlay


