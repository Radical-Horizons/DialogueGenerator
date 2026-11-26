---
description: "Refonte Scène (validée le 2026-11-20, Epic 20 prioritaire) — où sont la maquette, l'architecture et l'epic, et comment s'en servir"
paths:
  - "docs/design/refonte-scene/**"
  - "docs/architecture/refonte-scene-architecture.md"
  - "_bmad-output/planning-artifacts/epics/epic-20.md"
  - "frontend/src/components/layout/**"
  - "frontend/src/components/graph/**"
  - "frontend/src/components/generation/**"
  - "frontend/src/theme/**"
  - "frontend/src/utils/**"
  - "frontend/src/store/**"
---
# Refonte « Scène »

## Statut

**Validée le 2026-11-20 ; l'epic 20 est prioritaire et passe devant les autres.** Pour chaque écran qu'elle couvre,
la refonte Scène remplace la maquette 2026 (`docs/design/refonte-ui-2026/`, règle `ui_redesign_2026.md`), dont la
charte (couleurs, polices, filets, un seul bouton bleu) reste valable. Un écran pas encore repris par une story livrée
garde son code actuel. Ne pas implémenter un écran Scène hors d'une story Epic 20 menée par `bmad-build`
(voir « Coder une story » ci-dessous).
Epic 18 est intégrée à l'epic 20 (18.4, 18.8, 18.5a en tranche 1 bis ; 18.5b, 18.6, 18.7, 18.9, 18.11 en
tranche 2) ; Epic 19 est remplacée. Seuils de mesure : section « Seuils de mesure » d'`epic-20.md` (ADR-008).

## Coder une story

- **Une session par story, un seul skill** : `bmad-build` (plugin `bmad-method`) lit la story dans `epic-20.md`, écrit
  sa spec, la fait approuver, implémente, relit et met `sprint-status.yaml` à jour. Il n'y a plus de fichier de story
  préparé à part : `bmad-create-story` et `bmad-dev-story` sont l'ancien cycle (BMAD 6.10). Sans surveillance :
  `bmad-loop run` (skill `bmad-dev-auto`). Détail : section BMAD de `CLAUDE.md`.
- **La spec UX de `_bmad-output/planning-artifacts/ux-design-specification/` est remplacée** pour l'epic 20 et les
  stories d'Epic 18 qu'elle reprend : n'en tirer aucun critère. Seule la charte de `design-system-foundation.md`
  reste valable. Le dossier `planning-artifacts/architecture/` (v10) ne porte aucune décision de la refonte.
- **Avant d'écrire la spec** : vérifier dans le code ce qui est déjà livré (ex. 18.4 : regroupement des frappes,
  commit `61462f0a8`, `frontend/src/__tests__/graphStore.updateNodeUndo.test.ts`) et partir du plan de test
  `_bmad-output/test-artifacts/test-design-epic-20.md` (couverture existante, risques, P0).
- Ces consignes sont injectées dans `bmad-build`, `bmad-dev-auto` et `bmad-create-story` par
  `_bmad/custom/<skill>.toml` (`persistent_facts`, qui chargent ce fichier).

## Sources de vérité

| Quoi | Où |
|---|---|
| Écrans, composants, raccourcis, tokens Papier, table « où va chaque fonction » | `docs/design/refonte-scene/README.md` |
| Prototypes HTML (valeurs exactes dans les `style`) | `docs/design/refonte-scene/*.dc.html` |
| Décisions techniques (fiche de scène, éditeur unique, texte ↔ blocs, rewrite-span, paliers de zoom) | `docs/architecture/refonte-scene-architecture.md` |
| Découpage | `_bmad-output/planning-artifacts/epics/epic-20.md` |
| Recherche (sources) | `_bmad-output/planning-artifacts/research/ux-refonte-scene-2026-11-19.md` |
| Canvas | <https://claude.ai/artifact/VynbrAeNhQULRXhbnVnTDW> |
| Ambiance (teintes de lieu, portraits, couvertures) | canvas <https://claude.ai/artifact/GVZfj6RsZqGQGwEg8X5SxN>, architecture A16, story 20.20 |
| Discussion avec l'IA (front de la PR #103) | architecture A15, stories 20.21–20.23, `docs/architecture/conversations-ia.md` |

Ouvrir les prototypes : configuration `design-refonte-scene` de `.claude/launch.json` (port 8973), puis
`http://localhost:8973/Main.dc.html`.

## Invariants

- **Epic 18 est la fondation** : champ `<textarea>` (D4, intact : toute la réplique passe en texte brut à l'entrée,
  aucun éditeur de blocs), clic simple qui pose le curseur à la position cliquée (D1, sans la règle des deux clics),
  ÉCHAP sort (D2), widget composite (D5). Un seul écrivain du texte : dès qu'un champ in-situ écrit (18.5b),
  `NodeEditorPanel` et `UnityDialogueEditor` passent en lecture seule pour le texte (A14). La refonte ne rouvre que trois
  points : largeur de carte (360 px au lieu de 280), D3 (texte lisible hors sélection par paliers de zoom) et la
  hauteur maximale de carte (réplique bornée à 12 lignes, réponses jamais coupées) — écarts au § 14 du README,
  tranchés par la story 20.2 (preuve de perf) ; si elle échoue, **plan B** : 280 px et D3 inchangée.
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
