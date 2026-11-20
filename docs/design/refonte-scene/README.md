# Refonte « Scène » — handoff de design

**Statut : proposition du 2026-11-20, non validée.** Rien n'est implémenté. Si elle est validée, elle se réalise par
l'epic BMAD [`epic-20.md`](../../../_bmad-output/planning-artifacts/epics/epic-20.md) ; l'architecture associée est dans
[`docs/architecture/refonte-scene-architecture.md`](../../architecture/refonte-scene-architecture.md).

- **Canvas de design** (privé) : <https://claude.ai/artifact/VynbrAeNhQULRXhbnVnTDW>
- **Prototypes locaux** : ce dossier. Configuration `design-refonte-scene` de `.claude/launch.json`
  (`python -m http.server 8973 --directory docs/design/refonte-scene`), puis `http://localhost:8973/Main.dc.html`.
  `support.js` doit rester à côté des `.dc.html`.
- **Captures** : `captures/avant-*.png` (l'app au 2026-11-19, en mode invité), `captures/apres-*.png` (rendus).

> Les prototypes sont des **références de design en HTML**, pas du code à copier. On recrée les écrans dans le
> frontend existant (React 18, styles inline + tokens, Zustand, React Flow). Valeurs exactes : attributs `style`.

---

## 1. En une phrase

**Une scène, un texte, trois vues.** On n'ouvre plus « Générer », « Éditer » ou « Graphe » : on ouvre une scène. Elle
porte sa distribution et son contexte, se lit et s'écrit comme un scénario (SCRIPT), se structure dans un graphe dont
les cartes portent le texte (GRAPHE), et se joue (JOUER). L'IA est un geste dans le texte, la technique est à un geste,
le panneau de droite disparaît.

## 2. Pourquoi — ce que montre l'app aujourd'hui

Mesuré le 2026-11-19 sur le dialogue généré « Rencontre avec le forgeron itinérant » (19 répliques) :

| Constat | Preuve |
|---|---|
| Le graphe ne se lit pas : à la vue d'ensemble aucun texte n'est lisible ; zoomé à 200 %, la réplique s'arrête sur « carav… » et les réponses tiennent en « 4 RÉPONSES ». | `captures/avant-03`, `avant-04` |
| La lecture se fait ailleurs : dans le panneau de droite, une carte à la fois. | idem |
| « 67 NŒUDS » pour 19 répliques : les 48 nœuds de test s'ajoutent et chevauchent les cartes. | `avant-04`, JSON |
| 8 des 19 répliques ne sont **jamais atteintes** depuis l'ouverture, sans que rien ne le montre. | parcours du JSON |
| Trois sections pour un même objet ; le contexte GDD est **global**, d'où le bug du 2026-11-19 (une suite de Voknir générée avec le PNJ d'une autre scène, contourné par `resolveGraphGenerationDramatis`). | `avant-01`, `avant-02`, `CLAUDE.md` |
| Un même nœud s'édite à trois endroits via un formulaire tampon : `targetNode` écrasé, choix hérités, titre effacé. | `.claude/rules/graph_editor.md` |
| Trois routes sans lien visible ; la palette CTRL+K ouvre la liste au lieu du dialogue ; l'aide clavier annonce CTRL+E, mort, et des raccourcis du graphe faux. | inventaire du 2026-11-19 (correctif : PR à part) |
| **209 emplacements de suite** et **12 réponses vides**, invisibles tant qu'on ne parcourt pas le graphe nœud par nœud. | JSON (§ 6) |

## 3. Principes

1. **Un objet : la scène.** Tout ce qui est à l'écran appartient à la scène ouverte.
2. **Le texte d'abord.** Rien n'est tronqué au palier « écrire » au-delà d'une borne lisible ; un clic dans le texte y pose le curseur.
3. **La technique à un geste.** Puces mono, touche L pour la lentille technique, barre d'état. Jamais en travers de la lecture.
4. **L'IA est un geste, pas une page.** CTRL+↵ dans un emplacement, CTRL+K sur une sélection, lot depuis le fil. Coût estimé avant, engagé pendant, réel après, toujours au même endroit.
5. **Rien ne se perd.** Sauvegarde au fil de la saisie, versions consultables, annulation lisible, provenance du texte généré visible jusqu'à la retouche.
6. **Calme, mais soigné.** Le design system existant, plus un thème Papier, une mesure de lecture et des transitions de 100 à 240 ms.
7. **Clavier d'abord, raccourcis écrits à côté de l'action**, choisis pour ne pas heurter le navigateur sous Windows (§ 8).

## 4. Architecture de l'information

```
┌ En-tête 48 px : marque · fil d'Ariane · [ Rechercher, aller à, demander…  CTRL+K ] · compte
├ Classeur 252 px (repliable en rail)            ┌ Scène
│  scènes, état mono                             │  Fiche compacte (titre, PNJ, PJ, lieu, brief)
│  ─────────                                     │  Barre de vue : SCRIPT · GRAPHE · JOUER (même place dans les 3 vues)
│  Fiches du GDD · Profils d'auteur              │  Vue active
│  Usage et coûts · Réglages                     │
└ Barre d'état 28 px : ENREGISTRÉ · PROBLÈMES · CONTEXTE · TOKENS / RÉPLIQUE · MODÈLE ··· MOTS · LECTURE · ? RACCOURCIS
```

Le classeur et la fiche gardent le même état d'une vue à l'autre : changer de vue ne déplace rien sous le curseur.
Largeur du graphe à 1 440 px : **1 188 px** classeur ouvert, **1 384 px** classeur replié (contre ≈ 720 aujourd'hui).

## 5. Les écrans (boards de ce dossier)

| Board | Ce qu'il montre | Interactif |
|---|---|---|
| `Main` | **Script** : chemin suivi, sélecteur d'issue, fil, compteurs réels. Props `theme`, `mode`. | suivre, issue, A−/A+, Focus |
| `Fiche` | **Nouvelle scène** : fiche dépliée, mention `@` avec aperçu de fiche réelle du GDD, premier emplacement. | tons |
| `Generer` | **Générer dans le texte** : en direct, puis options `‹ 1/4 ›`, provenance, Garder / Réessayer / Variante / Rejeter. | états, options |
| `Lot` | **Remplir les suites en série** : portée (réponse, réplique, niveau, scène), coût total estimé, job en cours, interrompu, revue en série. | états, portée |
| `Palette` | **CTRL+K** : scènes, répliques, fiches, commandes. | filtre, ↑↓ |
| `Reecrire` | **Réécrire une sélection** : diff dans le texte, TAB / CTRL+→ / ÉCHAP. | oui |
| `Graphe` | **Graphe, palier écrire** : même enveloppe que Script, cartes 360 px, réplique bornée à 12 lignes, port par réponse, 4 issues colorées, liens hors champ par la gouttière. Props `lens`, `popover`. | sélection, lentille |
| `Technique` | **Lentille Technique** + éditeur de test ancré. | idem |
| `Paliers` | **Lire (≈ 60 %) et situer (≈ 30 %)** sur la vraie structure, répliques jamais atteintes encadrées. | — |
| `Carte` | **Anatomie d'une carte** en écriture (texte brut de la réplique entière, D4). | — |
| `Jouer` | **Jouer** : choix verrouillés expliqués, issue forçable, état de la partie, retour d'un choix. | partie |
| `Problemes` | **Santé** : popover de la barre d'état, marques en place, relecture (à la demande) en marge. | ÉCHAP |
| `Contexte` | **Ce que le modèle saura** : tokens par section, budget AUTO, modèle. | retirer |
| `Versions` | **Versions d'une réplique** : diff, restaurer sans rien perdre. | restaurer |
| `Etats` | **Les états qui comptent** : invité, erreur, budget atteint, conflit 409, chargement, classeur vide, deux PNJ. | — |
| `Bibliotheque` | **Accueil** : scènes, état, reprise. | filtres |
| `Fiches` | **Fiches du GDD** (333, comptées sur disque), « utilisée dans », synchro Notion. | filtre |
| `Reglages` | **Réglages › Apparence** : thème, taille, mesure, densité, mouvement, sans Enregistrer. | oui |
| `Papier`, `Focus` | Script en thème Papier, en mode Focus. | via Main |
| `Gestes` | **Petits gestes** : enregistrement, annulation, variantes, provenance, raccourcis, états vides, TAB, taille, mouvement. | oui |
| `Mobile` | **Téléphone** : Script et Jouer. | — |
| `Avant` | Même scène, avant et après. | — |

Chaque board dit en pied ce qui est un exemple (coûts, heures, textes générés fictifs).

## 6. Glossaire — états, comptes, monnaie

| Libellé | Sens |
|---|---|
| `SUITE À ÉCRIRE` | Réponse sans réplique suivante. |
| `4 ISSUES · À ÉCRIRE` | Réponse à test dont aucune des 4 issues n'a de suite. |
| `4 ISSUES · 2 ÉCRITES` | Réponse à test dont 2 issues sur 4 ont leur suite. |
| `▲ RÉPONSE VIDE` | Réponse sans texte (avertissement calculé). |
| `JAMAIS ATTEINTE` | Réplique sans chemin depuis l'ouverture (avertissement calculé). |
| `À VALIDER` · `VALIDÉ` · `EN ÉCRITURE` | État éditeur de la réplique (`status`), ou carte où l'on tape. |

- **Emplacements de suite (209)** : une issue de test sans suite compte 1, une réponse sans suite compte 1 ; 25 des 209
  sont sous des réponses vides, 79 sous les 8 répliques jamais atteintes. Restent **105** emplacements utiles (réponse
  écrite, réplique atteinte) : 4 sous l'ouverture, 84 au niveau 1, 17 au niveau 2 — ce que propose le tiroir Lot
  (`Lot`) avec ses deux filtres par défaut.
- **Mots (3 887)** : suites de lettres ou chiffres (`\w+`) dans les répliques et les réponses ; lecture = mots / 200
  par minute.
- **Monnaie** : une estimation est affichée en **euros**, comme la renvoie `estimate-cost` (`estimated_cost_eur`) ; une
  dépense engagée ou réelle en **dollars**, comme le journal d'usage. La règle vient du design system (« dans la devise
  que le champ contient vraiment ») ; l'unifier demanderait un taux de change (§ 15, question 5).

## 7. Composants

| Composant | Rôle | Remplace / réutilise |
|---|---|---|
| **AppShell** | En-tête, classeur, scène, barre d'état. | `Header`, `Dashboard` |
| **Classeur** | Scènes par collection, état mono, liens annexes ; rail. | `UnityDialogueList`, `DialogueCombobox` |
| **Fiche de scène** | Titre, distribution, brief avec `@`, tons, profil ; compacte en une ligne. | `GenerationPanel`, `SceneSelectionWidget`, `ContextSelector` |
| **Bloc de script** | Locuteur, réplique serif, didascalies, réponses avec puces et état. | `UnityDialogueEditor`, `GenerationOptionsComparison` |
| **Carte de réplique** | Même contenu en 360 px, réplique bornée (12 lignes, défilement interne une fois sélectionnée), réponses jamais coupées, ports par réponse et par issue. | `DialogueNode` ; `TestNode` et `EndNode` deviennent des sorties |
| **Champ d'écriture** | Le `<textarea>` d'Epic 18 (D4) : à l'entrée dans une réplique, **toute la réplique** passe en texte brut avec ses `*…*` ; à la sortie elle redevient mise en forme. | Epic 18.5–18.7 |
| **Emplacement à écrire** | Au bout de toute réponse sans suite : taper ou Générer CTRL+↵ ; ligne « TRACE ▸ » dépliable pendant l'écriture. | `AIGenerationPanel`, `GenerationProgressModal`, trace de raisonnement |
| **Tiroir Lot** | Portée, coût total, progression, reprise, revue en série. | jobs FR87/FR88, `BatchGenerateFromNodesModal` |
| **Puce mécanique** | Trait, test, respect, influence, fin ; clic (cible 24 px) → popover d'édition ancré. | `ChoiceEditor`, `AttributeSkillTestEditor`, `ConditionEditor`, `EffectEditor` |
| **Barre d'état** | Enregistrement, problèmes, contexte, tokens, modèle, mots, lot en cours. | `SaveStatusIndicator`, `GraphHealthBadge`, `EstimationBadge` |
| **Tiroir temporaire** | 380 px, ÉCHAP ferme : Contexte, Versions, Lot. | colonne droite, `ContextDetail` |
| **Palette** | Recherche + commandes avec raccourcis. | `CommandPalette` (étendue) |
| **Note de marge** | Relecture à la demande (qualité, slop, langue). | `GraphQualityLlmPanel`, `GraphAiSlopPanel` |

## 8. Interactions et raccourcis

| Geste | Effet | Note |
|---|---|---|
| Clic dans le texte | Curseur ; toute la réplique passe en texte brut ; sauvegarde au fil de la saisie | Epic 18 D1, D4 |
| Clic sur l'en-tête d'une carte | Sélection ; glisser = déplacer | zones `nodrag`/`nowheel` sur le texte |
| ÉCHAP | Sort du texte / ferme le popover ou tiroir le plus proche | `stopPropagation` (Epic 18 D2) |
| CTRL+↵ | Générer la suite dans l'emplacement actif | existe en page Générer |
| CTRL+K | Palette ; sur une sélection : consigne de réécriture | surchargeable par la page (usage courant : Linear, Slack) |
| ALT+1 / 2 / 3 | Vue Script / Graphe / Jouer | **pas CTRL+1–3** : CTRL+1–9 changent d'onglet dans les navigateurs |
| CTRL+\ | Mode Focus | existe : `frontend/src/components/layout/Dashboard.tsx:1085` (mode écriture) |
| L | Lentille Technique, hors champ de texte | **pas ALT** : sous Windows, ALT relâché seul donne la main aux menus du navigateur (barre de menus de Firefox, menu de Chrome et d'Edge) |
| TAB (vue Script) | Suite vide suivante | en Graphe, TAB reste la navigation entre nœuds (Epic 14.1) |
| CTRL+Z / CTRL+Y | Annuler / rétablir, frappes regroupées | Epic 18.4 |
| CTRL+J · CTRL+, | Aller à une réplique · Réglages | existent |
| ALT+N | Nouvelle scène | **pas CTRL+N** (nouvelle fenêtre, non interceptable) |
| ? | Aide clavier cherchable, générée depuis la table des raccourcis | corrige l'aide actuelle |
| Jouer : 1–4, RETOUR ARRIÈRE, R | Choisir, revenir d'un choix, rejouer | existe dans l'aperçu de scénario |
| Revue en série : J / K, G, R | Suivante / précédente, garder, rejeter | — |

⚠ Chaque raccourci est à vérifier dans Chrome, Edge et Firefox en onglet, et en PWA installée (critère de la story 20.14).

## 9. Qualité de vie

Sources : [`research/ux-refonte-scene-2026-11-19.md`](../../../_bmad-output/planning-artifacts/research/ux-refonte-scene-2026-11-19.md).

- **Thème Papier** en plus de Nuit, et « suivre le système » (NN/g).
- **Mesure bornée** (640 px ≈ 75 caractères ; 64 / 72 / 80) et **taille des répliques** 16–24 px ; la **densité** agit aussi sur les métadonnées.
- **Mode Focus** coupé dès qu'on sélectionne (iA Writer).
- **Fil du chemin** et compteurs ; **TAB → suite vide suivante** (Cursor, Copilot).
- **Remplir en série** puis **revoir en série** (J/K) : l'arbre exponentiel ne se remplit pas une suite à la fois.
- **Variantes `‹ 2/3 ›`** sans perdre l'original (Final Draft) ; **provenance** teintée jusqu'à la retouche (iA, Sudowrite).
- **Accepter mot à mot**, **refuser sans friction**, **Réessayer** (Cursor, Notion AI).
- **Rejouer d'ici / revenir d'un choix** (inklewriter, Arcweave, Inky).
- **Versions** par réplique ; **toast d'annulation** après toute suppression ; **états vides qui parlent**.
- **Mouvement** : 100 / 160 / 240 ms, sortie plus courte, rien sous `prefers-reduced-motion` (NN/g, WCAG C39).

## 10. Tokens

**Nuit** : inchangé (`frontend/src/theme/redesignTokens.ts`). **Papier** (nouveau), contrastes calculés sur `#f5f2ea` :

| Rôle | Valeur | Contraste |
|---|---|---|
| fond · champ/carte · relief | `#f5f2ea` · `#fbfaf6` · `#ebe6da` | — |
| texte fort · corps · réplique | `#1b1916` · `#2c2924` · `#1f1c18` | 15,7 · 13,0 · 15,2:1 |
| secondaire · atténué · étiquette | `#5c574d` · `#625d53` · `#6b665b` | 6,4 · 5,9 · 5,1:1 |
| accent / bouton plein | `#2f5bd3` (texte blanc 5,9:1) | 5,3:1 |
| validé · à valider · erreur | `#1d7a44` · `#9a5b06` · `#b83232` | 4,8 · 4,9 · 5,3:1 |
| contour de champ | `#8a8477` | 3,3:1 |

⚠ Sur le fond relief `#ebe6da`, validé et à valider tombent à 4,3:1 : n'y poser que du texte fort, corps ou secondaire.

**Mode Focus** : les blocs hors focus passent à l'opacité 0,5. La réplique atténuée garde 4,7:1 et le corps 4,2:1.
Didascalies et puces atténuées descendent à 2,6:1, **volontairement** : elles ne se lisent pas pendant le premier
jet, et un clic ou une sélection rend la pleine opacité.

**Locuteur** : un point de couleur par personnage (Grish : `#5fb8ac` Nuit, `#1f7a72` Papier), jamais sur le texte.

## 11. Accessibilité

- Texte ≥ 4,5:1 dans les deux thèmes, sauf l'atténuation du Focus décrite au § 10.
- **Plancher typographique** : aucun texte sous 10 px ; les puces cliquables en 10,5 px.
- **Cibles** : ≥ 24 px partout (WCAG 2.5.8), ≥ 44 px sous 1024 px et dans les barres d'outils ; les puces cliquables du graphe font 24 px.
- Tout au clavier ; une carte du graphe est un widget composite (Epic 18 D5) ; palette et tiroirs piègent le focus puis le rendent.
- Un état n'est jamais porté par la couleur seule (libellé mono à côté).

## 12. Responsive

| Largeur | Comportement |
|---|---|
| ≥ 1280 px | Classeur ouvert, fil visible. |
| 1024–1280 px | Classeur en rail, fil replié dans la barre de vue. |
| 768–1024 px | Classeur en tiroir, Script pleine largeur, graphe éditable au toucher (Epic 18.10). |
| < 768 px | Script et Jouer (`Mobile`) ; graphe en lecture ; barre d'état réduite. |

## 13. Rien ne se perd : où va chaque fonction actuelle

| Aujourd'hui | Demain |
|---|---|
| Page Générer (scène, brief, onglets Brief/Flags/Templates, réglages LLM) | Fiche de scène ; flags dans la fiche (« fiche ▾ › Flags ») ; profil d'auteur dans la fiche ; modèle et raisonnement dans la barre d'état et le tiroir Contexte |
| « Sauvegarder ce brief comme template » | « fiche ▾ › Enregistrer comme profil d'auteur » |
| Colonne Contexte GDD | Fiche (PNJ, PJ, `@`), tiroir Contexte, écran Fiches du GDD ; règles de contexte dans Réglages › Notion et GDD |
| Colonne droite (Prompt, Dialogue, Détails, Trace) | Tiroir Contexte (« voir le prompt »), emplacement à écrire (en direct + « TRACE ▸ »), aperçu de fiche, Versions |
| Options ×N, comparaison Liste / Côte à côte | `‹ 1/4 ›` dans l'emplacement + « comparer les 4 côte à côte » (vue 2b conservée) |
| Section Éditer (liste, métadonnées, partage, permissions, suppression) | Classeur ; Script ; « fiche ▾ » (métadonnées, partage, permissions, supprimer) |
| Titre et locuteur d'un nœud | En-tête du bloc et de la carte, éditables (Epic 18.7) |
| Graphe : inspecteur 5 onglets, panneaux flottants | Nœud → la carte ; Santé → barre d'état ; Qualité, Slop → relecture en marge ; Coût → barre d'état ; simulation, règles de contexte, systèmes de jeu : fenêtres ponctuelles inchangées |
| Nœud de test, nœud Fin | Sorties de la réponse (4 issues), puce ■ FIN |
| Sélection multiple, opérations par lot, génération de lot | Lasso du graphe + barre de lot ; tiroir Lot (`Lot`) |
| Accepter / Rejeter / Régénérer, historique, Voir le prompt | Pied de carte « à valider », revue en série, Versions, Contexte |
| Tags de nœud, badge GDD↑, COND. | Puces ; lentille Technique |
| Export PNG/SVG, export Unity, filtres, CTRL+J, carte | Menu Actions ▾ et palette ; inchangés |
| Aperçu de scénario (P) | Vue Jouer |
| `/usage`, Profils d'auteur | Écrans existants, dans l'enveloppe Scène ; **non redessinés dans cette proposition** |
| Options, Admin | Réglages (navigation gauche) ; Admin inchangé |
| Mode écriture (CTRL+\) | Mode Focus (même raccourci) |

## 14. Articulation avec l'existant

- **Maquette 2026** : la charte reste ; 1c, 2a, 2b, 2e sont absorbés (page Générer → fiche + Script ; 2a/2b →
  emplacement ; 2e → Graphe).
- **Epic 18 (édition in-situ, backlog, ~16 sessions)** : **fondation, avec trois écarts nommés**.
  - Reprises : D1 (clic simple), D2 (ÉCHAP), **D4 (`<textarea>`) intact** — la réplique entière passe en texte brut à
    l'entrée, aucun éditeur de blocs —, D5 (widget composite), 18.4 (annulation transactionnelle).
  - Écart 1 : **largeur 360 px** au lieu de 280 (mesuré : la réplique d'ouverture de Grish en Instrument Serif 16 px
    fait 19 lignes à 280 px, 14 à 360 px ; le nœud actuel tient en 14 lignes parce qu'il descend à 12,5 px).
  - Écart 2 : **D3 rouverte** — texte lisible hors sélection via les paliers (`Paliers`), conditionné à la preuve 20.2.
  - Écart 3 : **pas de hauteur maximale de carte** (Epic 18 : 440 px et défilement interne). Seule la réplique est
    bornée (12 lignes, défilement interne une fois sélectionnée) ; les réponses ne sont jamais coupées, parce que
    chacune porte le port de son lien. Une carte peut donc dépasser l'écran à 100 % : la sélectionner la fait défiler
    en vue, et le palier « lire » la montre entière.
- **Epic 19 (squelette)** : **remplacée**. Elle demandait un retour d'usage d'Epic 18 et la réversibilité. Réponse :
  le panneau de droite reste disponible **derrière un drapeau** pendant toute la tranche 2 ; il n'est retiré qu'en
  tranche 3, après un mois d'usage du Script et du Graphe sans recours au panneau (mesuré par un compteur d'ouverture).

## 15. Décisions à prendre (avec recommandation)

1. **Cartes de 360 px** — recommandé (mesure ci-dessus).
2. **Graphe de gauche à droite** — recommandé : le lien part de la phrase, plus d'étiquette de lien. Coût : une
   redisposition par dialogue, positions précédentes conservées.
3. **Paliers de zoom** — calculés à la fin du zoom, une valeur dans le store, carte en écriture exemptée, hauteur par
   palier connue de la disposition. **Plan B si la preuve 20.2 échoue** : cartes de 280 px et dépliage à la sélection
   (Epic 18 D3 inchangée), le texte complet restant lisible dans la vue Script.
4. **Tests en sorties** — recommandé (le nœud de test est déjà une vue dérivée, `testNodeSync.ts`).
5. **Monnaie** — garder la règle actuelle (estimation en €, dépense en $) ou tout afficher en euros avec un taux fixé
   dans les réglages.
6. **Thème Papier** — livré en option, Nuit par défaut.
