## Epic 20: Refonte « Scène » — une scène, un texte, trois vues

**Status:** proposition — **en attente de validation par l'auteur** (2026-11-20). À la validation : reporter les FR
ci-dessous dans `requirements-inventory.md`, passer Epic 19 en *superseded*, puis `bmad-create-story` story par story.

Les auteurs ouvrent une **scène** plutôt qu'une section. La scène porte sa distribution et son contexte, se lit et
s'écrit comme un scénario (SCRIPT), se structure dans un graphe dont les cartes portent le texte entier (GRAPHE), et
se joue (JOUER). L'IA est un geste dans le texte ; la technique est à un geste ; le panneau de droite disparaît.

**Références :** design [`docs/design/refonte-scene/README.md`](../../../docs/design/refonte-scene/README.md) ·
architecture [`docs/architecture/refonte-scene-architecture.md`](../../../docs/architecture/refonte-scene-architecture.md) ·
recherche [`research/ux-refonte-scene-2026-11-19.md`](../research/ux-refonte-scene-2026-11-19.md) ·
canvas <https://claude.ai/artifact/VynbrAeNhQULRXhbnVnTDW>.

**Dépendances :** **Epic 18 bloquante pour la tranche 2** (le champ d'édition in-situ est la surface d'écriture
unique) · Epic 16 (document canonique, `choiceId`) · Epic 14 (focus, ARIA) · Epic 17 (responsive, tiroirs).
**Remplace :** Epic 19 (squelette) — ses questions ouvertes sont tranchées au § 13 du README de design.

**Valeur utilisateur :** lire et écrire une scène entière sans quitter le texte, ni changer d'écran, ni ouvrir de
panneau ; voir à tout moment ce qui reste à écrire et ce que le modèle saura.

---

### FR proposées

- **FR131** — Une scène porte une fiche (PNJ, PJ, lieu, brief, tons, profil d'auteur, fiches liées) enregistrée dans
  le document ; toute génération de la scène l'utilise.
- **FR132** — Vue Script : lecture et écriture d'un chemin de la scène en continu, avec choix de la réponse et de
  l'issue de test suivies, fil du chemin et compteurs (répliques, mots, suites à écrire, réponses vides).
- **FR133** — Emplacement « à écrire » au bout de toute réponse sans suite, en Script et en Graphe : taper ou générer
  (CTRL+↵), coût estimé affiché avant, engagé pendant, réel après.
- **FR134** — Options générées parcourues sur place (`‹ 1/N ›`), garder / réessayer / variante / rejeter ; texte généré
  signalé jusqu'à la première retouche.
- **FR135** — Réécriture d'un passage sélectionné (CTRL+K) présentée en diff dans le texte ; accepter (TAB), mot à mot
  (CTRL+→), refuser (ÉCHAP).
- **FR136** — Graphe à cartes de texte complet, flux gauche → droite, un port par réponse, 4 sorties par test ; zoom
  par trois paliers (écrire, lire, situer).
- **FR137** — Barre d'état : enregistrement, problèmes, contexte, tokens, modèle, mots ; chaque élément ouvre son
  détail sur place.
- **FR138** — Diagnostics calculables recalculés en continu et marqués à leur place ; relecture LLM à la demande en
  notes de marge.
- **FR139** — Thème Papier, taille des répliques, mesure de lecture et mode Focus réglables sans enregistrement.
- **FR140** — Versions d'une réplique consultables en diff et restaurables.

FR129 et FR130 (Epic 19) sont couvertes par FR133, FR137 et la suppression du panneau (story 20.7).

---

### Tranche 1 — fondation (rien ne casse, rien de neuf ne se voit encore)

#### Story 20.1 : Conversion texte ↔ blocs, aller-retour garanti
**En tant qu'** auteur, **je veux** que mes répliques s'affichent mises en forme sans que le texte stocké change,
**afin que** l'export Unity reste identique.
- **Given** chacun des dialogues de `Assets/Dialogue/`, **When** on applique `parse` puis `serialize` à chaque `line`
  et chaque texte de réponse, **Then** la chaîne obtenue est identique octet pour octet.
- **Given** une réplique avec `*didascalie*` en ligne et en paragraphe, **Then** les blocs distinguent didascalie et
  réplique, et un `*` non fermé reste du texte.
- Tests : pytest ou Vitest paramétré sur tous les fichiers ; test golden d'export Unity avant / après.

#### Story 20.2 : Prototype de performance — cartes 360 px, flux LR, paliers de zoom
Preuve avant engagement (A9, A10). **Then** sur un graphe généré de 500 répliques : premier rendu ≤ 1 s, aucune image
> 16 ms pendant un zoom de 100 % à 20 %, changement de palier appliqué à `onMoveEnd` seulement. Si la preuve échoue,
les décisions 1 à 3 du README § 14 sont rouvertes **avant** la tranche 2.

#### Story 20.3 : Tokens en variables CSS (thème Nuit seul)
Publication des tokens `redesignTokens` en variables sur `:root` ; écrans redessinés lisent `var(--…)`. Aucun
changement visible (captures avant / après identiques).

### Tranche 2 — la scène (après Epic 18)

#### Story 20.4 : Fiche de scène dans le document (FR131)
- Clé `scene` additive ; document sans `scene` → fiche déduite une fois (`resolveGraphGenerationDramatis`), visible et
  corrigeable, puis enregistrée.
- Toute génération (premier nœud, suite, lot) lit la fiche ; test de non-régression du bug du 2026-11-19 (une scène ne
  reprend jamais le PNJ d'une autre).
- ⚠ Vérifier que le chargeur Unity ignore la clé ; sinon l'export la retire.

#### Story 20.5 : Enveloppe — en-tête, classeur, barre de vue, barre d'état (FR137)
Remplace les sections Générer / Éditer / Graphe ; CTRL+1/2/3 = Script / Graphe / Jouer ; URL `?scene=…&vue=…` (lue au
démarrage, recopiée ensuite) ; barre d'état avec popovers. Bibliothèque quand aucune scène n'est ouverte.

#### Story 20.6 : Vue Script (FR132)
Chemin suivi en état d'interface, sélecteur d'issue, fil, compteurs dérivés du document, champ d'Epic 18 pour
écrire, TAB → suite vide suivante (vue Script seulement).

#### Story 20.7 : Graphe à texte complet (FR136) et retrait du panneau de droite
Cartes 360 px, flux LR (redisposition unique, positions précédentes conservées), tests en sorties, lentille ALT,
popovers ancrés des puces (contenu de `ChoiceEditor` réutilisé). Retrait de `GraphInspector`, `NodeEditorPanel`
(protocole flush) et `UnityDialogueEditor` une fois Script et Graphe livrés — table « où va chaque fonction » cochée
ligne à ligne.

### Tranche 3 — l'IA dans le texte

#### Story 20.8 : Emplacement à écrire et options sur place (FR133, FR134)
Remplace `AIGenerationPanel`, `GenerationProgressModal` et la page Générer ; écriture en direct dans l'emplacement ;
`‹ 1/N ›` ; provenance ; connexion parent → nœud faite par le front. Coût estimé / engagé / réel au même endroit.

#### Story 20.9 : Réécrire une sélection (FR135)
Nouvel endpoint `rewrite-span` sur `GraphPromptContextFactory` ; diff en place ; TAB / CTRL+→ / ÉCHAP ; `‹ 1/3 ›`.

#### Story 20.10 : Diagnostics continus et relecture en marge (FR138)
Calculables recalculés à 300 ms ; marques en place ; popover PROBLÈMES ; Qualité et Slop à la demande en notes de
marge ; aide clavier générée depuis la table des raccourcis (corrige CTRL+E fantôme et les raccourcis faux du « ? »).

### Tranche 4 — confort

#### Story 20.11 : Papier, taille, mesure, Focus (FR139)
Thème Papier (contrastes du README § 9, testés), suivi du système, A−/A+, mesure 64/72/80, Focus (CTRL+\), mouvement
réduit respecté.

#### Story 20.12 : Versions d'une réplique, gestes et téléphone (FR140)
Tiroir Versions (diff, restaurer), toast d'annulation, variantes, Script et Jouer au téléphone (cibles ≥ 44 px).

---

### Garde-fous

1. **Inventaire avant suppression** : aucun écran ni panneau retiré sans sa ligne cochée dans le README § 12.
2. **Export golden** à chaque tranche (export de tous les dialogues, comparaison octet par octet).
3. **Preuve UI** de chaque story par parcours e2e réel (créer une scène, écrire, générer, jouer), pas seulement par
   tests unitaires.
4. **Une tranche = une PR fusionnable** ; pas de branche longue (leçon de `refonte-ui-2026`, 54 commits d'avance).
