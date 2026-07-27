# Recherche GDD inter-onglets (livré v1.8.4)

**Statut :** livré  
**Périmètre :** panneau Contexte GDD (`ContextSelector`) — onglets Personnages, Lieux, Objets, Espèces, Communautés

> La vision V1.5 (recherche full-text serveur, SQLite FTS5, filtres métadonnées) reste planifiée : voir [V1.5 Unified Context Search](./v1.5-unified-context-search.md). Ce document décrit le comportement **actuel** en production.

## Problème résolu

Avant v1.8.4, la recherche ne filtrait que la page courante de l’onglet actif. Une fiche hors onglet (ex. région **Taluo** dans Lieux alors que l’onglet Personnages est ouvert) n’apparaissait pas.

## Comportement utilisateur

| Action | Effet |
|--------|--------|
| Saisie dans la barre au-dessus des onglets | Recherche dans **toutes** les catégories chargées |
| Raccourci `/` (hors champ texte) | Focus sur la barre de recherche |
| Clic sur un résultat d’un autre onglet | Bascule automatiquement vers l’onglet correspondant |
| Tri (A-Z, Z-A, Sélectionnés en premier) | S’applique aux résultats ; en recherche, l’onglet actif est **priorisé** dans la liste |
| Badge type sur chaque ligne | Indique Personnage, Lieu, Objet, etc. |

Placeholder par défaut : `Rechercher dans tout le GDD… (/)`.

## Architecture (client)

```
ContextSelector
├── ContextSearchControls     # barre recherche + tri (au-dessus des onglets)
├── onglets par type d'entité
└── ContextList
    ├── filtre nom (includes, insensible à la casse)
    ├── priorityEntityTab     # onglet actif en tête des résultats
    └── scroll infini         # charge les pages API manquantes
```

### Catalogue et pagination

- Au montage, le panneau charge la **première page** (50 éléments) de chaque catégorie paginée via l’API contexte (`listCharacters`, `listLocations`, etc.).
- **Sans recherche** : seule la liste de l’onglet actif est affichée ; le scroll infini charge les pages suivantes de cet onglet.
- **Avec recherche** : les buffers de **tous** les onglets sont fusionnés et tagués (`entityTab`, `entityTypeLabel`). Si aucun match n’est trouvé localement mais qu’il reste des pages non chargées, `ContextList` déclenche automatiquement le chargement des pages suivantes (`loadMoreForSearch`) jusqu’à trouver un résultat ou épuiser le catalogue.

### Sélection typée

Les noms peuvent coexister entre catégories. La sélection utilise `(entityTab, name)` pour éviter les collisions — un clic sur « Taluo » en Lieu ne bascule pas la sélection d’un homonyme ailleurs.

### Rafraîchissement après sync GDD

Après une sync Notion qui modifie les fichiers sous `data/GDD_categories/`, `GddNotionSyncSection` appelle `useContextStore.bumpGddDataRevision()` ; `ContextSelector` recharge alors le catalogue.

## Limites connues

- Recherche **côté client** sur les noms déjà chargés (pas de full-text sur le corps des fiches).
- Pas de filtres métadonnées (région, sprint) ni de favoris — prévus en V1.5.
- Espèces : liste non paginée (chargement complet au démarrage).

## Fichiers de référence

| Zone | Fichiers |
|------|----------|
| Orchestration | `frontend/src/components/context/ContextSelector.tsx` |
| Liste + scroll recherche | `frontend/src/components/context/ContextList.tsx` |
| Barre recherche/tri | `frontend/src/components/context/ContextSearchControls.tsx` |
| Store sélections | `frontend/src/store/contextStore.ts` |
| API catalogue | `frontend/src/api/context.ts`, routes `api/routers/context.py` |
| Tests | `ContextList.test.tsx`, `ContextSelector.test.tsx` |

## Tests de régression

```bash
cd frontend && npx vitest run src/components/context/ContextList.test.tsx src/components/context/ContextSelector.test.tsx
```
