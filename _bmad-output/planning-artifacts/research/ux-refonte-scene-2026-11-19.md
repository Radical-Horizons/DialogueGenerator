---
title: "Refonte Scène — éditeurs de dialogue, outils d'écriture et qualité de vie"
date: '2026-11-19'
type: ux-research
status: done
consumed_by: ['docs/design/refonte-scene/README.md', 'docs/architecture/refonte-scene-architecture.md', 'epics/epic-20.md']
---

# Ce qu'on retient des meilleurs outils, pour la refonte « Scène »

Deux recherches web menées le 2026-11-19, pages lues directement sauf mention. **[S]** = ce que dit la source,
**→** = déduction. Complète, sans la remplacer, la note du 2026-10-01 sur l'édition in-situ.

## 1. Éditeurs de dialogue et canvas

- **[S] articy:draft X** — Un Dialogue Fragment porte locuteur, *menu text*, *stage directions* et réplique ; on tape
  dans le nœud ; la logique vit sur les broches (condition à l'entrée, instruction à la sortie, broche orange quand
  elle porte du code) ; une propriété de template ne monte sur le nœud que si « Show in Flow » est coché ; le Property
  Inspector est séparé et optionnel. https://www.articy.com/help/adx/Flow_Editing.html ·
  https://www.articy.com/help/adx/Flow_ViewOptions.html · https://www.articy.com/en/adx_basics_flow2/
- **[S] Arcweave** — double-clic sur une carte = texte riche en place, Tab bascule titre/contenu, Échap sort ;
  auto-resize ; `@` pour mentionner composants et boards ; conditions dans un nœud Branch dédié.
  https://docs.arcweave.com/project-items/elements · https://docs.arcweave.com/project-tools/mentions
- **[S] Yarn Spinner (VS Code)** — le texte d'abord, le graphe pour ranger ; aperçu jouable avec variables ;
  Ctrl-clic sur un nom de nœud ouvre sa définition. https://yarnspinner.dev/docs/yarn-spinner-editor/
- **[S] Twine 2** — trois niveaux de zoom, plus de texte quand on zoome. https://twinery.org/reference/en/print.html
- **[S] tldraw** — un seul shape en édition ; pendant l'édition ni drag ni resize ; Échap ou clic extérieur sort ;
  shapes hors écran en `display:none` sauf la sélection. https://tldraw.dev/examples/editable-shape ·
  https://tldraw.dev/sdk-features/performance
- **[S] Heptabase** — sous 30 % de zoom, seuls les titres, agrandis à 15 % et 10 %.
  https://wiki.heptabase.com/newsletters/2024-08-02
- **[S] React Flow** — classes `nodrag`, `nowheel`, `nopan` ; exemple « Contextual Zoom ».
  https://reactflow.dev/learn/customization/utility-classes · https://reactflow.dev/examples/interaction/contextual-zoom
- **Pièges** : clic simple = éditions accidentelles si la zone n'est pas `nodrag` ; molette qui zoome au lieu de faire
  défiler ; titres illisibles au dézoom ; nœuds géants qui cassent la disposition (articy conseille de découper).

## 2. Écriture longue et lecture

- **[S] iA Writer** — Focus atténue tout sauf la phrase ou le paragraphe ; Typewriter garde la ligne au centre,
  réservé au premier jet ; largeur 64 / 72 / 80 caractères. https://ia.net/writer/support/editor/focus-mode
- **[S] Ulysses** — surlignage de la ligne courante ; chaque thème a sa version claire et sombre.
  https://help.ulysses.app/dive-into-editing/editor-customization-guide
- **[S] Final Draft** — SmartType alterne les deux interlocuteurs ; Alt Dialogue garde plusieurs versions d'une
  réplique avec un numéro. https://www.finaldraft.com/blog/give-your-characters-options-the-power-of-alternate-dialogue
- **[S] Highland 2** — « we will never change your actual text ».
  https://johnaugust.com/2018/why-highland-2-doesnt-automatically-add-contd
- **[S] Butterick** — 45 à 90 caractères par ligne ; interligne 120 à 145 %. https://practicaltypography.com/line-length.html

## 3. Lecture linéaire d'un récit à embranchements

- **[S] Inky** — l'aperçu rejoue les choix déjà faits après chaque modification. https://github.com/inkle/inky
- **[S] inklewriter** — rembobiner, « Read » depuis l'endroit courant. https://www.inklestudios.com/inklewriter/getting-started/
- **[S] Arcweave Play Mode** — « Play from here », débogueur de variables. https://docs.arcweave.com/project-tools/play-mode/overview
- → Aucun outil ne documente l'affichage des branches sœurs pendant une lecture linéaire : le **fil du chemin** de la
  vue Script est une proposition originale.

## 4. IA dans l'éditeur

- **[S] Cursor** — suggestion grisée, Tab accepte, Ctrl+→ mot par mot, Échap ou frappe continue rejette.
  https://cursor.com/docs/tab/overview
- **[S] Copilot** — Alt+] / Alt+[ entre variantes. https://docs.github.com/en/copilot/reference/keyboard-shortcuts
- **[S] Notion AI** — accepter, rejeter, réessayer. https://www.notion.com/help/notion-ai-faqs
- **[S] Sudowrite** — 1 à 6 variantes ; texte inséré coloré jusqu'à retouche.
  https://docs.sudowrite.com/using-sudowrite/1ow1qkGqof9rtcyGnrWUBS/write/pvxUvbQqYybfEosqx1sXjY
- **[S] iA Authorship** — texte d'IA atténué. https://ia.net/writer/how-to/track-authors-and-ai

## 5. Clavier, rapidité, mouvement, confort

- **[S] Superhuman** — < 100 ms par action, 50 ms visé ; raccourcis rappelés dans l'interface.
  https://blog.superhuman.com/superhuman-is-built-for-speed/
- **[S] Raycast** — Entrée = action principale, Ctrl+K = les autres, raccourci affiché à droite.
  https://manual.raycast.com/action-panel
- **[S] Linear** — « ? » ouvre la liste des raccourcis ; 3 variables de thème. https://linear.app/blog/how-we-redesigned-the-linear-ui
- **[S] NN/g, animation** — 100 ms retour simple, 200–300 ms fenêtre, 400 ms déjà lent ; ease-out ; sortie plus
  courte. https://www.nngroup.com/articles/animation-duration/
- **[S] NN/g, mode sombre** — le clair se lit mieux ; offrir les deux et suivre le système.
  https://www.nngroup.com/articles/dark-mode/
- **[S] WCAG** — 1.4.3 contraste 4,5:1 ; 1.4.8 ≤ 80 caractères, interligne ≥ 1,5 ; C39 `prefers-reduced-motion` ;
  2.5.8 cibles ≥ 24 px. https://www.w3.org/WAI/WCAG22/Understanding/visual-presentation.html

## 6. Retenu pour la refonte

Mode Focus coupé à la sélection · ligne fixe · mesure bornée · thème Papier · variantes `‹ 2/3 ›` · provenance
teintée · texte de l'auteur intouchable · Ctrl+→ mot par mot · refus sans friction · Réessayer · Tab = suite vide
suivante (vue Script) · rejouer d'ici / revenir d'un choix · CTRL+K + « ? » cherchable · < 100 ms · animations
100–240 ms · actions destructrices signalées.
