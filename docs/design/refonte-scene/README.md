# Refonte « Scène » — handoff de design

**Statut : proposition du 2026-11-20, non validée.** Rien n'est implémenté. Si elle est validée, elle se réalise par une
epic BMAD (proposition : [`epic-20.md`](../../../_bmad-output/planning-artifacts/epics/epic-20.md)) et l'architecture
associée est dans [`docs/architecture/refonte-scene-architecture.md`](../../architecture/refonte-scene-architecture.md).

- **Canvas de design** (privé) : <https://claude.ai/artifact/VynbrAeNhQULRXhbnVnTDW>
- **Prototypes locaux** : ce dossier. Servir avec la configuration `design-refonte-scene` de `.claude/launch.json`
  (`python -m http.server 8973 --directory docs/design/refonte-scene`), puis ouvrir
  `http://localhost:8973/Main.dc.html`. `support.js` doit rester à côté des `.dc.html`.
- **Captures** : `captures/avant-*.png` (l'app au 2026-11-19, mode invité) et `captures/apres-*.png` (rendus des
  prototypes).

> Les prototypes sont des **références de design en HTML**, pas du code à copier. On recrée les écrans dans le
> frontend existant (React 18, styles inline + tokens, Zustand, React Flow). Valeurs exactes : dans les attributs
> `style` des `.dc.html`.

---

## 1. En une phrase

**Une scène, un texte, trois vues.** On n'ouvre plus « Générer », « Éditer » ou « Graphe » : on ouvre une scène. Elle
porte sa distribution et son contexte, se lit et s'écrit comme un scénario (SCRIPT), se structure dans un graphe dont
les cartes portent le texte entier (GRAPHE), et se joue (JOUER). L'IA est un geste dans le texte, la technique est à
un geste, et le panneau de droite disparaît.

## 2. Pourquoi — ce que montre l'app aujourd'hui

Mesuré sur l'app réelle le 2026-11-19 (dialogue généré « Rencontre avec le forgeron itinérant », 19 répliques) :

| Constat | Preuve |
|---|---|
| Le graphe ne se lit pas : à la vue d'ensemble aucun texte n'est lisible ; zoomé à 200 %, la réplique s'arrête sur « carav… » et les réponses tiennent en « 4 RÉPONSES ». | `captures/avant-03-graphe-ensemble.png`, `captures/avant-04-graphe-zoom.png` |
| La lecture se fait ailleurs : dans le panneau de droite, une carte à la fois, pas celle qu'on regarde forcément. | idem |
| Le graphe compte « 67 NŒUDS » pour 19 répliques : les nœuds de test et les emplacements vides triplent le décompte et chevauchent les cartes. | `avant-04` |
| Trois sections pour un même objet : Générer (3 colonnes), Éditer (formulaire), Graphe (canvas + inspecteur). Le contexte GDD est une colonne **globale**, pas une propriété de la scène — d'où le bug du 2026-11-19 (Voknir prolongé avec le mauvais PNJ, contourné par `resolveGraphGenerationDramatis`). | `avant-01`, `avant-02`, `CLAUDE.md` |
| Un même nœud s'édite à au moins trois endroits, via un formulaire tampon : origine des bugs `targetNode` écrasé, choix hérités, titre effacé. | `.claude/rules/graph_editor.md` |
| Trois routes n'ont aucun lien visible (`/unity-dialogues`, `/usage`, `/graph-editor`) ; la palette CTRL+K ouvre la liste au lieu du dialogue choisi ; l'aide clavier annonce CTRL+E qui ne fait rien. | inventaire du 2026-11-19 |
| Ce dialogue a **209 suites à écrire** et **12 réponses vides**, invisibles tant qu'on ne parcourt pas le graphe nœud par nœud. | calcul sur le JSON |

## 3. Principes

1. **Un objet : la scène.** Tout ce qui est à l'écran appartient à la scène ouverte : distribution, contexte, texte,
   mécanique, coût, problèmes.
2. **Le texte d'abord, partout.** Rien n'est tronqué en vue d'écriture. Un clic dans le texte y pose le curseur.
3. **La technique à un geste.** Puces mono sur chaque réponse, ALT pour tout voir, barre d'état pour l'état global.
   Jamais en travers de la lecture.
4. **L'IA est un geste, pas une page.** CTRL+↵ dans un emplacement à écrire, CTRL+K sur une sélection. Coût estimé
   avant, engagé pendant, réel après — toujours au même endroit, en mono.
5. **Rien ne se perd.** Sauvegarde au fil de la saisie, versions consultables, annulation lisible, provenance du texte
   généré visible jusqu'à la première retouche.
6. **Calme, mais soigné.** Le design system existant (fond unique, filets, un seul bleu, serif pour les répliques,
   mono pour les chiffres) ; s'y ajoutent un thème clair « Papier », une mesure de lecture bornée et des transitions
   de 100 à 240 ms.
7. **Clavier d'abord, raccourcis écrits à côté de l'action** — en CTRL (Windows), jamais ⌘.

## 4. Architecture de l'information

```
┌ En-tête 48 px : marque · fil d'Ariane · [ Rechercher, aller à, demander…  CTRL+K ] · compte
├ Classeur 252 px (repliable en rail 56 px)      ┌ Scène
│  scènes (collections, état)                    │  Fiche (titre, PNJ, PJ, lieu, brief, ton, profil)
│  ─────────                                     │  Barre de vue : SCRIPT · GRAPHE · JOUER   (A− A+, Focus, ALT)
│  Fiches du GDD · Profils d'auteur              │  Vue active
│  Usage et coûts · Réglages                     │
└ Barre d'état 28 px : ENREGISTRÉ · PROBLÈMES · CONTEXTE · TOKENS · MODÈLE ··· MOTS · LECTURE · ? RACCOURCIS
```

- **Disparaissent** : les sections Générer / Éditer / Graphe, la colonne Contexte GDD permanente, la colonne de droite
  (Prompt / Dialogue / Détails), l'inspecteur du graphe (Nœud, Santé, Qualité, Slop, Coût), les panneaux flottants du
  graphe, la modale de génération, les routes sans lien.
- **Apparaissent** : la fiche de scène, la vue Script, la barre d'état, les tiroirs temporaires (Contexte, Versions),
  les popovers ancrés (puces, problèmes), l'emplacement « à écrire », la palette complète, le thème Papier, le mode
  Focus.

## 5. Les écrans (boards de ce dossier)

| Board | Taille | Ce qu'il montre | Interactif |
|---|---|---|---|
| `Main.dc.html` | 1440×900 | **Script** : fiche compacte, chemin suivi (Ouverture → réponse 01 → Réussite → suite à écrire), sélecteur d'issue de test, fil du chemin et statistiques réelles, barre d'état. Props : `theme` (nuit/papier), `mode` (normal/focus). | suivre une réponse, changer d'issue, A−/A+, Focus |
| `Fiche.dc.html` | 1440×900 | **Nouvelle scène** : fiche dépliée, mention `@` avec aperçu de fiche, premier emplacement à écrire. Remplace la page Générer. | — |
| `Generer.dc.html` | 1440×900 | **Générer dans le texte** : écriture en direct puis options `‹ 1/4 ›`, teinte de provenance, Garder / Réessayer / Variante / Rejeter. | bascule d'état, options |
| `Palette.dc.html` | 1440×900 | **CTRL+K** : scènes, répliques, fiches, commandes avec raccourcis. | navigation |
| `Reecrire.dc.html` | 1440×900 | **Réécrire une sélection** : consigne ancrée, proposition en diff dans le texte, TAB / ÉCHAP / CTRL+→. | — |
| `Graphe.dc.html` | 1440×900 | **Graphe** : cartes à texte complet, flux gauche → droite, port au bout de chaque réponse, 4 issues de test en sorties colorées, suites vides en pointillé, suite en cours d'écriture, carte. Prop `lens`, `popover`. | sélection, lentille |
| `Technique.dc.html` | 1440×900 | **Lentille Technique** (ALT) + éditeur de test ancré sur la puce. | idem |
| `Jouer.dc.html` | 1440×900 | **Jouer** : lecture comme en jeu, choix verrouillés expliqués, résolution de test forçable, état de la partie, retour d'un choix. | partie jouable |
| `Problemes.dc.html` | 1440×900 | **Santé** : popover « 3 ERREURS » de la barre d'état, marques en place, note de relecture en marge. | — |
| `Contexte.dc.html` | 1440×900 | **Ce que le modèle saura** : tiroir temporaire, tokens par section, budget AUTO, modèle. | — |
| `Versions.dc.html` | 1440×900 | **Versions d'une réplique** : historique, diff, restaurer. | — |
| `Bibliotheque.dc.html` | 1440×900 | **Accueil** : scènes en rangées, état, reprise. | — |
| `Fiches.dc.html` | 1440×900 | **Fiches du GDD** : catégories, lecture, « utilisée dans », état de synchro Notion. | — |
| `Reglages.dc.html` | 1440×900 | **Réglages › Apparence** : thème, taille, mesure, densité, mouvement — sans bouton Enregistrer. | thème, taille |
| `Papier.dc.html` | 1440×900 | Script en **thème Papier**. | via Main |
| `Focus.dc.html` | 1440×900 | Script en **mode Focus** : seul le bloc en cours reste plein. | via Main |
| `Gestes.dc.html` | 1440×900 | **Petits gestes** : enregistrement, annulation, variantes, provenance, raccourcis, états vides, TAB, taille, mouvement. | — |
| `Mobile.dc.html` | 900×900 | **Téléphone** : Script et Jouer en 390×844. | — |
| `Carte.dc.html` | 1440×860 | **Anatomie d'une carte** et ses états d'édition. | — |

Données : texte réel du dialogue généré « Rencontre avec le forgeron itinérant » (PNJ Grish T'vok, PJ Uresaïr) et
chiffres réels de cette scène (19 répliques, 3 887 mots, 209 suites à écrire, 12 réponses vides, 3 erreurs). Chaque
board dit en pied ce qui est un exemple (coûts, horodatages, textes générés fictifs).

## 6. Composants

| Composant | Rôle | Remplace / réutilise |
|---|---|---|
| **AppShell** | En-tête 48 px, classeur, scène, barre d'état 28 px. | `Header`, `Dashboard` (3 colonnes) |
| **Classeur** | Scènes par collection, état mono, liens annexes ; rail 56 px. | `UnityDialogueList`, `DialogueCombobox` |
| **Fiche de scène** | Titre serif, distribution en puces, brief en prose avec `@`, tons, profil. Compacte en une ligne une fois la scène commencée. | `GenerationPanel` (scène, brief, onglets), `SceneSelectionWidget`, `ContextSelector` |
| **Bloc de script** | Locuteur mono, réplique serif, didascalies en italique, liste de réponses avec puces et méta. | `UnityDialogueEditor`, `GenerationOptionsComparison` |
| **Carte de réplique** (graphe) | Même contenu que le bloc, en 360 px ; port d'entrée, port par réponse, sorties de test. | `DialogueNode`, `TestNode`, `EndNode` (test et fin deviennent des sorties) |
| **Emplacement à écrire** | Cadre pointillé au bout d'une réponse sans suite : taper ou Générer CTRL+↵, estimation mono. | `AIGenerationPanel`, `GenerationProgressModal`, bouton « Générer la suite » |
| **Puce mécanique** | Trait requis, test, respect, influence, fin ; clic → popover d'édition ancré. | `ChoiceEditor`, `AttributeSkillTestEditor`, `ConditionEditor`, `EffectEditor` (contenu réutilisé dans le popover) |
| **Sélecteur d'issue** | É. CRIT · ÉCHEC · RÉUSSITE · R. CRIT, pour suivre une issue en Script ou forcer en Jouer. | — |
| **Barre d'état** | Enregistrement, problèmes, contexte, tokens, modèle, mots, aide. Chaque item ouvre son popover. | `SaveStatusIndicator`, `GraphHealthBadge`, `TokenBudgetBar`, `EstimationBadge` |
| **Tiroir temporaire** | 380 px à droite, au-dessus de la scène, ÉCHAP ferme : Contexte, Versions. | colonne droite, `ContextDetail`, historique de régénération |
| **Palette** | Recherche floue + commandes avec raccourcis ; CTRL+K sur sélection = réécrire. | `CommandPalette` (étendue) |
| **Note de marge** | Relecture (qualité, slop, lore) ancrée sur la phrase. | `GraphQualityLlmPanel`, `GraphAiSlopPanel`, avertissements lore |

## 7. Interactions et raccourcis

| Geste | Effet | Note |
|---|---|---|
| Clic dans le texte | Curseur à cet endroit, sauvegarde au fil de la saisie | Epic 18 D1 (premier clic sur une carte non sélectionnée : sélection + curseur en fin) |
| Clic sur l'en-tête d'une carte | Sélection, glisser = déplacer | zones `nodrag` sur le texte |
| ÉCHAP | Sort du texte / ferme le popover ou tiroir le plus proche | `stopPropagation` (Epic 18 D2) |
| CTRL+↵ | Générer la suite dans l'emplacement actif | existe déjà en page Générer |
| CTRL+K | Palette ; sur une sélection : consigne de réécriture | palette étendue |
| CTRL+1 / 2 / 3 | Vue Script / Graphe / Jouer | réaffecte les CTRL+1–4 actuels (routes supprimées) |
| CTRL+\ | Mode Focus | reprend le raccourci du mode écriture actuel |
| ALT (maintenu) | Lentille Technique tant que la touche est tenue ; bouton pour la fixer | — |
| TAB (vue Script) | Suite vide suivante | en vue Graphe, TAB reste la navigation entre nœuds (Epic 14.1) |
| CTRL+Z / CTRL+Y | Annuler / rétablir, frappes regroupées | Epic 18.4 |
| CTRL+J | Aller à une réplique | existe |
| CTRL+, | Réglages | existe |
| ? | Aide clavier cherchable, générée depuis la table des raccourcis | corrige l'aide inexacte actuelle |
| Jouer : 1–4, RETOUR ARRIÈRE, R | Choisir, revenir d'un choix, rejouer | existe dans l'aperçu de scénario |

## 8. Qualité de vie

Chaque geste ci-dessous vient d'un outil d'écriture reconnu (recherche du 2026-11-19, sources dans l'architecture) :

- **Thème Papier** (clair chaud) en plus de Nuit, et « suivre le système » — NN/g : le clair se lit mieux, le sombre doit rester offert.
- **Mesure bornée** de la colonne de lecture (640 px ≈ 75 caractères ; réglable 64 / 72 / 80) — Butterick, WCAG 1.4.8.
- **Taille des répliques** réglable (16–24 px), sans changer le reste de l'interface.
- **Mode Focus** : tout s'atténue sauf le bloc en cours, l'emplacement reste centré ; coupé dès qu'on sélectionne — iA Writer.
- **Fil du chemin** : où l'on est dans l'arbre, combien de suites restent à écrire, temps de lecture.
- **TAB → suite vide suivante** — Cursor / Copilot.
- **Variantes `‹ 2/3 ›`** d'une réplique sans perdre l'original — Final Draft « Alt Dialogue ».
- **Provenance** : le texte généré reste légèrement teinté jusqu'à la première retouche — iA Authorship, Sudowrite.
- **Accepter mot à mot** (CTRL+→), refuser sans friction (ÉCHAP ou continuer à taper), Réessayer à côté — Cursor, Notion AI.
- **Rejouer d'ici / revenir d'un choix** en vue Jouer — inklewriter, Arcweave, Inky.
- **Versions consultables** et restaurables par réplique.
- **Toast d'annulation** après toute suppression (« Réponse supprimée · Annuler CTRL+Z »).
- **États vides qui parlent** (une phrase qui dit ce qui viendra).
- **Mouvement** : 100 ms retour simple, 160 ms colonnes et rails, 240 ms tiroirs ; sortie plus courte que l'entrée ; rien sous `prefers-reduced-motion` — NN/g, WCAG C39.
- **Moins de 100 ms** pour toute action locale ; préchargement de la scène suivante du classeur — Superhuman.

## 9. Tokens

**Nuit** : inchangé (design system DialogueGenerator, `frontend/src/theme/redesignTokens.ts`).

**Papier** (nouveau), contrastes calculés sur fond `#f5f2ea` :

| Rôle | Valeur | Contraste |
|---|---|---|
| fond | `#f5f2ea` | — |
| champ / carte | `#fbfaf6` | — |
| relief (menus, en-têtes de carte) | `#ebe6da` | — |
| texte fort | `#1b1916` | 15,7:1 |
| corps | `#2c2924` | 13,0:1 |
| réplique | `#1f1c18` | 15,2:1 |
| secondaire | `#5c574d` | 6,4:1 |
| atténué | `#625d53` | 5,9:1 |
| étiquette | `#6b665b` | 5,1:1 |
| accent / bouton plein | `#2f5bd3` (texte blanc 5,9:1) | 5,3:1 |
| validé · à valider · erreur | `#1d7a44` · `#9a5b06` · `#b83232` | 4,8 · 4,9 · 5,3:1 |
| contour de champ | `#8a8477` | 3,3:1 |

⚠ Sur le fond « relief » `#ebe6da`, validé et à valider passent sous 4,5:1 (4,3) : n'y poser que du texte fort,
corps ou secondaire.

**Locuteur** : un point de couleur par personnage (Grish : `#5fb8ac` en Nuit, `#1f7a72` en Papier), jamais sur le
texte lui-même.

## 10. Accessibilité

- Contrastes ≥ 4,5:1 pour tout texte dans les deux thèmes (tableau ci-dessus ; Nuit : design system).
- Tout est atteignable au clavier ; une carte du graphe est un widget composite (Epic 18 D5) ; la palette et les
  tiroirs piègent le focus et le rendent à leur déclencheur.
- Cibles ≥ 44 px sous 1024 px et dans les barres d'outils ; ≥ 24 px ailleurs (WCAG 2.5.8).
- Un état n'est jamais porté par la couleur seule : libellé mono à côté (VALIDÉ, ▲ VIDE, É. CRIT…).
- `prefers-reduced-motion` : aucune transition ; curseur de génération fixe.

## 11. Responsive

| Largeur | Comportement |
|---|---|
| ≥ 1280 px | Classeur ouvert, fil du chemin visible. |
| 1024–1280 px | Classeur en rail, fil du chemin replié dans la barre de vue. |
| 768–1024 px | Classeur en tiroir, Script en pleine largeur, graphe consultable et éditable au toucher (Epic 18.10). |
| < 768 px | Script et Jouer (board `Mobile`) ; graphe en lecture ; barre d'état réduite à enregistrement + problèmes. |

## 12. Rien ne se perd : où va chaque fonction actuelle

| Aujourd'hui | Demain |
|---|---|
| Page Générer (scène, brief, onglets Brief/Flags/Templates, réglages LLM) | Fiche de scène ; flags dans la fiche ; profil d'auteur dans la fiche ; modèle et raisonnement dans la barre d'état et le tiroir Contexte |
| Colonne Contexte GDD (onglets, recherche, budget, règles, suggestions, sélections) | Fiche (PNJ, PJ, `@`), tiroir Contexte (budget AUTO, ajout, retrait), écran Fiches du GDD ; règles de contexte dans Réglages › Notion et GDD |
| Colonne droite (Prompt estimé, Dialogue généré, Détails, Trace) | Tiroir Contexte (« voir le prompt complet »), emplacement à écrire (génération en direct), aperçu de fiche, versions |
| Options ×N, comparaison Liste / Côte à côte | Options `‹ 1/4 ›` dans l'emplacement + « comparer les 4 côte à côte » (vue 2b conservée) |
| Section Éditer (liste, éditeur, métadonnées, partage, permissions, suppression) | Classeur (liste, collections, filtres) ; édition = Script ; métadonnées, partage, permissions dans « fiche de scène ▾ » |
| Section Graphe (barre d'outils, inspecteur 5 onglets, panneaux flottants) | Vue Graphe ; Nœud → la carte ; Santé → barre d'état ; Qualité et Slop → relecture en marge ; Coût → barre d'état ; simulation, règles de contexte, systèmes de jeu : fenêtres ponctuelles inchangées |
| Nœud de test, nœud Fin | Sorties de la réponse (4 issues), puce ■ FIN |
| Accepter / Rejeter / Régénérer, historique de régénération, Voir le prompt | Pied de carte « à valider » ; tiroir Versions ; tiroir Contexte |
| Tags de nœud, badge GDD↑, COND. | Puces de la carte et du bloc ; ALT pour tout voir |
| Export PNG/SVG, export Unity (aperçu, lot), filtres, CTRL+J, opérations par lot, carte | Menu Actions ▾ du graphe et palette ; inchangés |
| Aperçu de scénario (P) | Vue Jouer |
| `/usage`, Options › Usage IA | Classeur › Usage et coûts |
| Options (Général, Notion, Contexte, Métadonnées, Vocabulaire, Prompts, Logs, Raccourcis) | Réglages (navigation gauche) |
| Admin | inchangé, depuis le menu du compte |
| Mode écriture (CTRL+\) | Mode Focus (même raccourci) |

## 13. Articulation avec l'existant

- **Maquette 2026** (`docs/design/refonte-ui-2026/`) : la charte reste ; les écrans 1c, 2a, 2b, 2e sont absorbés
  (page Générer → fiche + Script ; 2a/2b → emplacement à écrire ; 2e → vue Graphe).
- **Epic 18 (édition in-situ)** : **reprise telle quelle comme fondation** — clic simple (D1), ÉCHAP sort (D2),
  `<textarea>` (D4), widget composite (D5), annulation transactionnelle (18.4). Les cartes et les blocs de script
  utilisent le **même** champ.
  Deux écarts proposés, à trancher (§ 14) : la largeur de carte (360 px au lieu de 280) et le texte complet en vue
  d'ensemble via le zoom par paliers plutôt que le seul dépliage à la sélection (D3).
- **Epic 19 (canvas-first, squelette)** : **remplacée** par cette refonte, qui répond à ses questions ouvertes (le
  panneau est supprimé ; un déclencheur par surface ; popovers ancrés pour la mécanique, tiroirs pour Contexte et
  Versions ; la comparaison multi-nœuds passe par le Script et la comparaison d'options). FR129 et FR130 deviennent
  testables.

## 14. Décisions à prendre (avec recommandation)

1. **Largeur des cartes : 360 px** (recommandé) au lieu de 280. Mesuré sur la réplique d'ouverture de Grish en
   Instrument Serif 16 px : 19 lignes à 280 px, 14 à 360 px (le nœud actuel tient en 14 lignes seulement parce qu'il
   descend à 12,5 px). Coût : graphes plus larges, compensé par la vue Script et le zoom par paliers.
2. **Flux du graphe gauche → droite** (recommandé) : le port au bout de chaque réponse fait partir le lien de la phrase
   et supprime les étiquettes de lien. Coût : changement de disposition (dagre `rankdir`) et une redisposition unique
   de chaque dialogue, positions sauvegardées avant.
3. **Texte complet en vue d'ensemble** : zoom par trois paliers (écrire ≥ 100 %, lire 40–75 %, situer < 40 %) calculé
   **à la fin du zoom** (pas à chaque image), une seule valeur dans le store ; la carte en écriture ne change jamais de
   palier ; la hauteur de chaque palier est connue de la disposition, donc pas de chevauchement. C'est la réponse aux
   trois objections d'Epic 18 D3 — à valider par un prototype de perf sur 500 nœuds (story 20.2).
4. **Tests sans nœud séparé** (recommandé) : le nœud de test est déjà une vue dérivée (`testNodeSync.ts`) ; le retirer
   du canvas supprime le chevauchement et ramène « 67 NŒUDS » à « 19 RÉPLIQUES ».
5. **Thème Papier** : livré en option, Nuit reste le défaut.

## 15. Découpage proposé

Voir [`epic-20.md`](../../../_bmad-output/planning-artifacts/epics/epic-20.md) : 12 stories en 4 tranches livrables
(fondation, scène, IA dans le texte, confort), chacune utile seule, Epic 18 en prérequis de la tranche 2.
