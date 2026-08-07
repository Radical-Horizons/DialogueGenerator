---
description: Refonte UI 2026 — prototypes HTML de référence, où les lire et comment s'en servir
paths:
  - "frontend/src/**"
  - "docs/design/refonte-ui-2026/**"
---
# Refonte UI 2026 — la maquette est dans le dépôt

## Source de vérité

`docs/design/refonte-ui-2026/` :

| Fichier | Écran |
|---|---|
| `accueil-1c.dc.html` | **1c** — page de génération au repos (cible retenue) |
| `etats-2a-2e.dc.html` | **2a** génération · **2b** résultat · **2c** mode écriture · **2d** 1024 px · **2e** éditeur de graphe |
| `README.md` | Handoff : layout, tokens, ordre d'implémentation, points ouverts |
| `support.js` | Runtime requis pour ouvrir les `.dc.html` dans un navigateur |

Les explorations **1a** et **1b** ont été **retirées** : elles n'ont jamais été la cible. Si un
ancien fichier les contient encore, il est périmé.

## Règle d'or : lire le HTML avant de coder

Les valeurs exactes — couleurs, `font-size`, `padding`, largeurs de colonne, `letter-spacing` —
sont dans les attributs `style` des blocs `#1c` et `2a`–`2e`. **Ouvrir le fichier et relever la
valeur**, ne pas l'approximer depuis le README ni depuis une capture.

⚠️ Erreur déjà commise (août 2026) : trois passes de « restylage » de l'ancien formulaire avant
d'ouvrir le HTML fourni. Résultat — polices de repli au lieu d'Instrument Serif/Sans, structure
inchangée, et un utilisateur qui ne voyait aucune amélioration. Le HTML était disponible depuis
le début.

## Consulter les prototypes

```bash
npm run design:refs
```

puis http://localhost:8972/accueil-1c.dc.html et http://localhost:8972/etats-2a-2e.dc.html.

## Fidélité attendue

**Haute.** Couleurs, tailles, espacements, largeurs et libellés se reprennent tels quels. Seules
libertés : données factices (noms, chiffres de tokens) et placement des nœuds dans le canvas.

Invariants transverses (détail dans le README) :

- Un **seul** bouton plein `#4f7fff` par écran — sinon bordure `#2e2e36`, fond transparent.
- **Aucun chiffre en sans-serif** : tokens, coûts, compteurs, horodatages, ids → mono.
- Espacements : **5 / 9 / 14 / 20 / 34 px**, rien entre.
- Rayons : 6 (contrôles) · 8 (nœuds) · 99 (chips).
- Chaque panneau vide porte une phrase disant ce qui s'y affichera.
- Tokens applicatifs : `frontend/src/theme/redesignTokens.ts` — ne pas redéfinir de valeur en dur
  quand le token existe.

## Ne pas supprimer une fonctionnalité pour « faire comme la maquette »

La maquette est une image : elle ne montre pas toujours les affordances nécessaires. Quand un
élément de l'app n'apparaît pas dans l'écran cible, **lui trouver sa place** (repli, pied de
colonne, onglet) plutôt que le retirer. Cas déjà rencontrés :

- La case à cocher des fiches GDD : absente de 1c, mais le clic sur la rangée ouvre le détail —
  sans elle, plus aucun moyen de sélectionner. Conservée au format discret de 1a/1b.
- Le bouton « Rafraîchir le contexte » et le CTA du tiroir mobile : supprimés par erreur en
  déplaçant l'action primaire, restaurés après échec des tests.

Corollaire : quand un test préexistant tombe pendant la refonte, vérifier **d'abord** si une
fonctionnalité a disparu (cf. `.claude/rules/tests.md`), avant de corriger l'assertion.

## État d'avancement

Branche `refonte-ui-2026`. **Les cinq écrans de la maquette sont implémentés** : 1c, 2a,
2b, 2c, 2d, 2e. Reste ouvert seulement ce qui est listé dans
`_bmad-output/implementation-artifacts/deferred-work.md`.

Correspondance écran → code (point d'entrée) :

| Écran | Où ça vit |
|---|---|
| **1c** repos | `GenerationPanel`, `SceneSelectionWidget`, `Dashboard` (3 colonnes) |
| **2a** génération | `useGenerationRunState` + `GenerationStreamingInline` + `GenerationTracePanel` |
| **2b** comparaison | `generationOptionsStore`, `GenerationOptionsComparison`, `generationOptionDiagnostics` |
| **2c** écriture | `uiLayoutStore.writingMode`, `WritingModeRail`, `Tabs hideTabList` |
| **2d** 1024–1200px | `PromptBudgetBottomDrawer` + `useMediaQuery` |
| **2e** graphe | `uiLayoutStore.inspectorTab`, `GraphInspector`, `GraphInspectorNodeSummary` |

## Pièges rencontrés — ne pas les refaire

- **Deux formes de JSON Unity coexistent.** La génération renvoie un **tableau nu**
  de nœuds (`render_unity_nodes` → `json.dumps(nodes)`) ; les fichiers persistés sont
  des documents `{schemaVersion, nodes: [...]}`. Supposer une seule forme casse
  silencieusement : côté front l'aperçu des options restait vide, côté back le `title`
  du listing était `null` pour tous les dialogues du disque. Voir `firstUnityNode`
  (front) et `_nodes_of` (`api/routers/unity_dialogues.py`).
- **`hidden` ne masque pas un élément qui porte un `display` inline.** La règle UA
  `[hidden] { display: none }` perd en spécificité. Calculer le `display`.
- **`useNarrowInlineSize` : le `ResizeObserver` vit dans un effet**, pas dans la
  callback ref. Sous `React.StrictMode` le cleanup le déconnecterait sans jamais le
  recréer — hook aveugle après le premier paint.
- **Mocks de store et sélecteurs.** Plusieurs suites remplacent `useGenerationStore`
  par un `mockReturnValue` qui ignore le sélecteur et renvoie l'objet entier. Un
  composant qui lit déjà le store sans sélecteur doit se servir de ses propres
  valeurs (cf. `GenerationPanel`), et les hooks partagés coercent avec `=== true`.
- **« NŒUDS » de la toolbar ≠ « RÉPLIQUES » de la liste.** Le canvas compte aussi les
  nœuds de test et de fin dérivés ; le fichier compte les nœuds écrits. Deux mesures,
  deux mots — ne pas les uniformiser sans changer la logique.

## Diagnostic : uniquement du calculable

La colonne Diagnostic de 2b n'affiche que ce qui se dérive du JSON produit et du
contexte envoyé (longueur, réponses, flags, fiches citées). Les jugements de la
maquette — « ton demandé : tenu », « mensonge possible : oui » — exigeraient un
second appel LLM. Ne pas les simuler par heuristique.
