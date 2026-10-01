---
title: "Édition in-situ dans le nœud — analyse Articy:draft X et éditeurs en ligne"
date: '2026-10-01'
type: ux-research
status: done
consumed_by: ['epics/epic-18.md', 'epics/epic-19.md']
---

# Édition in-situ dans le nœud — ce qu'on imite, ce qu'on n'imite pas

Note de cadrage produite pour **Epic 18** (édition in-situ) et **Epic 19** (canvas-first).
Deux familles de références : les **éditeurs de dialogue à nœuds** (Articy:draft X) et les
**éditeurs de texte en ligne sans mode** (Notion, Confluence).

---

## 1. Articy:draft X — Flow Editor

### Ce qui est établi (documentation éditeur)

| Comportement | Détail |
|---|---|
| **Édition dans le nœud** | Les champs d'un *Dialogue Fragment* s'éditent directement sur le canvas, pas dans un inspecteur séparé. |
| **Curseur pré-placé à la création** | À la création d'un fragment, le curseur est **déjà** dans un champ — Speaker à la création simple, **Dialogue Line** quand le nœud naît d'un drag de connexion (« the majority of times this will be where we want to continue writing »). Zéro clic avant d'écrire. |
| **Chaîne de tabulation** | `Tab` enchaîne les zones : **Speaker → Menu Text → Stage Directions → Dialogue Line**, puis le pin de sortie. |
| **Sortie d'un champ multiligne** | `Tab` insère/ne sort pas depuis la *Dialogue Line* : il faut **`Ctrl+Tab`** pour atteindre la zone suivante. |
| **Validation** | `Enter` confirme un champ court et avance (Speaker → Menu Text). |
| **Accès direct souris** | N'importe quel champ est atteignable par clic direct, sans passer par la chaîne Tab. |

### Ce qu'on reprend

1. **Le curseur pré-placé à la création.** C'est le gain de friction le plus élevé et le
   moins cher. Un nœud créé manuellement doit arriver en édition.
2. **La chaîne Tab explicite** à l'intérieur du nœud, adaptée à notre modèle :
   `Titre → Speaker → Réplique PNJ → Réponse PJ 1 → … → Réponse PJ N`.
3. **`Ctrl+Tab` (ou `Tab` simple si la réplique n'accepte pas le retour-ligne) pour sortir
   d'un champ multiligne.** Le piège est réel : sans ça, `Tab` dans une réplique de trois
   lignes est soit inerte, soit destructeur.
4. **Clic direct sur n'importe quel champ**, pas de parcours imposé.

### Ce qu'on n'imite pas — et pourquoi

| Articy | Nous | Raison |
|---|---|---|
| Réponses joueur = **nœuds séparés** sur le canvas | Réponses PJ = **lignes dans le nœud PNJ** (`choices[]`) | Notre modèle de document est le JSON Unity : un nœud porte sa réplique **et** ses choix. Éclater les choix en nœuds casserait `choiceId` et le format d'export. |
| Base de contenu complète (entités, templates, variables) dans l'outil | GDD externe (Notion → `data/GDD_categories/`) | Hors périmètre, et c'est précisément ce que la critique récurrente d'Articy reproche à l'outil : on paie et on apprend une base de données dont on n'utilise qu'une fraction. |
| Courbe d'apprentissage assumée (« plusieurs jours avant d'être productif ») | Persona Mathieu, premier run < 30 min (Epic 11) | L'édition in-situ doit **réduire** la courbe, pas ajouter une grammaire d'interaction à apprendre. |

**Conséquence de design.** « Afficher le dialogue entier dans le nœud » ne veut pas dire la
même chose chez eux et chez nous. Chez Articy, c'est une réplique par nœud. Chez nous, c'est
**une réplique PNJ + N réponses PJ** dans le même cadre. C'est plus dense — donc la
hiérarchie visuelle PNJ (serif) / PJ (lignes compactes, pastille orange) devient porteuse,
et pas seulement décorative.

---

## 2. Notion / Confluence — l'édition sans mode

### Le modèle

- **Pas de mode édition.** On clique dans un mot, on écrit. Il n'existe aucun instant où la
  page est « en édition » par opposition à « en lecture ». Pas de bouton Modifier, pas de
  bascule.
- **Clic simple, pas double-clic.** Le double-clic sélectionne un mot, comme partout ailleurs
  dans un champ texte. Il n'active pas l'édition — il n'y a rien à activer.
- **Pas de bouton Enregistrer, pas de bouton Annuler, pas de brouillon.** La sauvegarde est
  automatique et *debouncée* ; l'état courant **est** l'état stocké.
- **`Échap` quitte le bloc — en conservant la saisie.** Il ne **restaure pas** la valeur
  précédente : il n'y a pas de brouillon à jeter. `Échap` effectue le même flush que toutes
  les autres sorties de bloc, puis sélectionne le bloc.
- **Le debounce ne doit pas produire une révision par frappe**, sinon l'historique devient
  inexploitable.

### Ce qu'on reprend

1. **Clic simple dans le texte.** Décision structurante : chez nous le **double-clic est déjà
   pris** (`ux-consistency-patterns.md:105` → ouverture de l'AIGenerationPanel ; epic-02 →
   focus nœud ; et React Flow zoome au double-clic par défaut). L'activation par clic simple
   est à la fois le pattern Notion et le seul créneau libre.
2. **`Échap` = quitter le champ, pas annuler.** À retenir absolument : ma première
   formulation (« Échap annule la saisie ») **contredit ADR-006**. ADR-006 dit « pas de
   brouillon dans les formulaires, push au store à la saisie ». Si le texte est déjà dans le
   store, il n'y a rien à annuler — l'annulation, c'est **`Ctrl+Z`** sur la pile undo
   existante (zundo). FR126 est corrigé en ce sens.
3. **Pas de bouton Enregistrer.** C'est déjà la règle du dépôt (ADR-006 : « pas de bouton
   Sauvegarder ; optionnel : Synchroniser maintenant »).

### La tension à arbitrer explicitement

Deux design systems sérieux (GitLab, et la littérature inline-edit en général) recommandent
l'inverse de ce qu'on fait :

- **Accessibilité** : pour les contrôles déclaratifs (champs texte, cases, listes), la
  sauvegarde **explicite** est recommandée — un changement de contexte déclenché par la seule
  saisie est hostile au lecteur d'écran (esprit de WCAG 3.2.2 *On Input*).
- **Psychologie utilisateur** : « les gens paniquent quand il n'y a pas de bouton Enregistrer »
  — le conseil courant est de **garder** un bouton, même décoratif.

**Arbitrage : ADR-006 l'emporte.** C'est une décision d'architecture déjà prise, implémentée,
et dont la raison (perte de données à la fermeture d'onglet) est documentée. On ne la
re-litige pas pour une story d'UI. **Mais on paie la mitigation**, et elle est non
négociable :

- un **indicateur de synchronisation visible et vivant** (« Synchronisé » / « N changements en
  attente » / « Erreur »), déjà prévu par ADR-006 → c'est l'UX-DR4 d'Epic 18 ;
- une **annonce accessible** du statut (`aria-live="polite"`) pour que l'absence de bouton ne
  se traduise pas par un silence pour le lecteur d'écran ;
- `Ctrl+Z` qui marche vraiment sur une édition in-situ, pas seulement sur les mutations de
  graphe.

Sans ces trois-là, « éditer = sauvegarder » n'est pas un pattern, c'est une perte de contrôle.

---

## 3. Pièges techniques identifiés (React Flow 11)

Relevés en lisant le code, à transformer en critères d'acceptation :

| Piège | Détail | Parade |
|---|---|---|
| **Drag du nœud pendant la saisie** | Le corps du nœud est une poignée de drag. Sélectionner du texte à la souris déplacerait le nœud. | Classe `nodrag` sur la zone éditable. |
| **Scroll** | Une réplique longue scrollera dans le nœud ; la molette zoome le canvas. | Classe `nowheel` sur la zone scrollable. |
| **`Backspace` / `Delete` supprime le nœud** | `GraphCanvas.tsx:674` ne configure pas `deleteKeyCode` → valeur par défaut active. React Flow 11 ignore les événements venant d'un `input`/`textarea` (`isInputDOMNode`), mais ce n'est pas vérifié ici. | Test de régression explicite : effacer un caractère ne supprime pas le nœud. |
| **Écrasement de `targetNode`** | Le flush du formulaire doit passer par `mergeDialogueNodeFormIntoStoreData()`. Un spread `{...nodeData, ...formValues}` écrase `choices[N].targetNode` posé par `connectNodes` et casse les arêtes. | Fait technique déjà documenté dans `CLAUDE.md`. Même parade côté in-situ. |
| **Double debounce concurrent** | `NodeEditorPanel` pousse au store avec son propre debounce (`NodeEditorPanel.tsx:219-233`). Deux éditeurs debouncés sur le même champ = dernier écrivain gagne. | Une seule source : le store. Le panneau se `reset` sur changement du store (L300) ; à vérifier, pas à supposer. |
| **Handles de choix positionnés en %** | `getChoiceHandleLeftPercent(index)` place les pastilles sur le bord bas. Passer les choix en lignes implique des handles par ligne (bord droit). | `choice:${choiceId}` reste l'identifiant du handle → les arêtes survivent. Changement de rendu, pas de modèle. |

---

## 4. Ce que ça change pour la maquette 2026

La maquette dit, textuellement : *« Le nœud dit trois choses — qui parle, ce qui est dit, et
ce que ça coûte structurellement (réponses, flags) »*
(`docs/design/refonte-ui-2026/etats-2a-2e.dc.html:251`). Le compteur `3 RÉPONSES · 2 flags`
est un choix délibéré de **densité** : le nœud résume, il ne déplie pas.

Afficher les réponses en toutes lettres **contredit ce principe**. Deux sorties possibles,
à trancher en story :

- **(a) Densité adaptative** — le nœud résume par défaut (maquette inchangée) et déplie
  réplique + réponses quand il est sélectionné ou au-delà d'un seuil de zoom. Conserve la
  lisibilité d'un graphe de 500 nœuds dézoomé ; ajoute un état.
- **(b) Déplié par défaut** — plus proche d'Articy et de la demande littérale, au prix de la
  densité du graphe et d'une révision assumée de la maquette.

Recommandation : **(a)**, parce que NFR-P1 (500+ nœuds < 1 s) et la lisibilité en vue
d'ensemble sont des contraintes dures, alors que « voir le texte entier » n'a de valeur que
sur le nœud qu'on travaille. Mais c'est un arbitrage produit, pas technique.

---

## Sources

- [articy:draft X Basics — Flow III](https://www.articy.com/en/adx_basics_flow3/)
- [articy:draft X — Feature list](https://www.articy.com/en/articydraft/feature-list/)
- [articy:draft First Steps L06 — Creating a dialogue](https://www.articy.com/en/articydraft-first-steps-tutorial-series-l06-creating-a-dialogue/)
- [Articy Help Center — Conditions & Instructions](https://www.articy.com/help/adx/Flow_Conditions_Instructions.html)
- [Best Narrative Design Tools for Game Devs (2026)](https://storyflow-editor.com/blog/best-narrative-design-tools-for-game-developers-2025/)
- [Articy:draft Alternative — StoryFlow Editor](https://storyflow-editor.com/articy-draft-alternative/)
- [Notion — Designing Synced Blocks](https://www.notion.com/blog/designing-synced-blocks)
- [UX Issues with Notion (Hacker News)](https://news.ycombinator.com/item?id=25521487)
- [GitLab Design System — Saving and feedback](https://design.gitlab.com/usability/saving-and-feedback)
- [Primer (GitHub) — Saving](https://primer.style/product/ui-patterns/saving/)
- [UI Patterns — Autosave](https://ui-patterns.com/patterns/autosave)
- [How to Properly Design Inline Edit Feature in Web Applications](https://webapphuddle.com/inline-edit-design/)
