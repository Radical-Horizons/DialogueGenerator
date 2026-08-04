---
description: Refonte UI 2026 — prototypes HTML de référence, où les lire et comment s'en servir
globs: ["frontend/src/**", "docs/design/refonte-ui-2026/**"]
alwaysApply: false
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

Branche `refonte-ui-2026`. Fait : tokens et polices, purge des emoji, rangées en filets,
écran 1c (header, colonne gauche, colonne de lecture 660 px, colonne droite + TOTAL + DERNIER
RÉSULTAT), dissolution de la modale de progression. Reste : **2e** (inspecteur à onglets — le plus
gros), toolbar graphe une rangée, `EndNode`/`TestNode`, **2a** finition, **2b**, **2c**, **2d**.

La comparaison **4 options** de 2b est en suspens : le backend est one-shot
(`GenerateUnityDialogueResponse` n'a pas de champ variantes), la faire coûterait N appels LLM par
génération. Décision utilisateur requise — voir `_bmad-output/implementation-artifacts/deferred-work.md`.
