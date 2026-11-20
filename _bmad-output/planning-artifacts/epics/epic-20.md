## Epic 20: Refonte « Scène » — une scène, un texte, trois vues

**Status:** proposition — **en attente de validation par l'auteur** (2026-11-20). À la validation : reporter FR131–FR142
dans `requirements-inventory.md`, passer Epic 19 en *superseded*, puis `bmad-create-story` story par story, une
session dédiée par story (les tailles ci-dessous sont en sessions de développement).

Les auteurs ouvrent une **scène** plutôt qu'une section. La scène porte sa distribution et son contexte, se lit et
s'écrit comme un scénario (SCRIPT), se structure dans un graphe dont les cartes portent le texte (GRAPHE), et se joue
(JOUER). L'IA est un geste dans le texte ; la technique est à un geste ; le panneau de droite disparaît.

**Références :** design [`docs/design/refonte-scene/README.md`](../../../docs/design/refonte-scene/README.md) (cité
« README § n ») · architecture
[`docs/architecture/refonte-scene-architecture.md`](../../../docs/architecture/refonte-scene-architecture.md) (cité
« A n ») · recherche [`research/ux-refonte-scene-2026-11-19.md`](../research/ux-refonte-scene-2026-11-19.md) · boards
`docs/design/refonte-scene/*.dc.html` · canvas <https://claude.ai/artifact/VynbrAeNhQULRXhbnVnTDW>.

**Exigences UX :** les sections du README de design, citées par numéro. L'epic ne crée pas de UX-DR propres (leçon du
rapport de readiness du 2026-10-01 : des UX-DR définies et certifiées par la même epic forment une traçabilité
circulaire).

**Dépendances :** **Epic 18 bloquante pour la tranche 2** (le `<textarea>` in-situ, D1–D5, est l'unique surface
d'écriture) · Epic 16 (document canonique, `choiceId`, harnais `e2e/perf-document-load.spec.ts`) · Epic 14 (focus,
ARIA, TAB entre nœuds) · Epic 17 (responsive, tiroirs) · jobs de lot FR87/FR88.
**Remplace :** Epic 19 (squelette) — réversibilité assurée par A14, retour d'usage par le compteur de 20.15.

**Valeur utilisateur :** lire et écrire une scène entière sans quitter le texte, ni changer d'écran, ni ouvrir de
panneau ; voir à tout moment ce qui reste à écrire et ce que le modèle saura.

---

### FR proposées

| FR | Énoncé | Stories |
|---|---|---|
| **FR131** | Une scène porte une fiche (PNJ, PJ, lieu, brief, tons, profil d'auteur, fiches liées) enregistrée dans le document ; toute génération de la scène l'utilise. | 20.4 |
| **FR132** | Vue Script : lecture et écriture d'un chemin de la scène en continu, avec choix de la réponse et de l'issue de test suivies, fil du chemin et compteurs. | 20.6 |
| **FR133** | Emplacement « à écrire » au bout de toute réponse sans suite, en Script et en Graphe : taper ou générer (CTRL+↵), coût estimé avant, engagé pendant, réel après. | 20.11 |
| **FR134** | Options générées parcourues sur place (`‹ 1/N ›`) : garder, réessayer, variante, rejeter ; texte généré signalé jusqu'à la première retouche. | 20.11, 20.17 |
| **FR135** | Réécriture d'un passage sélectionné (CTRL+K) présentée en diff dans le texte : accepter (TAB), mot à mot (CTRL+→), refuser (ÉCHAP). | 20.13 |
| **FR136** | Graphe à cartes de texte, flux gauche → droite, un port par réponse, 4 sorties par test, liens hors champ par la gouttière ; zoom par trois paliers. | 20.7, 20.8, 20.9 |
| **FR137** | Barre d'état : enregistrement, problèmes, contexte, tokens, modèle, mots, lot en cours ; chaque élément ouvre son détail sur place. | 20.5 |
| **FR138** | Diagnostics calculables recalculés en continu et marqués à leur place ; relecture LLM (qualité, slop, langue) à la demande, en notes de marge. | 20.14 |
| **FR139** | Thème Papier, taille des répliques, mesure de lecture et mode Focus réglables sans enregistrement. | 20.16 |
| **FR140** | Versions d'une réplique consultables en diff et restaurables ; variantes et provenance conservées d'une session à l'autre. | 20.17 |
| **FR141** | Remplir en série les suites vides d'une portée (réponse, réplique, niveau, scène) avec coût total estimé avant, puis les revoir en série. | 20.12 |
| **FR142** | Les puces mécaniques (traits, compétences, flags) ne prennent que des valeurs des catalogues Unity, avec autocomplétion et renommage partout. | 20.19 |

FR129 et FR130 (Epic 19) sont couvertes par FR133, FR137 et le retrait du panneau (20.15).

### NFR touchées

| NFR | Où elle est tenue |
|---|---|
| NFR-P1 rendu du graphe < 1 s | 20.2 (preuve), 20.7 (harnais `perf-document-load.spec.ts` étendu) |
| NFR-P4 réponse UI < 100 ms | 20.2, 20.6 (p95 frappe du même harnais) |
| NFR-R3 aucune perte de données | 20.1 (aller-retour), 20.10 (409, hors ligne), 20.17 (restaurer sans perdre) |
| NFR-I1 export Unity fiable | 20.1 (golden en CI), garde-fou 2 |
| NFR-A1 tout au clavier | 20.5, 20.6, 20.9, 20.14 |
| NFR-A2 contraste AA | 20.3, 20.16 (README § 10) |
| NFR-A3 lecteur d'écran | 20.6, 20.9 (labels ARIA de chaque élément interactif nouveau) |

### Définition de « fini » commune à toutes les stories

- Tests ciblés écrits et verts (Vitest ou pytest), lint et typecheck à zéro, T2 avant la PR.
- **Preuve UI** : parcours e2e réel (Playwright) ou capture navigateur de l'écran touché, comparée au board cité.
- Les états du board `Etats` qui concernent l'écran sont traités (invité, erreur, chargement, vide).
- Aucun écran ni panneau retiré sans sa ligne cochée dans README § 13.
- Les fixtures d'export (20.1) restent identiques octet pour octet.

---

### Tranche 1 — fondation, en parallèle d'Epic 18 (≈ 5 sessions)

Rien de neuf ne se voit encore ; rien ne casse.

#### Story 20.1 : Conversion texte ↔ blocs et export golden en CI — 2 sessions

**En tant qu'** auteur, **je veux** que mes répliques s'affichent mises en forme sans que le texte stocké change,
**afin que** l'export Unity reste identique. (A3, NFR-I1, NFR-R3)

- **Given** les fixtures committées dans `tests/fixtures/unity_dialogues/` (à créer : 4 dialogues copiés de
  `Assets/Dialogue/` — proposition : le forgeron itinérant, *Le prix d'une vérité d'Uresaïr*, *L'offre sous les
  braises*, et l'import Notion de Voknir pour ses conventions hors modèle — plus
  `data/interactions/rencontre_dans_la_nef_centrale_unity.json`, déjà versionné), **When** la CI applique `parse` puis
  `serialize` à chaque `line` et chaque texte de réponse, **Then** chaque chaîne est identique octet pour octet.
- **Given** les mêmes fixtures, **When** la CI exporte chaque document vers Unity, **Then** la sortie est identique à
  un fichier golden committé ; toute différence fait échouer le job.
- **Given** une réplique avec `*didascalie*` en ligne, en paragraphe, `*[Vous …]*` et un `*` non fermé, **Then** les
  blocs distinguent didascalie et réplique, et le `*` non fermé reste du texte.
- **Given** le poste de l'auteur, **When** il lance le contrôle local (script créé par la story), **Then** les 36
  dialogues de `Assets/Dialogue/` (non versionnés) passent le même aller-retour.

#### Story 20.2 : Preuve de performance — cartes 360 px, flux LR, paliers de zoom — 2 sessions

**En tant que** développeur, **je veux** prouver la tenue du graphe à cartes de texte **avant** d'engager la
tranche 2. (A9, A10, NFR-P1, NFR-P4)

- **Given** un graphe généré de 500 répliques aux longueurs réelles (distribution mesurée sur les fixtures), **When**
  on l'ouvre dans le prototype, **Then** le premier rendu est ≤ 1 s, mesuré par le harnais
  `e2e/perf-document-load.spec.ts` étendu.
- **Given** ce graphe, **When** on zoome de 100 % à 20 % en continu, **Then** aucune image ne dépasse 16 ms (trace
  Performance), et le palier change à `onMoveEnd` seulement.
- **Given** une carte en écriture, **When** le zoom change de palier, **Then** elle reste au palier « écrire ».
- **Given** l'échec d'un des seuils, **Then** le **plan B** s'applique sans rouvrir l'epic : cartes 280 px et
  dépliage à la sélection (Epic 18 D3 inchangée), texte complet dans la vue Script ; 20.7 et 20.8 sont ajustées
  avant la tranche 2 (README § 15, décision 3).

#### Story 20.3 : Tokens en variables CSS, thème Nuit seul — 1 session

**En tant que** développeur, **je veux** des tokens en variables CSS, **afin que** Papier (20.16) ne soit qu'un jeu
de valeurs. (A8, NFR-A2)

- **Given** `redesignTokens.ts`, **When** l'app démarre, **Then** chaque token est publié en variable sur `:root`.
- **Given** les écrans déjà sur `redesignTokens` (88 fichiers au 2026-11-20), **When** ils lisent `var(--…)`,
  **Then** les captures avant / après des écrans 1c, 2a–2e sont identiques au pixel près (tolérance antialiasing).

### Tranche 2 — la scène (après Epic 18, ≈ 15 sessions)

#### Story 20.4 : Fiche de scène dans le document — 2 sessions

**En tant qu'** auteur, **je veux** que chaque scène garde ses personnages et son contexte, **afin qu'**une suite ne
parle jamais avec le PNJ d'une autre scène. (FR131, A1, README § 7 « Fiche de scène », board `Fiche`)

- **Given** un document sans clé `scene`, **When** on l'ouvre, **Then** la fiche est déduite une fois
  (`resolveGraphGenerationDramatis`), affichée avec la mention « déduite — vérifier », et enregistrée seulement quand
  l'auteur la touche ou génère.
- **Given** des graphies de locuteur multiples (`T'vok` / `T’vok`, locuteur vide), **When** la fiche est déduite,
  **Then** le rapprochement est proposé à l'auteur ; aucun `speaker` n'est réécrit sans lui.
- **Given** une scène A ouverte après une scène B, **When** on génère une suite dans A, **Then** la requête porte les
  PNJ et PJ de la fiche de A (test de non-régression du 2026-11-19).
- **Given** l'inventaire des lecteurs de `contextStore` dans le chemin de génération, **Then** plus aucun appel de
  génération ne lit les sélections globales (test qui échoue si l'un d'eux le fait).
- **Given** un document avec `scene`, **When** on exporte vers Unity, **Then** la clé est retirée (A1 : le contrat
  publié la permettrait à la racine, mais le chargeur C# n'est pas dans le dépôt) et les fixtures 20.1 restent
  identiques.

#### Story 20.5 : Enveloppe — en-tête, classeur, barre de vue, barre d'état — 4 sessions

**En tant qu'** auteur, **je veux** un seul écran par scène, **afin de** ne plus passer de Générer à Éditer à
Graphe. (FR137, A14, README § 4, § 7, § 8, § 12, boards `Main`, `Bibliotheque`)

- **Given** une scène ouverte, **Then** en-tête, classeur (252 px, rail sous 1280 px), barre de vue
  SCRIPT / GRAPHE / JOUER et barre d'état sont visibles ; ALT+1/2/3 changent de vue sans déplacer le classeur ni la
  fiche.
- **Given** l'URL `?scene=…&vue=…`, **When** on recharge, **Then** la même scène s'ouvre dans la même vue.
- **Given** la barre d'état, **When** on clique un élément (enregistrement, problèmes, contexte, tokens, modèle, mots,
  lot), **Then** son détail s'ouvre en popover ou tiroir ancré ; ÉCHAP le ferme et rend le focus.
- **Given** aucune scène ouverte, **Then** la Bibliothèque s'affiche ; ALT+N crée une scène.
- **Given** le drapeau `uiLayoutStore.legacyInspector` (défaut : faux), **When** il est vrai, **Then** l'ancien
  panneau de droite reste montable et chaque ouverture incrémente un compteur local (A14).

#### Story 20.6 : Vue Script — 3 sessions

**En tant qu'** auteur, **je veux** lire et écrire un chemin de ma scène comme un scénario. (FR132, A4, README § 7
« Bloc de script », § 8, board `Main`)

- **Given** une scène, **Then** le Script affiche le chemin suivi depuis l'ouverture, réplique en serif, didascalies
  mises en forme (20.1), réponses avec leur état mono (README § 6).
- **Given** une réponse à test, **When** on choisit une issue, **Then** le chemin suit cette issue ; le choix vit dans
  l'état d'interface (jamais dans le document).
- **Given** le fil, **Then** répliques, mots (`\w+`), suites à écrire et réponses vides sont dérivés du document en une
  passe et égaux à un calcul de référence testé sur les fixtures.
- **Given** un clic dans une réplique, **Then** c'est le `<textarea>` d'Epic 18 : toute la réplique en texte brut ;
  sortie = mise en forme ; sauvegarde au fil de la saisie (p95 frappe < 100 ms, harnais 16.6).
- **Given** la vue Script, **When** on presse TAB hors champ, **Then** le focus va à la suite vide suivante.
- **Given** un lecteur d'écran, **Then** chaque bloc, réponse et sélecteur d'issue a un nom accessible.

#### Story 20.7 : Graphe — cartes de texte et flux gauche → droite — 2 sessions

**En tant qu'** auteur, **je veux** lire les répliques dans le graphe sans ouvrir de panneau. (FR136, A9, A10,
README § 7 « Carte de réplique », boards `Graphe`, `Carte`, `Paliers`)

- **Given** un dialogue, **When** on l'ouvre pour la première fois en Graphe, **Then** il est redisposé de gauche à
  droite (dagre `LR`) et les positions précédentes sont conservées dans le layout (retour possible).
- **Given** une carte au palier « écrire », **Then** elle fait 360 px (ou 280 px si plan B), réplique bornée à
  12 lignes avec fondu « LIRE TOUT », défilement interne une fois sélectionnée, un port par réponse.
- **Given** les paliers « lire » (≈ 40–75 %) et « situer » (< 40 %), **Then** les cartes passent à 2 lignes puis au
  titre seul, et les répliques jamais atteintes sont encadrées au palier « situer ».
- **Given** une carte plus haute que l'écran, **Then** ses réponses ne sont jamais coupées (chacune porte un port) ;
  la sélectionner la fait défiler en vue, et le palier « lire » la montre entière (écart 3 à Epic 18, README § 14).
- **Given** un chemin suivi en Script, **When** on passe en Graphe (ALT+2), **Then** la dernière réplique du chemin est
  sélectionnée et centrée ; **given** une carte sélectionnée en Graphe, **when** on passe en Script (ALT+1), **then**
  le Script montre le chemin le plus court de l'ouverture jusqu'à elle (une seule source : l'état d'interface du
  chemin, A4).
- **Given** le graphe le plus grand des fixtures, **Then** NFR-P1 tient (harnais étendu en 20.2).

#### Story 20.8 : Tests en sorties et liens hors champ — 1,5 session

**En tant qu'** auteur, **je veux** voir les 4 issues d'un test comme sorties de la réponse. (FR136, A9, board
`Graphe`)

- **Given** une réponse à test, **Then** ses 4 issues (É. CRIT, ÉCHEC, RÉUSSITE, R. CRIT) sont 4 handles colorés de
  la réponse ; plus aucun `TestNode` n'est rendu ; `testNodeSync.ts` et l'export sont inchangés (fixtures 20.1).
- **Given** une issue sans suite, **Then** elle porte « À ÉCRIRE » et ouvre l'emplacement (20.11).
- **Given** une cible hors du champ visible, **Then** le lien part par la gouttière droite de la carte ; un clic
  centre la cible.

#### Story 20.9 : Lentille technique et popovers ancrés — 1,5 session

**En tant qu'** auteur, **je veux** la technique à un geste, sans panneau. (FR136, README § 7 « Puce mécanique »,
§ 8, boards `Technique`, `Graphe`)

- **Given** le graphe, **When** on presse L hors champ de texte, **Then** la lentille Technique s'active (conditions,
  effets, flags, ids) ; L la retire.
- **Given** une puce (trait, test, respect, influence, fin), **When** on la clique (cible 24 px), **Then** un popover
  ancré réutilise le contenu de `ChoiceEditor` / `AttributeSkillTestEditor` / `ConditionEditor` / `EffectEditor` ;
  ÉCHAP le ferme et rend le focus à la puce.
- **Given** le clavier seul, **Then** chaque puce est atteignable dans le widget composite de la carte (Epic 18 D5).

#### Story 20.10 : États transverses — 1 session

**En tant qu'** auteur, **je veux** que l'app me dise toujours ce qui se passe. (NFR-R3, board `Etats`)

- **Given** une session invitée, **Then** le Script et le Graphe sont en lecture avec le bandeau « lecture seule —
  se connecter pour écrire » ; aucun champ n'accepte de frappe (règle `guest_first_auth.md`).
- **Given** un 409 à l'enregistrement, **Then** le comportement existant (v1.9.3) s'applique : la révision serveur est
  adoptée et le document local renvoyé une fois (le dernier qui écrit l'emporte, pas de fusion fine) ; le toast
  « VERSION PLUS RÉCENTE ADOPTÉE · SAISIE RÉAPPLIQUÉE » dit que la frappe locale a été renvoyée sur la nouvelle
  révision ; rien de ce qui est tapé n'est perdu (test e2e). Une vraie fusion serait une story à part, hors epic.
- **Given** une génération en erreur (délai, refus du modèle), **Then** le texte déjà reçu est gardé, la raison et le
  coût engagé restent visibles, Réessayer et « Garder ce qui est écrit » sont proposés.
- **Given** un budget atteint, **Then** Générer est éteint **avant** l'appel avec sa raison ; l'écriture à la main
  continue.
- **Given** une scène en chargement, un classeur vide, une scène à deux PNJ, **Then** chacun s'affiche comme sur le
  board `Etats` (filets sans spinner ; un seul bouton « Nouvelle scène » ; un point de couleur par locuteur et la
  réponse qui dit qui parle ensuite).

### Tranche 3 — l'IA dans le texte (≈ 10 sessions)

#### Story 20.11 : Emplacement à écrire et options sur place — 3 sessions

**En tant qu'** auteur, **je veux** générer la suite là où elle manque. (FR133, FR134, A5, README § 7, boards
`Generer`, `Gestes`)

- **Given** une réponse ou une issue sans suite, en Script ou en Graphe, **Then** un emplacement « à écrire »
  l'attend ; on peut y taper directement.
- **Given** l'emplacement actif, **When** on presse CTRL+↵, **Then** le coût estimé s'affiche avant (en €,
  `estimate-cost`), le texte s'écrit en direct, le coût engagé pendant et réel après (en $) au même endroit.
- **Given** N options générées, **Then** `‹ 1/N ›` les fait défiler sur place ; Garder / Réessayer / Variante /
  Rejeter ; « comparer côte à côte » ouvre la vue 2b conservée.
- **Given** une option gardée, **Then** la connexion parent → nœud est faite par le front (`connectNodes`), jamais
  par l'API ; un `via_choice_index: null` ne crée pas d'arête de choix.
- **Given** un texte généré, **Then** il est teinté jusqu'à la première retouche (provenance en mémoire de session
  ici ; persistée par 20.17).
- **Then** `AIGenerationPanel`, `GenerationProgressModal` et la page Générer sont retirés (lignes README § 13
  cochées).

#### Story 20.12 : Remplir et revoir en série — 3 sessions

**En tant qu'** auteur, **je veux** remplir toutes les suites d'un niveau d'un coup puis les revoir, **afin de**
tenir l'arbre exponentiel. (FR141, A13, README § 7 « Tiroir Lot », board `Lot`)

- **Given** une portée (réponse, réplique, niveau, scène), **Then** le tiroir Lot affiche le nombre d'emplacements,
  les exclusions (réponses vides, répliques jamais atteintes, qui se recouvrent sur 5 emplacements dans la scène du
  forgeron) et le coût total estimé **avant** tout appel ; les portées sont calculées côté serveur à partir des jobs
  FR87/FR88.
- **Given** un lot lancé, **Then** la progression vit dans la barre d'état ; on continue d'écrire pendant le lot.
- **Given** un redémarrage du serveur pendant le lot, **Then** le job est `interrupted` et « Reprendre » ne refait
  que les parents restants (FR87/FR88).
- **Given** un lot fini, **When** on ouvre la revue en série, **Then** J / K / G / R parcourent, gardent, rejettent.

#### Story 20.13 : Réécrire une sélection — 2 sessions

**En tant qu'** auteur, **je veux** demander une réécriture d'un passage sans quitter le texte. (FR135, A5, board
`Reecrire`)

- **Given** un passage sélectionné, **When** on presse CTRL+K et tape une consigne, **Then**
  `POST …/graph/rewrite-span` (nouveau, `GraphPromptContextFactory`) renvoie un passage, montré en diff dans le texte.
- **Then** TAB accepte, CTRL+→ accepte mot à mot, ÉCHAP refuse ; `‹ 1/3 ›` si plusieurs propositions.
- **Given** l'endpoint, **Then** tests pytest du contrat (schéma, coût estimé, erreurs) et du prompt.

#### Story 20.14 : Diagnostics continus, relecture, aide clavier — 1,5 session

**En tant qu'** auteur, **je veux** voir ce qui cloche à sa place, et une aide clavier juste. (FR138, A6, README § 8,
board `Problemes`, `Gestes`)

- **Given** une modification, **When** 300 ms passent sans frappe, **Then** les diagnostics calculables (réponse vide,
  suite manquante, jamais atteinte, test sans issue) sont recalculés sans appel réseau ; marques en place et popover
  PROBLÈMES à jour.
- **Given** « Relecture », **Then** qualité, slop et langue (accords, fautes probables) arrivent en notes de marge et
  dans le groupe RELECTURE daté ; jamais en avertissement permanent.
- **Given** la table unique des raccourcis (prolonge `generalShortcuts.ts` de la PR #104), **Then** l'aide « ? » est
  générée depuis elle.
- **Given** chaque raccourci du README § 8, **Then** il est vérifié dans Chrome, Edge et Firefox en onglet et en PWA
  installée, sous Windows ; un raccourci capté par le navigateur est remplacé avant la fusion.

#### Story 20.15 : Retrait du panneau de droite — 0,5 session, à date

**En tant qu'** auteur, **je veux** que l'ancien panneau disparaisse quand plus rien n'en dépend. (A2, A14)

- **Given** un mois d'usage depuis la fin de la tranche 2 **et** un compteur d'ouvertures à zéro (ou décision de
  l'auteur), **Then** `GraphInspector`, `NodeEditorPanel` (et le protocole flush) et `UnityDialogueEditor` sont
  retirés.
- **Given** la table README § 13, **Then** chaque ligne est cochée avec le test e2e qui la couvre.
- Si la condition n'est pas remplie, la story attend ; elle ne bloque pas la tranche 4.

### Tranche 4 — confort (≈ 8 sessions)

#### Story 20.16 : Papier, taille, mesure, Focus — 2 sessions

**En tant qu'** auteur, **je veux** régler la page comme un traitement de texte, **afin de** lire et écrire
longtemps sans fatigue, de jour comme de nuit. (FR139, A8, README § 9, § 10, boards `Papier`, `Focus`, `Reglages`)

- **Given** Réglages › Apparence, **Then** Nuit / Papier / suivre le système, taille 16–24 px, mesure 64 / 72 / 80,
  densité et mouvement s'appliquent sans bouton Enregistrer.
- **Given** le thème Papier, **Then** chaque paire du README § 10 est testée en contraste (test automatique sur les
  tokens).
- **Given** CTRL+\, **Then** le Focus atténue les blocs hors focus à 0,5 ; un clic ou une sélection rend la pleine
  opacité.
- **Given** `prefers-reduced-motion`, **Then** aucune transition.

#### Story 20.17 : Journal d'édition — versions, variantes, provenance — 3 sessions

**En tant qu'** auteur, **je veux** retrouver d'une session à l'autre les versions, variantes et la provenance de mes
répliques, **afin de** revenir en arrière sans rien perdre. (FR140, FR134, A12, boards `Versions`, `Gestes`)

- **Given** `GET/PUT /api/v1/documents/{id}/journal` avec sa propre `revision`/409, **Then** versions, variantes,
  provenance et notes écartées sont persistées à côté du layout, jamais lues par l'export (fixtures 20.1 inchangées),
  et une écriture du journal ne fait pas monter la révision du document.
- **Given** une réplique, **When** on ouvre Versions, **Then** chaque version est en diff ; « Restaurer » crée une
  nouvelle version (rien n'est perdu).
- **Given** plus de 20 versions, **Then** les plus anciennes sont résumées (texte seul).

#### Story 20.18 : Téléphone et petits gestes — 2 sessions

**En tant qu'** auteur, **je veux** relire et jouer une scène au téléphone, et que chaque geste risqué se rattrape.
(README § 9, § 12, boards `Mobile`, `Gestes`, Epic 17)

- **Given** une largeur < 768 px, **Then** Script et Jouer sont utilisables au toucher (cibles ≥ 44 px), le graphe en
  lecture, la barre d'état réduite.
- **Given** une suppression, **Then** un toast d'annulation de 6 s ; **given** un état vide, **then** il dit quoi
  faire.

#### Story 20.19 : Mécanique tirée des catalogues — 1 session

**En tant qu'** auteur, **je veux** ne choisir que des traits, compétences et flags qui existent dans le jeu, **afin
qu'**une faute de frappe ne casse pas un test dans Unity. (FR142, A7, board `Technique`)

- **Given** un popover de puce, **Then** traits, compétences et flags sont autocomplétés depuis `data/UnityData/*.csv` ;
  une valeur inconnue est refusée avec la raison.

---

### Chemin critique et tailles

| Bloc | Sessions | Peut commencer |
|---|---|---|
| Epic 18 | ≈ 16 | maintenant |
| Tranche 1 (20.1–20.3) | ≈ 5 | maintenant, en parallèle d'Epic 18 |
| Tranche 2 (20.4–20.10) | ≈ 15 | après Epic 18 **et** 20.2 |
| Tranche 3 (20.11–20.15) | ≈ 10 | après 20.6 et 20.8 |
| Tranche 4 (20.16–20.19) | ≈ 8 | après 20.3 ; 20.17 après 20.11 |

Chemin critique : Epic 18 → tranche 2 → tranche 3 → tranche 4 ≈ **49 sessions**, la tranche 1 se faisant pendant
Epic 18. Les tailles sont des estimations, à recaler après les deux premières stories.

### Garde-fous

1. **Inventaire avant suppression** : aucun écran ni panneau retiré sans sa ligne cochée dans README § 13.
2. **Export golden en CI** à chaque PR (fixtures 20.1), plus contrôle local sur les 36 dialogues avant chaque tranche.
3. **Preuve UI** de chaque story par parcours réel (créer une scène, écrire, générer, jouer), pas seulement par tests
   unitaires.
4. **Une tranche = au plus quelques PR fusionnables** ; pas de branche longue (leçon de `refonte-ui-2026`, 54 commits
   d'avance).
5. **Réversibilité** : panneau de droite derrière un drapeau jusqu'à 20.15 ; redisposition LR réversible (layout).
