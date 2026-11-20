---
description: "Refonte Scène (proposition 2026-11-20) — où sont la maquette, l'architecture et l'epic, et comment s'en servir"
paths:
  - "docs/design/refonte-scene/**"
  - "docs/architecture/refonte-scene-architecture.md"
  - "_bmad-output/planning-artifacts/epics/epic-20.md"
  - "frontend/src/components/layout/**"
  - "frontend/src/components/graph/**"
---
# Refonte « Scène »

## Statut

**Proposition du 2026-11-20, en attente de validation par l'auteur.** Tant que `epic-20.md` porte le statut
« proposition », la maquette 2026 (`docs/design/refonte-ui-2026/`, règle `ui_redesign_2026.md`) reste la cible du code
en production. Ne pas implémenter un écran Scène sans story Epic 20 créée.

## Sources de vérité

| Quoi | Où |
|---|---|
| Écrans, composants, raccourcis, tokens Papier, table « où va chaque fonction » | `docs/design/refonte-scene/README.md` |
| Prototypes HTML (valeurs exactes dans les `style`) | `docs/design/refonte-scene/*.dc.html` |
| Décisions techniques (fiche de scène, éditeur unique, texte ↔ blocs, rewrite-span, paliers de zoom) | `docs/architecture/refonte-scene-architecture.md` |
| Découpage | `_bmad-output/planning-artifacts/epics/epic-20.md` |
| Recherche (sources) | `_bmad-output/planning-artifacts/research/ux-refonte-scene-2026-11-19.md` |
| Canvas | <https://claude.ai/artifact/VynbrAeNhQULRXhbnVnTDW> |

Ouvrir les prototypes : configuration `design-refonte-scene` de `.claude/launch.json` (port 8973), puis
`http://localhost:8973/Main.dc.html`.

## Invariants

- **Epic 18 est la fondation** : champ `<textarea>` (D4, intact : toute la réplique passe en texte brut à l'entrée,
  aucun éditeur de blocs), clic simple (D1), ÉCHAP sort (D2), widget composite (D5). La refonte ne rouvre que la
  largeur de carte (360 px au lieu de 280) et D3 (texte lisible hors sélection par paliers de zoom) — écarts au § 14
  du README, tranchés par la story 20.2 (preuve de perf) ; si elle échoue, **plan B** : 280 px et D3 inchangée.
- **Raccourcis en CTRL**, jamais ⌘ (utilisateur sous Windows). Le README du design system écrit encore ⌘ : traduire.
  Ni ALT seul (menus du navigateur sous Windows : la lentille est sur L), ni CTRL+1–9 (onglets : les vues sont sur
  ALT+1/2/3), ni CTRL+N (nouvelle fenêtre : nouvelle scène sur ALT+N).
- **Aucun chiffre inventé** dans une maquette : les chiffres réels de la scène de démonstration sont dans le README § 5 ;
  ce qui est un exemple est dit en pied de board.
- **Le modèle de dialogue est un arbre exponentiel** (réponses uniques, test = 4 issues, pas de « continuer ») ; ne
  jamais généraliser à partir de `voknir_latelier_du_cartographe.json`, import Notion hors modèle.

## Pièges des prototypes `.dc.html` (runtime `support.js`)

- `componentDidUpdate(prevProps, prevState)` reçoit des arguments **undefined** : garder les valeurs précédentes dans
  des champs d'instance (`this.lastX`). Vécu le 2026-11-20 : écran blanc au premier `setState`.
- Un `<path d="{{…}}">` dans un `<sc-for>` déclenche une erreur console au premier rendu (gabarit brut) : envelopper
  dans un `<sc-if>` tant que la liste est vide ; l'erreur restante au tout premier paint est sans effet visible.
- Vérifier chaque board par rendu PNG (Playwright, viewport = taille du board) avant de le publier.
