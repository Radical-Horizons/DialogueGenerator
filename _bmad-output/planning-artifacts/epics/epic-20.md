## Epic 20: Refonte « Scène » — une scène, un texte, trois vues

**Status:** **validée le 2026-11-20, prioritaire** — malgré son numéro, l'epic 20 passe devant les autres et démarre
tout de suite. FR131–FR145 sont reportées dans `requirements-inventory.md` ; Epic 19 est remplacée ; les stories
d'Epic 18 utiles à la refonte sont intégrées ici (tranche 1 bis). Chaque story se code dans une session dédiée avec
`bmad-build`, qui écrit sa spec, la fait approuver, implémente et relit d'un seul tenant ; sans surveillance,
`bmad-loop run` (les tailles ci-dessous sont en sessions de développement).

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

**Dépendances :** Epic 16 (document canonique, `choiceId`, harnais `e2e/perf-document-load.spec.ts`) · Epic 17
(responsive, tiroirs) · jobs de lot FR87/FR88 · PR #103 (conversations IA, back-end, fusionnée : `aba4683e1`) pour
20.21. **Epic 14 n'est pas attendue** : 14.1 (TAB entre nœuds) et 14.2 (tokens de focus) sont absorbées par 18.9 pour
le périmètre du graphe et de la vue Script ; 14.3 et 14.4 restent dans Epic 14.
**Intègre Epic 18** : le `<textarea>` in-situ (D1–D5) reste l'unique surface d'écriture, mais ses stories ne passent
plus avant dans une epic séparée. Révisé le 2026-11-20 après le contrôle de readiness (constat B1) :
- **tranche 1 bis, maintenant** : 18.4 (reste à faire seulement), 18.8 et **18.5a**, le composant de champ seul,
  testé hors graphe — aucune de ces trois stories ne dépend de la géométrie de la carte ;
- **tranche 2, après 20.6 et 20.7** : 18.5b (montage du champ dans le bloc de script et la carte), 18.6, 18.7, 18.9 et
  18.11, critères réécrits contre la carte (palier « écrire », 360 px ou 280 px plan B) et le bloc de script ;
- 18.10 (tactile) rejoint 20.18 ; 18.1 et 18.2 sont remplacées par 20.7 et 20.8 (cartes de texte) ;
- 18.3 (synchro vers le panneau) n'est pas codée, mais sa garantie devient un critère : dès qu'un champ in-situ écrit
  (18.5b), le même champ de `NodeEditorPanel` et de l'onglet Éditer (`UnityDialogueEditor`) passe en lecture
  seule et leur flush ne l'écrit plus, champ par champ jusqu'à 18.7 (constat B2, test de régression des scénarios A, B, C de
  18.3).
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
| **FR136** | Graphe à cartes de texte, flux gauche → droite, un port par réponse, 4 sorties par test, liens hors champ par la gouttière ; zoom par trois paliers contigus (écrire ≥ 75 %, lire 40–75 %, situer < 40 %). | 20.7, 20.8, 20.9 |
| **FR137** | Barre d'état : enregistrement, problèmes, contexte, tokens par réplique, modèle, mots, temps de lecture, aide « ? raccourcis », et lot en cours pendant un lot ; problèmes, contexte, modèle, lot et aide ouvrent leur détail sur place. | 20.5 (enregistrement, santé, coût, modèle, mots, lecture, aide), 20.12 (lot), 20.14 (problèmes), 20.25 (contexte) |
| **FR138** | Diagnostics calculables recalculés en continu et marqués à leur place ; relecture LLM (qualité, slop, langue) à la demande, en notes de marge. | 20.14 |
| **FR139** | Thème Papier, taille des répliques, mesure de lecture et mode Focus réglables sans enregistrement. | 20.16 |
| **FR140** | Versions d'une réplique consultables en diff et restaurables ; variantes et provenance conservées d'une session à l'autre. | 20.17 |
| **FR141** | Remplir en série les suites vides d'une portée (réponse, réplique, niveau, scène) avec coût total estimé avant, puis les revoir en série. | 20.12 |
| **FR142** | Les puces mécaniques (traits, compétences, flags) ne prennent que des valeurs des catalogues Unity, avec autocomplétion et renommage partout. | 20.19 |
| **FR143** | Une scène prend la teinte de son lieu et montre les portraits de ses personnages et une couverture, sans toucher au texte ni au bleu d'action ; une scène sans image reste complète. | 20.20 |
| **FR144** | Sur une réplique générée, l'auteur ouvre une discussion avec l'IA qui l'a écrite : contexte et réponse d'origine, résumé de réflexion quand il existe, questions et réponses avec leur coût. | 20.21, 20.23 |
| **FR145** | Depuis la palette, l'auteur pose une question sur l'interface ou sur le GDD et reçoit une réponse sourcée dans le même tiroir de discussion. | 20.22 |
| **FR146** | Vue Jouer : l'auteur joue la scène depuis l'ouverture, voit pourquoi un choix est verrouillé, force l'issue d'un test, suit l'état de la partie et revient d'un choix. | 20.24 |

FR129 et FR130 (Epic 19) sont couvertes par FR133, FR137 et le retrait du panneau (20.15).

**Fonctions du README § 13 sans FR propre** : le tiroir Contexte, l'écran Fiches du GDD, la palette étendue et le menu
« fiche de scène ▾ » (« fiche ▾ » au README § 13 ; le libellé du board fait foi) sont portés par 20.25 et 20.4 ; ils
servent FR131, FR133 et FR137. L'Accueil (20.26) et les Réglages (20.27), ajoutés le 2026-11-28, n'ont pas de FR
propre non plus.

### NFR touchées

| NFR | Où elle est tenue |
|---|---|
| NFR-P1 rendu du graphe — seuil de l'epic = ADR-008 (voir « Seuils de mesure ») | 20.2 (preuve), 20.7 (harnais `perf-document-load.spec.ts` étendu) |
| NFR-P4 réponse UI < 100 ms | 20.2, 20.6 (p95 frappe du même harnais) |
| NFR-R3 aucune perte de données | 20.1 (aller-retour), 20.10 (409, hors ligne), 20.17 (restaurer sans perdre) |
| NFR-I1 export Unity fiable | 20.1 (golden en CI), garde-fou 2 |
| NFR-A1 tout au clavier | 20.5, 20.6, 20.9, 18.9, 20.14 |
| NFR-A2 contraste AA | 20.3, 20.16 (README § 10 ; exception assumée du mode Focus écrite en 20.16) |
| NFR-A3 lecteur d'écran | 18.4, 18.5a, 18.8, 20.6, 20.9 (labels ARIA de chaque élément interactif nouveau) |

### Seuils de mesure (tranchés le 2026-11-20)

Ces seuils remplacent ceux que citaient les stories ; aucun autre chiffre n'est à inventer en story.

| Mesure | Seuil | Où et comment |
|---|---|---|
| Chargement du graphe (NFR-P1) | **p95 load < 3 s** sous 500 nœuds (palier « confort » d'ADR-008, `docs/architecture/adr-008-perf-targets.md`), au lieu du « ≤ 1 s » de la première rédaction | Poste Windows de l'auteur, `PERF_STRICT=1`, harnais `e2e/perf-document-load.spec.ts` étendu ; navigateur et machine notés avec chaque mesure. La CI ne lance aucun e2e fonctionnel : la mesure est locale et sa sortie citée dans la PR. |
| Frappe (NFR-P4) | **p95 frappe < 100 ms** (ADR-008) | Même harnais, même poste. |
| Glisser une carte | **p95 drag < 200 ms** (ADR-008, palier confort) | Même harnais, même poste. |
| Interaction (zoom, défilement) | **p95 des images ≤ 16 ms** et **aucune tâche longue > 50 ms** pendant le geste | Trace Performance Playwright exportée dans `tmp/`, chiffres recopiés dans la story. Remplace l'absolu « aucune image > 16 ms ». |
| Paliers de zoom | écrire ≥ 75 % · lire ≥ 40 % et < 75 % · situer < 40 %, **sans trou** | A10, 20.2, 20.7. |
| Lot | **pas de seuil en euros** : la confirmation affiche toujours le coût total estimé, et un lot dont l'estimation dépasse le budget restant est refusé avant tout appel (gouvernance de coût existante, `ID-003`) | 20.11, 20.12. |
| Lecteur d'écran | **NVDA sous Windows** est la référence | 18.4, 18.5a, 18.8, 20.6, 20.9, 20.21. |
| Tactile | **émulation Playwright** (presets 375 px et 768 px) en preuve de story ; **appareil réel** vérifié par Marc en fin de tranche | 20.18 et toute story qui touche une cible tactile. |

### Définition de « fini » commune à toutes les stories

- Tests ciblés écrits et verts (Vitest ou pytest), lint et typecheck à zéro, T2 avant la PR.
- **Preuve UI** : parcours e2e réel (Playwright) ou capture navigateur de l'écran touché, comparée au board cité.
- Les états du board `Etats` qui concernent l'écran sont traités (invité, erreur, chargement, vide).
- Aucun écran ni panneau retiré sans sa ligne cochée dans README § 13.
- Aucun écart entre la story et la maquette : la maquette prime, sauf si elle est manifestement moins bonne (le dire
  à l'auteur). Audit : [`research/audit-maquette-stories-epic-20-2026-11-28.md`](../research/audit-maquette-stories-epic-20-2026-11-28.md).
  Une ligne « À TRANCHER AVEC L'AUTEUR » se tranche avant d'écrire la spec.
- Les fixtures d'export (20.1) restent identiques octet pour octet.
- Une spec e2e que la story casse est **migrée** dans la même PR, jamais supprimée ; seule une fonction retirée et
  documentée (README § 13) autorise à retirer son test. Specs couplées au panneau ou au `TestNode` (plan de test
  `_bmad-output/test-artifacts/test-design-epic-20.md`, constat 6) : `documents-layout-adr008`,
  `graph-4-test-results`, `graph-authoring-journey` (@smoke), `graph-connection-target-dropdown`, `graph-manual-node`,
  `graph-node-generation`, `graph-test-node-generation-4results`, et le helper `e2e/helpers.ts`.

---

### Tranche 1 — fondation, tout de suite (≈ 5 sessions)

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
  un fichier golden committé ; toute différence fait échouer le job. Le golden est **double**, sur les mêmes fichiers
  attendus : en **pytest** (rendu Python, chemin `save-and-write` et lot) et en **Vitest** (chaîne
  `documentToGraph → graphToDocument → exportToUnity`, **plus** le chemin invité de `useUnityExport.ts`, qui exporte
  `state.document` tel quel) ; aucun des deux ne contient de clé `scene`. Les deux tests portent le marqueur `p0` et
  tournent à chaque PR (T2) ; aucun e2e n'en tient lieu (la CI n'en lance pas).
- **Given** le début de la story, **Then** les fichiers attendus sont générés **depuis le code actuel, avant tout
  changement** de l'export ou de la conversion, et committés dans une PR (ou un commit) qui ne touche rien d'autre ;
  ils figent aussi les défauts actuels (une correction de l'export se fait dans une PR à part qui régénère le golden).
- **Given** une réplique avec `*didascalie*` en ligne, en paragraphe, `*[Vous …]*` et un `*` non fermé, **Then** les
  blocs distinguent didascalie et réplique, et le `*` non fermé reste du texte.
- **Given** la conversion existante `splitDialogueLine` (`frontend/src/utils/dialogueLineSegments.ts`), qui garde la
  suite d'un `*` non fermé en narration et `trim()` chaque segment (non réversible), **Then** `parse` la remplace (ou
  la fonde) ; `DialogueLineText` et l'estimation de hauteur de dagre (`dagreLayout.ts`) passent sur `parse` ; le
  changement de comportement du `*` non fermé est testé dans ces trois consommateurs.
- **Given** un bloc produit par `parse`, **Then** il porte ses positions `start` et `end` dans la chaîne source ; elles
  servent au clic → curseur (18.5a, 18.5b), au diff de 20.13 et à la provenance par plage (A12).
- **Given** le poste de l'auteur, **When** il lance le contrôle local (script créé par la story), **Then** les 36
  dialogues de `Assets/Dialogue/` (non versionnés) passent le même aller-retour. La story se fait **sur ce poste** :
  les 4 fixtures sont copiées de `Assets/Dialogue/`, absent du dépôt.

#### Story 20.2 : Preuve de performance — cartes 360 px, flux LR, paliers de zoom — 2 sessions

**En tant que** développeur, **je veux** prouver la tenue du graphe à cartes de texte **avant** d'engager la
tranche 2. (A9, A10, NFR-P1, NFR-P4)

- **Given** le prototype, **Then** c'est l'application React Flow réelle, cartes de texte activées par un drapeau
  local (`uiLayoutStore`, désactivé par défaut) — pas une page à part ni un board `.dc.html` — pour que la mesure
  porte sur le vrai `GraphCanvas`, le vrai store et la vraie projection.
- **Given** un graphe généré de 500 répliques aux longueurs réelles (distribution mesurée sur les fixtures de 20.1),
  versionné avec son script de génération, **When** on l'ouvre dans le prototype, **Then** p95 load < 3 s (ADR-008,
  palier confort), mesuré par le harnais `e2e/perf-document-load.spec.ts` étendu, avec `PERF_STRICT=1`, sur le poste
  Windows de l'auteur. Deux mesures distinctes : la première ouverture, **redisposition LR comprise**, et une
  ouverture suivante ; les deux tiennent le seuil.
- **Given** ce graphe, **When** on zoome de 100 % à 20 % en continu, **Then** p95 des images ≤ 16 ms et aucune tâche
  longue > 50 ms (trace Performance exportée dans `tmp/`, navigateur et machine nommés), et le palier change à
  `onMoveEnd` seulement.
- **Given** les paliers, **Then** leurs bornes sont contiguës : écrire ≥ 75 %, lire ≥ 40 % et < 75 %, situer < 40 %.
- **Given** ce graphe, **Then** p95 frappe < 100 ms et p95 drag < 200 ms (ADR-008) sont mesurés et consignés.
- **Given** une carte en écriture, **When** le zoom change de palier, **Then** elle reste au palier « écrire ».
- **Given** la fin de la story, **Then** la décision plan A / plan B est écrite dans la story avec ses mesures (poste,
  navigateur, médiane et p95).
- **Given** l'échec d'un des seuils, **Then** le **plan B** s'applique sans rouvrir l'epic : cartes 280 px et
  dépliage à la sélection (Epic 18 D3 inchangée), texte complet dans la vue Script ; 20.7 et 20.8 sont ajustées
  avant la tranche 2 (README § 15, décision 3).

#### Story 20.3 : Tokens en variables CSS, thème Nuit seul — 1 session

**En tant que** développeur, **je veux** des tokens en variables CSS, **afin que** Papier (20.16) ne soit qu'un jeu
de valeurs. (A8, NFR-A2)

- **Given** `redesignTokens.ts`, **When** l'app démarre, **Then** chaque token est publié en variable sur `:root`.
- **Given** les écrans déjà sur `redesignTokens` (88 fichiers au 2026-11-20), **When** ils lisent `var(--…)`,
  **Then** les captures avant / après des écrans 1c, 2a–2e sont identiques au pixel près (tolérance antialiasing).

### Tranche 1 bis — fondation d'écriture, reprise d'Epic 18 (≈ 3,5 sessions)

Révisée le 2026-11-20 (readiness, B1) : ne restent ici que les stories qui ne dépendent pas de la géométrie de la
carte. Les stories gardent leur numéro et leurs critères dans `epic-18.md`, réécrits là où la refonte les change.
Trois points sont tranchés par la refonte : la carte mesure 360 px (ou 280 px si le plan B de 20.2 s'applique), le
dépliage suit les paliers de zoom (D3 rouverte) et la carte n'a pas de hauteur maximale (réplique bornée à 12 lignes,
réponses jamais coupées : écart 3, README § 14).

| Story | Rôle dans la refonte | Sessions |
|---|---|---|
| 18.4 Annulation — **reste à faire** : CTRL+Z / CTRL+Y dans un champ, `allowedInInputs`, annonce au lecteur d'écran | Toute frappe dans le Script et le Graphe ; le regroupement par rafales est livré (`61462f0a8`) | 1 |
| 18.8 Indicateur d'enregistrement | Barre d'état (20.5) | 1 |
| 18.5a Champ d'écriture seul (`<textarea>`, D2, D4), testé hors graphe ; après 20.1 (positions `start`/`end`) | Le composant unique d'écriture, monté plus tard par 18.5b | 1,5 |

Les autres stories reprises d'Epic 18 passent en tranche 2 (ci-dessous), après 20.6 et 20.7.

### Tranche 2 — la scène (après 20.2 et la tranche 1 bis, ≈ 37 sessions)

Ordre : 20.4 → 20.5 → 20.25 → 20.6 → 20.7 → 18.5b → 18.6 → 18.7 → 20.8 → 18.9 → 20.9 → 18.11 → 20.10 → 20.24 → 20.26 → 20.27. Les
stories d'Epic 18 de cette tranche (18.5b, 18.6, 18.7, 18.9, 18.11 : 7 sessions) sont décrites dans `epic-18.md`, avec
leurs critères réécrits contre la carte et le bloc de script.

#### Story 20.4 : Fiche de scène dans le document — 3 sessions

**En tant qu'** auteur, **je veux** que chaque scène garde ses personnages et son contexte, **afin qu'**une suite ne
parle jamais avec le PNJ d'une autre scène. (FR131, A1, README § 7 « Fiche de scène », § 13, board `Fiche`)

Démarrable dès la fin de 20.1 (aucune dépendance sur la tranche 1 bis ; elle corrige un bug vécu le 2026-11-19).

- **Given** un document sans clé `scene`, **When** on l'ouvre, **Then** la fiche est déduite une fois
  (`resolveGraphGenerationDramatis`), affichée avec la mention « déduite — vérifier », et enregistrée seulement quand
  l'auteur la touche ou génère.
- **Given** des graphies de locuteur multiples (`T'vok` / `T’vok`, locuteur vide), **When** la fiche est déduite,
  **Then** le rapprochement est proposé à l'auteur ; aucun `speaker` n'est réécrit sans lui.
- **Given** une scène A ouverte après une scène B, **When** on génère une suite dans A, **Then** la requête porte les
  PNJ et PJ de la fiche de A (test de non-régression du 2026-11-19).
- **Given** l'inventaire des lecteurs de `contextStore` dans le chemin de génération, **Then** plus aucun appel de
  génération ne lit les sélections globales (test qui échoue si l'un d'eux le fait).
- **Given** un document avec `scene`, **When** on exporte vers Unity par l'un des trois chemins (front
  `exportToUnity`, invité `useUnityExport.ts`, Python `save-and-write` et lot), **Then** la clé est absente (A1 : le
  contrat publié la permettrait à la racine, mais le chargeur C# n'est pas dans le dépôt) et les deux golden de 20.1
  restent identiques.
- **Given** l'écriture du document sur disque, **Then** `scene` n'est **jamais** dans le fichier
  `Assets/Dialogue/{id}.json` : `DocumentPersistenceService.write_document` l'écrit dans un fichier compagnon
  `Assets/Scenes/{id}.scene.json` (frère de `Assets/Layouts/`, hors du dossier listé comme bibliothèque), dans la même
  transaction que le document (même instantané et même restauration en cas d'échec, même révision), et
  `read_document` la remet dans la réponse. Raison, vérifiée le 2026-11-20 : le fichier persisté est celui qu'on
  copie dans le projet Unity (voir A1).
- **Given** un `PUT /api/v1/documents/{id}` qui porte `scene`, **When** on relit par `GET`, **Then** `scene` est
  identique (aller-retour testé en pytest), la révision a monté d'une seule unité, et un document sans fiche reste
  valide (aucun fichier compagnon créé).
- **Given** une scène ouverte, **Then** la fiche s'affiche comme sur le board `Fiche` : compacte en une ligne (titre,
  PNJ, PJ, lieu, brief), dépliable ; titre éditable, enregistré à la frappe ; brief avec mention `@` et aperçu de la
  fiche du GDD ; tons ; profil d'auteur (= voix d'écriture, distincte des templates) ; sur une scène neuve, le premier
  emplacement à écrire sous la fiche, avec « Écrire la première réplique » (son geste « Générer » arrive en 20.11).
- **Given** le menu « fiche de scène ▾ », **Then** il porte ce que le README § 13 y range : Flags du dialogue,
  « Enregistrer comme template », « Appliquer un template… », métadonnées, partage, permissions, supprimer — en
  réutilisant les composants existants (aucune fonction recréée) ; supprimer la scène garde la confirmation actuelle.

#### Story 20.5 : Enveloppe — en-tête, classeur, barre de vue, barre d'état — 4 sessions

**En tant qu'** auteur, **je veux** un seul écran par scène, **afin de** ne plus passer de Générer à Éditer à
Graphe. (FR137, A14, README § 4, § 7, § 8, § 12, boards `Main`, `Bibliotheque`)

- **Given** une scène ouverte, **Then** en-tête, classeur (252 px, rail sous 1280 px), barre de vue
  SCRIPT / GRAPHE / JOUER et barre d'état sont visibles ; ALT+1/2/3 changent de vue sans déplacer le classeur ni la
  fiche.
- **Given** l'URL `?scene=…&vue=…`, **When** on recharge, **Then** la même scène s'ouvre dans la même vue.
- **Given** la barre d'état, **Then** elle porte, dans l'ordre du README § 4 : ENREGISTRÉ · PROBLÈMES · CONTEXTE ·
  TOKENS / RÉPLIQUE · MODÈLE ··· MOTS · LECTURE · ? RACCOURCIS, plus LOT pendant un lot (20.12).
- **Given** la barre d'état, **Then** seuls PROBLÈMES, CONTEXTE, MODÈLE, LOT et « ? RACCOURCIS » se cliquent (popover
  ou tiroir ancré ; ÉCHAP le ferme et rend le focus) ; ENREGISTRÉ, TOKENS / RÉPLIQUE et MOTS · LECTURE sont des
  textes, comme sur le board `Main`. Cette story branche la santé de `GraphToolbarStatusRow` (PROBLÈMES, jusqu'à
  20.14), le modèle (réglage de session) et l'aide ; le tiroir Contexte vient de 20.25, LOT de 20.12.
- **Given** la barre de vue, **Then** les trois vues portent « Actions ▾ » (export Unity, coût du dialogue
  `DialogueCostModal`, export PNG/SVG, fenêtres ponctuelles) et ↶ ↷ ; les mêmes commandes sont dans la palette.
- **Given** la pastille de compte, **When** on la clique, **Then** un menu porte mot de passe, Administration et
  Déconnexion ; en invité elle est remplacée par « CONNEXION ».
- **Given** que Script et Jouer ne sont pas livrés, **Then** la scène s'ouvre en GRAPHE, SCRIPT et JOUER sont grisés
  jusqu'à leur story, et Générer et Éditer restent atteignables par un lien mono provisoire dans la barre de vue.
- **Given** une largeur de 375 ou 768 px, **Then** rien ne régresse (`e2e:pwa` vert) ; CTRL+\ replie classeur et fiche
  jusqu'à 20.16 ; le classeur se replie aussi à la main.
- **Given** la table des raccourcis (`generalShortcuts.ts`), **Then** `ctrl+n`, `ctrl+1` à `ctrl+4` et `ctrl+/` sont
  retirés ou remplacés (README § 8) ; Alt+S reste jusqu'au retrait de la page Générer.
- **Given** aucune scène ouverte, **Then** l'Accueil s'affiche (nom retenu : « Accueil », comme README § 5 et 20.20) :
  ici sous une forme provisoire (scènes et « Nouvelle scène »), l'écran du board `Bibliotheque` venant de 20.26. La
  liste actuelle (`/unity-dialogues`) et la modale Options restent ouvertes jusqu'à 20.26 et 20.27.
- **Given** ALT+N, **Then** une scène est créée **et enregistrée** (document créé côté serveur, `create_only`) avant
  toute génération : la première réplique générée pourra être rattachée à son appel (A1, prérequis de « Pourquoi ? »
  sur l'ouverture, 20.21). Son identifiant est neutre et stable, son titre libre.
- **Given** les routes actuelles (`/`, `/unity-dialogues`, `/graph-editor(/:id)` ; Générer et Éditer sont des onglets
  de `/` sans URL propre), **Then** chacune reste ouverte, avec un lien vers la même scène, jusqu'à la story qui la
  remplace, puis redirige : `/graph-editor` → vue Graphe en 20.7, onglet Générer → Script en 20.11, onglet Éditer →
  Script en 20.15, `/unity-dialogues` → Accueil en 20.26 ; aucune URL ne mène à une page blanche. La table est posée ici, chaque story l'active.
- **Given** le drapeau `uiLayoutStore.legacyInspector`, **When** il est vrai, **Then** l'ancien panneau de droite reste
  montable et chaque ouverture incrémente un compteur local (A14). Sa valeur par défaut reste **vraie** tant que la
  carte et le bloc ne portent pas l'écriture du texte (18.5b, 18.6, 18.7) et la technique (popovers de 20.9) ; elle
  passe à **faux** avec 20.9. Sans cela, un auteur n'aurait plus aucune surface d'écriture entre 20.5 et 18.5b.
- **Given** `NodeEditorPanel` monté (drapeau `legacyInspector` ou état actuel) **et** un champ in-situ en service
  (18.5b livrée), **Then** chaque champ passe en lecture seule quand son champ in-situ existe — `line` (18.5b),
  `choices[].text` (18.6), `speaker` et `title` (18.7) — et son flush ne l'écrit plus ; test de régression des
  scénarios A, B, C de 18.3.
- **Given** l'onglet Éditer (`UnityDialogueEditor`) pendant la tranche 2, **Then** la même règle s'applique dès 18.5b :
  ses champs passent en lecture seule au même rythme, avec un lien « écrire dans la scène » vers le Script ; il est
  retiré en 20.15.

#### Story 20.25 : Tiroir Contexte, écran Fiches du GDD, palette — 3,5 sessions (estimation)

**En tant qu'** auteur, **je veux** voir ce que le modèle saura et retrouver le GDD sans la page Générer, **afin
que** son retrait (20.11) ne me fasse perdre aucune fonction. (FR131, FR133, FR137, README § 7, § 13, boards
`Contexte`, `Fiches`, `Palette`)

Estimation à recaler à la création de la story. Placée avant 20.11, qui retire la page Générer.

- **Given** la barre d'état, **When** on clique CONTEXTE, **Then** le tiroir Contexte (380 px, ÉCHAP ferme et rend
  le focus) montre les tokens par section, le budget (AUTO par défaut), le modèle, le raisonnement, l'estimation en
  tokens et en € et « voir le prompt », comme sur le board `Contexte` ; « retirer » et « + Ajouter une fiche @ »
  modifient la fiche de scène (PNJ et PJ ne se retirent pas ici). Un nouvel endpoint « aperçu du prompt » (sections,
  tokens, texte, issu de `GraphPromptContextFactory`, figurant du serveur compris) le nourrit, sans recalcul côté
  front ; « la prochaine suite » est celle du nœud ou de la réponse sélectionnés, sinon de l'ouverture.
- **Given** les contrôles lore et context dropping, **Then** ils lisent la fiche de scène, comme la génération.
- **Given** un nœud déjà généré, **Then** « Voir le prompt » reste au menu de sa carte.
- **Given** le classeur, **When** on ouvre « Fiches du GDD », **Then** l'écran du board `Fiches` liste les fiches
  comptées sur disque, en lecture seule (aucune sélection), avec l'état de la synchro Notion, « Synchroniser » par
  fiche (`sync-entity` existe) et « UTILISÉE DANS » (endpoint à créer).
- **Given** les règles de contexte aujourd'hui dans la colonne Contexte GDD, **Then** elles s'ouvrent depuis le tiroir
  Contexte jusqu'à 20.27, qui les range dans Réglages › Notion et GDD (README § 13).
- **Given** CTRL+K, **Then** la palette du board `Palette` cherche scènes, répliques, fiches et commandes, chaque
  commande avec son raccourci (table unique `generalShortcuts.ts`) ; sans sélection de texte seulement (sur une
  sélection, CTRL+K est la réécriture de 20.13). Les commandes d'une story non livrée sont masquées ; la recherche
  plein texte du GDD demande un endpoint à créer ; le champ d'en-tête ne dit pas « demander » avant 20.22.
- **Given** les fonctions actuelles de la colonne Contexte que la maquette ignore, **Then** aucune ne disparaît
  (décision de l'auteur, 2026-11-28) : suggestions, pertinence, usage des sections, comparaison, optimisation et mode
  complet / extrait vont au tiroir Contexte, l'historique d'une fiche à l'écran Fiches, en réutilisant les composants
  existants, chacune couverte par un test.
- **Given** le README § 13, **Then** les lignes « Colonne Contexte GDD » et « Colonne droite (Prompt…) » sont
  couvertes, chacune avec la spec e2e qui le prouve.

#### Story 20.6 : Vue Script — 3 sessions

**En tant qu'** auteur, **je veux** lire et écrire un chemin de ma scène comme un scénario. (FR132, A4, README § 7
« Bloc de script », § 8, board `Main`)

- **Given** une scène, **Then** le Script affiche le chemin suivi depuis l'ouverture, réplique en serif, didascalies
  mises en forme (20.1) et à la ligne (comme partout en lecture), réponses avec leur état mono (README § 6).
- **Given** un bloc, **Then** il porte l'en-tête (point et nom du locuteur, VALIDÉ / À VALIDER, titre) et les puces
  sous les réponses ; la vue porte le fil d'Ariane du chemin, la liste « FIL — CHEMIN SUIVI », le compteur LECTURE et
  « CTRL+CLIC · OUVRIR DANS LE GRAPHE » ; entre 1024 et 1280 px le fil se replie dans la barre de vue (README § 12).
  A− / A+ / Focus arrivent en 20.16. Le point de couleur suit l'ordre de la distribution.
- **Given** une réponse, **Then** un clic dans son texte pose le curseur ; son numéro, son état mono et les marges
  suivent le chemin (le board, qui fait de toute la ligne un bouton, est moins bon).
- **Given** la fin du chemin, **Then** un emplacement propose « Écrire », qui crée la réplique vide (« Générer » en
  20.11) ; un renvoi vers une réplique déjà affichée donne une ligne « → titre » sans la redérouler.
- **Given** une réponse à test, écrite ou non, **Then** le sélecteur d'issue apparaît ; **When** on choisit une issue,
  le chemin la suit ; le choix vit dans l'état d'interface (jamais dans le document).
- **Given** le fil, **Then** répliques, mots, suites à écrire et réponses vides sont dérivés du document en une
  passe et égaux à un calcul de référence testé sur les fixtures. Un mot est une suite de lettres, chiffres ou `_` au
  sens Unicode : `/[\p{L}\p{N}_]+/gu` (en JavaScript, `\w` sans drapeau `u` est ASCII : « Uresaïr » compterait deux
  mots). La valeur de référence est recalculée sur la fixture du forgeron de 20.1 par la story, jamais recopiée du
  README.
- **Given** un clic dans une réplique, **Then** c'est le champ de 18.5a, monté par 18.5b : toute la réplique en texte
  brut, curseur à la position cliquée ; sortie = mise en forme ; sauvegarde au fil de la saisie (p95 frappe < 100 ms,
  harnais 16.6). Cette story affiche le bloc ; le montage du champ dans le bloc est le livrable de 18.5b.
- **Given** la vue Script, **When** on presse TAB alors qu'aucun contrôle n'a le focus, **Then** il va à la suite vide
  suivante de toute la scène (compteur « 2 / 209 ») ; les flèches parcourent réponses et issues.
- **Given** un lecteur d'écran (NVDA sous Windows), **Then** chaque bloc, réponse et sélecteur d'issue a un nom
  accessible.

#### Story 20.7 : Graphe — cartes de texte et flux gauche → droite — 2 sessions

**En tant qu'** auteur, **je veux** lire les répliques dans le graphe sans ouvrir de panneau. (FR136, A9, A10,
README § 7 « Carte de réplique », boards `Graphe`, `Carte`, `Paliers`)

- **Given** un dialogue, **When** on l'ouvre pour la première fois en Graphe, **Then** il est redisposé de gauche à
  droite (dagre `LR`) et les positions précédentes sont conservées dans le layout (retour par « Disposer ▾ »).
- **Given** la vue Graphe, **Then** elle porte ↶ ↷, « Disposer ▾ », la bascule TEXTE / TECHNIQUE, le zoom
  « − 100 % · ÉCRIRE + AJUSTER » et la minimap « CARTE · n RÉPLIQUES » ; l'aide de gestes s'ajoute à la barre d'état
  sans retirer ses compteurs ; seul l'en-tête d'une carte se glisse ; les liens n'ont plus d'étiquette.
- **Given** une carte au palier « écrire », **Then** elle fait 360 px (ou 280 px si plan B), réplique bornée à
  12 lignes avec fondu « LIRE TOUT », défilement interne une fois sélectionnée, un port par réponse.
- **Given** les paliers « écrire » (≥ 75 %), « lire » (≥ 40 % et < 75 %) et « situer » (< 40 %), sans trou entre
  eux (A10), **Then** les cartes passent à 2 lignes puis au titre et aux premiers mots, sans bouger (disposition
  calculée sur la hauteur au palier « écrire ») ; au palier « situer », les répliques jamais atteintes sont réunies
  sous « ▲ JAMAIS ATTEINTES — n » (cadre, sans redisposition), et une réplique vide est marquée ▲.
- **Given** une carte `pending` (générée, à valider), **Then** son pied « à valider » porte Garder, Régénérer et
  Rejeter (board `Carte`, zone 8 ; README § 13 « Accepter / Rejeter / Régénérer »), branchés sur les actions
  existantes (`accept`, `regenerate`, `reject`).
- **Given** une réplique dont l'entrée porte une condition de visibilité, **Then** son port d'entrée est marqué « ? »
  (board `Carte`, zone 2) avec un nom accessible qui dit la condition.
- **Given** l'insertion par « / » en début de ligne (board `Carte` : réplique, didascalie, réponse, test, couper la
  carte, générer la suite), **Then** elle est **hors epic 20** (README § 15, décision 8) : c'est un menu à part
  entière dans un `<textarea>` (D4), aucune story ne la porte et le board la garde comme piste.
- **Given** l'ancienne route Graphe, **Then** elle redirige vers la vue Graphe de la scène (table de 20.5).
- **Given** une carte plus haute que l'écran, au palier « écrire », **Then** ses réponses ne sont jamais coupées (chacune porte un port) ;
  la sélectionner la fait défiler en vue, et le palier « lire » la montre entière (écart 3 à Epic 18, README § 14).
- **Given** un chemin suivi en Script, **When** on passe en Graphe (ALT+2), **Then** la dernière réplique du chemin est
  sélectionnée et centrée ; **given** une carte sélectionnée en Graphe, **when** on passe en Script (ALT+1), **then**
  le Script montre le chemin le plus court de l'ouverture jusqu'à elle (une seule source : l'état d'interface du
  chemin, A4).
- **Given** le graphe le plus grand des fixtures, **Then** NFR-P1 tient (harnais étendu en 20.2).
- **Given** le graphe de 500 répliques de 20.2, **Then** p95 glisser < 200 ms et p95 frappe < 100 ms
  (`npm run test:perf:graph`, `PERF_STRICT=1`), jugés selon le « Protocole de mesure » de
  `spec-20-2-preuve-performance-cartes-360.md`. Ce critère se mesure **sans nœuds de test** : il se juge donc une fois
  que 20.8 les a retirés, et 20.8 le rejoue. 20.2 n'a tenu ces seuils que dans ce cas (avec les nœuds de test
  actuels, le glisser prend 7 à 10 s), sur le prototype, en sortant du chemin du glisser et de la frappe : la
  reprojection du document, le journal local, la validation d'après enregistrement, les positions du glisser (hors du
  store du graphe jusqu'au lâcher), la reconstruction des nœuds inchangés du canvas (réutilisés) et la copie
  d'annulation coûteuse (ses `## Implementation Notes`) : le graphe réel doit en faire autant.

#### Story 20.8 : Tests en sorties et liens hors champ — 2,5 sessions (estimation)

**En tant qu'** auteur, **je veux** voir les 4 issues d'un test comme sorties de la réponse. (FR136, A9, board
`Graphe`)

- **Given** une réponse à test, **Then** ses 4 issues (É. CRIT, ÉCHEC, RÉUSSITE, R. CRIT) sont 4 handles colorés de
  la réponse ; plus aucun `TestNode` n'est rendu ; `testNodeSync.ts` et l'export sont inchangés (fixtures 20.1).
- **Given** les `TestNode` qui ne sont plus rendus, **When** on exporte, **Then** les 4 issues `test*Node` de chaque
  réponse à test restent dans l'export : `graphToDocument` les relit depuis les handles de la réponse, et non plus
  depuis les arêtes sortant d'un `TestNode` (`documentToGraph.ts`, filtre `edge.source.startsWith('test-node-')`). Le
  golden Vitest de 20.1 échoue tant que ce n'est pas fait ; un contrôle par mutation (retirer cette lecture fait
  échouer le golden) est fait une fois.
- **Given** les specs `e2e/graph-4-test-results.spec.ts` et `e2e/graph-test-node-generation-4results.spec.ts`, qui
  pilotent le `TestNode`, **Then** elles sont migrées vers les handles d'issue dans la même PR, pas supprimées.
- **Given** une issue sans suite, **Then** elle porte « À ÉCRIRE » ; jusqu'à 20.11 elle ouvre le panneau de génération
  actuel.
- **Given** un test sans aucune suite, **Then** il tient en une ligne « 4 ISSUES · À ÉCRIRE » qui garde un port : il
  génère les 4 issues d'un coup (coût annoncé) ; ensuite chaque issue se génère seule (lot serveur ci-dessous).
- **Lot serveur** (ajouté le 2026-11-28) : `generate-node` accepte une issue précise d'une réponse à test et n'écrit
  qu'elle (aujourd'hui une réponse à test produit toujours 4 nœuds et `GenerateNodeRequest` n'a pas de paramètre
  d'issue) ; une issue déjà écrite n'est ni écrasée ni repayée ; tests pytest.
- **Given** une réponse que l'auteur déclare « fin voulue », **Then** une métadonnée d'éditeur, retirée à l'export,
  la marque « ■ FIN » ; elle sort des comptes « à écrire » et des lots. `END` posé par défaut reste « à écrire ».
- **Given** le début de la story, **Then** une fixture golden avec une issue à `END` existe (`deferred-work.md`).
- **Given** un renvoi (`findReturnEdges`) ou une cible lointaine, **Then** le lien part par la gouttière droite de la
  carte avec un bout cliquable libellé, qui centre la cible (critère de structure, pas de fenêtre).

#### Story 20.9 : Lentille technique et popovers ancrés — 1,5 session

**En tant qu'** auteur, **je veux** la technique à un geste, sans panneau. (FR136, README § 7 « Puce mécanique »,
§ 8, boards `Technique`, `Graphe`)

- **Given** le graphe, **When** on presse L hors champ de texte, **Then** la lentille Technique s'active (conditions,
  effets, flags, ids, tags de nœud, badge GDD↑, COND.) ; L ou la bascule cliquable la retire. Réplique sur 2 lignes
  sans mise en forme, réponses sur 1 ligne, pied « ENTRÉE / POSE ». L ne sert qu'à la lentille.
- **Given** une puce (trait, test, respect, influence, fin) ou le « + » au bout de la rangée, sur la carte et dans le
  Script, **When** on clique (cible 24 px), **Then** un popover ancré, unique pour toutes les mécaniques de la réponse
  (Influence comprise), réutilise le contenu de `ChoiceEditor` / `AttributeSkillTestEditor` / `ConditionEditor` /
  `EffectEditor` ; ÉCHAP le ferme et rend le focus.
- **Given** le clavier seul, **Then** chaque puce est atteignable dans le widget composite de la carte (Epic 18 D5,
  livré par 18.9).
- **Given** cette story livrée, **Then** la valeur par défaut de `uiLayoutStore.legacyInspector` passe à faux (A14) ;
  les specs e2e qui passaient par le panneau de droite (`documents-layout-adr008`, `graph-authoring-journey` @smoke,
  `graph-connection-target-dropdown`, `graph-manual-node`, et `e2e/helpers.ts`) sont migrées vers la carte et les
  popovers dans la même PR, pas supprimées.

#### Story 20.10 : États transverses — 1 session

**En tant qu'** auteur, **je veux** que l'app me dise toujours ce qui se passe. (NFR-R3, board `Etats`)

- **Given** une session invitée, **Then** le Script et le Graphe sont en lecture avec le bandeau du board `Etats`,
  « LECTURE SEULE · MODE INVITÉ — Se connecter pour écrire », « LECTURE SEULE » en barre d'état et « Connexion requise
  pour écrire la suite » à la place de l'emplacement ; aucun champ n'est monté (règle `guest_first_auth.md`).
- **Given** une coupure réseau, **Then** la barre d'état dit « HORS LIGNE — MODIFICATIONS GARDÉES ».
- **Given** un 409 reçu **pendant** une rafale de frappe dans un champ in-situ, **Then** le texte persisté après la
  relance unique est le texte tapé (test de store qui prolonge `persistenceSlice.revisionConflict.test.ts`, en CI ;
  e2e local avec un PUT concurrent, relecture par `GET`).
- **Given** un 409 à l'enregistrement, **Then** le comportement existant (v1.9.3) s'applique : la révision serveur est
  adoptée et le document local renvoyé une fois (le dernier qui écrit l'emporte, pas de fusion fine) ; le toast
  « VERSION PLUS RÉCENTE ADOPTÉE · SAISIE RÉAPPLIQUÉE » dit que la frappe locale a été renvoyée sur la nouvelle
  révision ; rien de ce qui est tapé n'est perdu (test e2e). Une vraie fusion serait une story à part, hors epic.
- **Given** un budget atteint, **Then** la barre ou le panneau en place affiche le plafond, la date de réarmement et le
  lien « réglages du budget » ; l'écriture à la main continue. (La génération en erreur et le bouton Générer éteint
  sont des critères de 20.11.)
- **Given** une scène en chargement, un classeur vide, une scène à deux PNJ, **Then** chacun s'affiche comme sur le
  board `Etats` (filets sans spinner ; un seul bouton « Nouvelle scène » ; un point de couleur par locuteur et la
  réponse qui dit qui parle ensuite).

#### Story 20.24 : Jouer — 3,5 sessions (estimation)

**En tant qu'** auteur, **je veux** jouer ma scène comme le joueur la vivra, **afin de** vérifier les choix, les tests
et les conditions sans quitter la scène. (FR146, README § 4, § 8, § 13 « Aperçu de scénario (P) → Vue Jouer », board
`Jouer`, `Mobile`)

Estimation à recaler à la création de la story. Après 20.5 (barre de vue) et 20.6 (chemin suivi, A4).

- **Given** une scène, **When** on passe en JOUER (ALT+3), **Then** la partie démarre à l'ouverture, répliques mises
  en forme par `parse` (20.1), sans champ d'écriture monté ; le moteur est celui de l'aperçu de scénario existant
  (`scenarioPlaythroughEngine.ts`, `useScenarioPlaythrough.ts`), réutilisé et étendu, non réécrit.
- **Given** un choix verrouillé par une condition, **Then** il est affiché grisé avec sa raison en clair (variable et
  valeur attendue), comme sur le board `Jouer`.
- **Given** une réponse à test jouée, **Then** l'issue se calcule en comparant le score à la difficulté, comme le code
  actuel (`skillChecks.ts`, FR94, `graphViewStore.previewGameSystemsState`) : **pas de dé** (le « JET » et les 1 et 20
  critiques du board ne sont pas repris ; l'auteur n'a pas donné la règle du jeu, à revoir s'il la donne). Score et
  difficulté sont affichés, et l'auteur peut ensuite remplacer l'issue (É. CRIT, ÉCHEC, RÉUSSITE, R. CRIT) : l'issue
  calculée est barrée, la partie recalculée.
- **Lot moteur** (ajouté le 2026-11-28) : le moteur ignore aujourd'hui `traitRequirements`, `respectDelta`,
  `influenceDelta` et `consequences.flag` ; il les simule comme sur le board (traits du PJ saisissables, respect et
  influence envers le PNJ distincts de la réputation, flag posé à l'ouverture), avec ses tests.
- **Given** l'aperçu de scénario actuel, **Then** rien de ce qu'il offre ne disparaît, même absent du board (décision
  de l'auteur, 2026-11-28) : « État de la partie » **éditable** (flags, attributs, issue forcée ; D ouvre son tiroir),
  marque « testé » sur les choix déjà joués et liste des choix non testés, aller à la réplique (J) et au graphe (G) par
  « Ouvrir dans le script / le graphe », continuer un nœud sans réponse.
- **Given** une partie en cours, **Then** l'état de la partie (flags, variables, réputation) est visible à côté ;
  RETOUR ARRIÈRE revient d'un choix, R rejoue depuis l'ouverture sans confirmation, 1–9 choisissent (README § 8) ;
  « PARTIE · n CHOIX », la trace des choix, « Ouvrir dans le script » (CTRL+CLIC), le rail repliable et les messages
  de réponse vide et de suite manquante sont ceux du board.
- **Given** une partie jouée, **When** on repasse en Script (ALT+1), **Then** le Script montre le chemin joué (même
  état d'interface du chemin, A4 ; rien n'est écrit dans le document).
- **Given** une largeur < 768 px, **Then** Jouer est utilisable au toucher (cibles ≥ 44 px), preuve par émulation
  Playwright 375 px.
- **Given** l'ancien bouton « Aperçu de scénario (P) », **Then** il ouvre la vue Jouer ; la ligne correspondante du
  README § 13 est couverte par une spec e2e.

#### Story 20.26 : Accueil — 3 sessions (estimation)

**En tant qu'** auteur, **je veux** retrouver mes scènes et reprendre où j'en étais, **sans** perdre ce que la liste
actuelle sait faire. (README § 5, § 13, boards `Bibliotheque`, `Ambiance` écran `accueil`)

Ajoutée le 2026-11-28 (décision de l'auteur). Après 20.5 ; avant 20.11. Les couvertures viennent de 20.20.

- **Given** aucune scène ouverte, **Then** l'Accueil s'affiche comme sur le board `Bibliotheque` : « Scènes », les
  totaux « n SCÈNES · n RÉPLIQUES · n SUITES À ÉCRIRE », « Nouvelle scène ALT+N », et par scène son titre, un
  extrait, ses comptes (répliques, à valider, suites à écrire, réponses vides), sa date et sa distribution ; un filtre
  sans résultat dit « Aucune scène ne correspond » avec « Retirer les filtres ».
- **Given** une scène déjà ouverte sur ce poste, **Then** « REPRENDRE » la nomme avec la réponse et l'issue où l'auteur
  l'a laissée et l'heure (la date hors du jour même) ; ↵ y revient. La position est gardée en `localStorage` (A4),
  jamais dans le document.
- **Given** la barre de filtres, **Then** elle porte la recherche « Titre, personnage, réplique… », Collection,
  Personnage, les états (à valider, suites à écrire, avec leurs comptes) et le tri (« récentes d'abord » par défaut),
  plus les filtres **date** et **auteur** de la liste actuelle. « Avec problèmes » et le compte d'erreurs arrivent avec
  20.14 et sont absents d'ici là.
- **Lot serveur** : la liste rend les agrégats par scène (aujourd'hui `UnityDialogueMetadata` donne `node_count` et les
  locuteurs, mais ni suites à écrire, ni réponses vides, ni à valider, ni extrait), tenus à jour à l'enregistrement,
  avec un test miroir si le front les calcule aussi (A6).
- **Given** les fonctions de la liste actuelle (`UnityDialogueList`), **Then** aucune ne disparaît : collections (créer,
  modifier, supprimer, ajouter la sélection, filtrer), sélection multiple avec sa barre d'actions, export par lot et
  ses options de téléchargement, aperçu d'export, validation par lot avec ouverture de la réplique fautive, journal
  d'export ; en réutilisant les composants existants, specs e2e migrées.
- **Given** un invité, **Then** l'écran est en lecture (`guest_first_auth.md`) ; `/unity-dialogues` redirige vers
  l'Accueil (table de 20.5) et la ligne du README § 13 est cochée.

#### Story 20.27 : Réglages — 3 sessions (estimation)

**En tant qu'** auteur, **je veux** retrouver chaque réglage à une place, **afin que** le retrait de la page Générer
et de la modale Options ne me fasse rien perdre. (README § 13, boards `Reglages`, `Etats`)

Ajoutée le 2026-11-28 (décision de l'auteur). Après 20.5 et 20.25 ; avant 20.11.

- **Given** Réglages (CTRL+, ou le classeur), **Then** les sections du board sont là — Apparence, Modèles et budget,
  Notion et GDD, Raccourcis, Compte —, chaque réglage s'applique et s'enregistre seul, sans bouton Enregistrer ;
  Apparence n'apparaît qu'avec 20.16 ; l'Administration reste inchangée, liée depuis Compte.
- **Given** les onglets actuels de la modale Options, **Then** chacun a sa place et la modale est retirée : Général
  (budget, organisation du prompt), Prompts, Usage IA et Logs → Modèles et budget ; Notion, Contexte, Métadonnées et
  Vocabulaire & Guides → Notion et GDD ; Raccourcis → Raccourcis (table unique `generalShortcuts.ts`) ; mot de passe et
  Déconnexion → Compte. Un test couvre chaque fonction déplacée.
- **Given** un « réglages du budget » (boards `Etats`, `Discussion`), **Then** il ouvre Modèles et budget, qui porte
  aussi le modèle par défaut.
- **Given** l'entrée « Profils d'auteur » du classeur, **Then** un écran dans la même coque gère les **voix**
  d'écriture (créer, modifier, supprimer, partagée ou privée) et les **templates** (renommer, modifier, partager,
  supprimer, versions et restauration, suggestions, essai A/B), avec les composants existants ; invité en lecture.
- **Given** les réglages de la page Générer sans autre destination, **Then** règles du jeu, prompt système, nombre de
  réponses (libre ou plafonné) et longueur maximale vont à Modèles et budget, et les générations de la scène les
  lisent (aujourd'hui celles du graphe ne les connaissent pas ; test d'inventaire comme en 20.4) ; région et sous-lieu
  vont au lieu de la fiche de scène.
- **Given** le README § 13, **Then** les lignes « Options, Admin » et « Profils d'auteur » sont couvertes, avec leur
  spec e2e.

### Tranche 3 — l’IA dans le texte (≈ 20 sessions)

#### Story 20.11 : Emplacement à écrire et options sur place — 5 sessions (estimation)

**En tant qu'** auteur, **je veux** générer la suite là où elle manque. (FR133, FR134, A5, README § 7, boards
`Generer`, `Gestes`)

- **Given** une réponse ou une issue sans suite, en Script ou en Graphe, **Then** un emplacement « à écrire »
  l'attend ; on peut y taper directement.
- **Given** un texte tapé dans l'emplacement, **Then** c'est **la réplique**, créée et enregistrée comme telle, sans
  appel ; la consigne au modèle a un **champ distinct**, jointe à l'appel de CTRL+↵ et jamais écrite dans le document
  (le libellé du board, « Écrire la réplique…, ou décrire ce qui doit se passer… », est ambigu ; tranché par l'auteur le
  2026-11-28).
- **Lot serveur** (ajouté le 2026-11-28, avant l'interface) : le graphe diffuse le texte et la trace de raisonnement en
  direct et accepte l'interruption, en gardant le texte reçu et le coût engagé (aujourd'hui seul le flux de la page
  Générer diffuse, `api/routers/streaming.py`) ; tests pytest du contrat. La génération d'une issue seule vient de 20.8.
- **Given** l'emplacement actif, **When** on presse CTRL+↵, **Then** le coût estimé s'affiche avant (tokens et €,
  `estimate-cost`), le texte s'écrit en direct, le coût engagé pendant et réel après (en $) au même endroit ; aucun
  appel ne part avant CTRL+↵, et un double CTRL+↵ ne déclenche qu'un appel (test avec espion sur le client API). Une
  estimation qui dépasse le budget restant éteint Générer avant l'appel (gouvernance existante, 429).
- **Given** l'emplacement en cours d'écriture, **Then** la ligne « TRACE ▸ » se déplie pour montrer la trace de
  raisonnement reçue en direct (README § 7, § 13 « Colonne droite … Trace »), repliée par défaut, vide et masquée
  quand le modèle n'en fournit pas.
- **Given** une scène vide (créée par ALT+N, aucune réplique), **Then** le premier emplacement (board `Fiche`) génère
  la **réplique d'ouverture** par l'endpoint existant `POST /api/v1/dialogues/generate/unity-dialogue`, nourri par la
  fiche de scène (20.4) et non par `contextStore` ; l'appel est encadré par `capture_llm_calls()` et le nœud créé est
  annoté (`collect_node_provenance` / `annotate_generated_nodes`), comme les voies du graphe — aujourd'hui ce router
  ne le fait pas. A5 liste ce quatrième point d'entrée.
- **Given** une génération, **Then** elle produit une option par défaut ; « Variante » en ajoute une (estimation
  mise à jour), « Réessayer » remplace la courante ; `‹ 1/N ›` les fait défiler sur place ; « Garder ↵ », « Rejeter »
  (bouton), « CTRL+Z · tout retirer » ; « comparer côte à côte » ouvre la vue 2b conservée.
- **Given** une écriture en cours, **Then** « Interrompre ÉCHAP » garde ou retire ce qui est écrit ; **given** des
  options affichées, ÉCHAP les replie en les gardant (le board, où ÉCHAP rejette du texte payé, est moins bon).
- **Given** une réplique existante, ouverture comprise, **Then** « Régénérer » ajoute une variante au lieu
  d'écraser (variantes en mémoire de session jusqu'à 20.17) ; le rang de l'option est gardé au suivi d'usage.
- **Given** une génération en erreur (délai, refus), **Then** le texte reçu est gardé, la raison et le coût engagé
  restent visibles, avec Réessayer et « Garder ce qui est écrit » ; **given** un budget atteint, Générer est éteint
  avant l'appel avec sa raison.
- **Given** une option gardée, **Then** la connexion parent → nœud est faite par le front (`connectNodes`), jamais
  par l'API ; un `via_choice_index: null` ne crée pas d'arête de choix.
- **Given** un texte généré, **Then** il est teinté en permanence jusqu'à la première retouche (provenance en mémoire
  de session ici ; persistée par 20.17).
- **Then** `AIGenerationPanel`, `GenerationStreamingInline` (`frontend/src/components/generation/`, qui a remplacé
  `GenerationProgressModal`, disparue) et la page Générer sont retirés, une fois leurs destinations livrées (20.4,
  20.25 et cette story) ; l'ancien onglet Générer redirige vers le Script (table de 20.5) ; lignes README § 13
  cochées. Les réglages de la page sans destination (templates, nombre de réponses et mode, longueur maximale, règles
  du jeu, prompt système, région et sous-lieu) en ont une avant ce retrait (20.27, livrée avant, qui gère aussi les voix et les templates).
- **Given** les specs `e2e/graph-node-generation.spec.ts` et `e2e/graph-authoring-journey.spec.ts` (@smoke), qui
  passent par `AIGenerationPanel`, **Then** elles sont migrées vers l'emplacement à écrire dans la même PR, sur client
  factice ou avec budget restauré dans `finally`, pas supprimées.

#### Story 20.12 : Remplir et revoir en série — 5 sessions (estimation)

**En tant qu'** auteur, **je veux** remplir toutes les suites d'un niveau d'un coup puis les revoir, **afin de**
tenir l'arbre exponentiel. (FR141, A13, README § 7 « Tiroir Lot », board `Lot`)

- **Given** une portée (réponse, réplique, niveau, scène), **Then** le tiroir Lot affiche le nombre d'emplacements,
  les exclusions (réponses vides, répliques jamais atteintes, qui se recouvrent sur 5 emplacements dans la scène du
  forgeron) et le coût total estimé **avant** tout appel ; les portées sont calculées côté serveur à partir des jobs
  FR87/FR88.
- **Given** le tiroir, **Then** on y entre par « Remplir les suites › » ou « n SUITES À ÉCRIRE » (CTRL+MAJ+↵),
  CTRL+↵ lance et reprend ; quatre portées (réponse, réplique, niveau 1, scène), filtre « Profondeur maximale 0/1/2 »,
  suites « MARQUÉES DANS LE SCRIPT », modèle et tokens, « Interrompre » et « Abandonner le lot » ; les fins voulues
  sont exclues. La barre de lot de la sélection multiple actuelle (supprimer, taguer, valider) reste.
- **Given** un lot, **Then** chaque réplique créée arrive À VALIDER.
- **Lot serveur** (ajouté le 2026-11-28) : le job travaille par **emplacement** (parent, réponse, issue) et non par
  parent, sans le plancher de 10 parents ; il porte les portées et les filtres ; ses résultats sont appliqués au fil de
  l'eau, arrivent À VALIDER et sont retrouvés au rechargement — fermer l'application n'arrête ni ne perd rien
  (aujourd'hui l'identifiant du job n'est pas persisté et les nœuds ne sont posés qu'à la fin).
- **Prérequis** : les deux défauts relevés à l'audit sont corrigés avant — un test déjà rempli ne doit être ni
  régénéré ni repayé (`graph_generation_service.py`), et le contrôle de budget des lots ne doit plus compter un forfait
  par parent. Une session y travaille depuis le 2026-11-28.
- **Given** les exclusions, **Then** elles ont une seule définition : le serveur les calcule et le front les affiche
  telles quelles ; si le front doit les calculer aussi (diagnostics A6), un test miroir garde les deux alignés, comme
  `services/dialogue_path_context.py` et `frontend/src/utils/dialoguePathContext.ts`.
- **Given** un lot, **Then** aucun appel ne part avant la confirmation, qui affiche toujours le coût total estimé ;
  aucun seuil en euros n'est ajouté ; un lot dont l'estimation dépasse le budget restant est refusé avant tout appel
  (gouvernance de coût existante, 429), avec sa raison ; le refus se calcule sur la même estimation que celle affichée
  (emplacements × `estimate-cost`), pas sur le forfait actuel par parent.
- **Given** un lot lancé, **Then** la progression vit dans la barre d'état ; on continue d'écrire pendant le lot.
- **Given** un redémarrage du serveur pendant le lot, **Then** le job est `interrupted` et « Reprendre » ne refait
  que les emplacements restants (FR87/FR88, étendus ci-dessus).
- **Given** un lot fini, **When** on ouvre la revue en série, **Then** J / K / G / R parcourent, gardent, rejettent ;
  « TAB · À VALIDER SUIVANTE », « Réécrire CTRL+K » (réplique entière) et la correction au clic y sont disponibles.
- Les tests recalculent les comptes de la scène du forgeron, jamais recopiés du README.

#### Story 20.13 : Réécrire une sélection — 2 sessions

**En tant qu'** auteur, **je veux** demander une réécriture d'un passage sans quitter le texte. (FR135, A5, board
`Reecrire`)

- **Given** un passage sélectionné, **When** on presse CTRL+K et tape une consigne, **Then**
  `POST …/graph/rewrite-span` (nouveau, `GraphPromptContextFactory`) renvoie **trois** passages, montrés un à un en
  diff dans le texte ; ↵ lance et relance, l'estimation s'affiche avant, « Réessayer » est proposé.
- **Given** une sélection faite dans le `<textarea>` brut (D4), **When** on presse CTRL+K, **Then** le champ est
  quitté, la plage brute est projetée sur le rendu grâce aux positions `start`/`end` de `parse` (20.1), et le diff
  s'affiche dans le bloc rendu (un `<textarea>` n'affiche pas de diff stylé). Sans sélection, CTRL+K ouvre la palette
  (`ctrl+k` est déjà dans `allowedInInputs`).
- **Then** pendant le diff, TAB accepte, CTRL+→ accepte le changement suivant, ÉCHAP refuse : TAB et CTRL+→
  appartiennent au diff ; `‹ 1/3 ›` entre propositions ; CTRL+Z après acceptation ou refus, « Revoir la proposition »,
  texte accepté teinté ; la réécriture vaut aussi dans les réponses et les cartes.
- **Given** l'endpoint, **Then** tests pytest du contrat (schéma, coût estimé, erreurs 422/429/502), du prompt
  (`GraphPromptContextFactory`) et des droits (invité refusé, 403 sans droit d'édition du dialogue, aucun secret dans
  le prompt ni la réponse).

#### Story 20.14 : Diagnostics continus, relecture, aide clavier — 2,5 sessions

**En tant qu'** auteur, **je veux** voir ce qui cloche à sa place, et une aide clavier juste. (FR138, A6, README § 8,
board `Problemes`, `Gestes`)

- **Given** une modification, **When** 300 ms passent sans frappe, **Then** les diagnostics calculables sont recalculés
  sans appel réseau ; marques en place et popover à jour. Avertissements : réponse vide, réplique jamais atteinte ; les
  suites et issues à écrire restent des compteurs, jamais des problèmes.
- **Given** le popover, **Then** le groupe ERREURS porte réponse vide mais reliée, réplique introuvable et réplique
  ajoutée vide (« Écrire la réponse / Délier » en place) ; seul `validate-schema` bloque l'export (« Vérifier l'export
  Unity · VALIDATION STRICTE ») ; l'export et ses golden ne changent pas. Cycles, flags non déclarés, lore et context
  dropping restent dans leurs fenêtres actuelles, liées depuis le popover. La barre d'état dit « n ERREURS », sinon
  « n AVERTISSEMENTS », sinon « AUCUN PROBLÈME ».
- **Given** « Relire la scène · ≈ x € » en pied du popover, **Then** une seule relecture LLM **nouvelle** (qualité et
  langue), à sortie ancrée sur la réplique et le passage, arrive en notes de marge et dans le groupe RELECTURE daté ;
  le slop heuristique s'y joint sans coût ; jamais en avertissement permanent ; « ignorer » reste en mémoire de session
  jusqu'à 20.17. La note globale de qualité reste dans sa fenêtre actuelle. 2,5 sessions.
- **Given** la table unique des raccourcis (prolonge `generalShortcuts.ts` de la PR #104), **Then** l'aide « ? » est
  générée depuis elle, cherchable, et un test vérifie qu'aucune touche seule (L, J, K, G, R, ?) ne tire depuis un
  `<textarea>`.
- **Given** chaque raccourci du README § 8, **Then** il est vérifié dans Chrome, Edge et Firefox en onglet et en PWA
  installée, sous Windows ; un raccourci capté par le navigateur est remplacé avant la fusion.

#### Story 20.21 : Discuter d'une réplique avec l'IA — 2 sessions

**En tant qu'** auteur, **je veux** demander à l'IA pourquoi elle a écrit une réplique, **afin de** comprendre ses
choix avant de garder, retoucher ou régénérer. (FR144, A15, PR #103, README § 7 « Tiroir temporaire », board
`docs/design/refonte-scene/Discussion.dc.html`)

- **Given** une réplique générée et rattachée à son appel, **When** l'auteur choisit « Pourquoi ? » dans la marge du
  bloc, au pied de la carte ou dans la palette, **Then** le tiroir Discussion (380 px, ÉCHAP ferme) rouvre la dernière
  discussion de la réplique, sinon la crée au premier envoi (`POST /api/v1/ai-conversations`, sujet `dialogue_node`) ;
  « Nouvelle discussion » en ouvre une autre. Le tiroir montre « n / 40 MESSAGES », « PAS DE RÉSUMÉ DE RÉFLEXION » avec
  son explication quand il manque, la mention « EN ANGLAIS », trois questions suggérées génériques et le rang de
  l'option (« OPTION 1 SUR 4 »).
- **Then** le tiroir montre d'abord ce qui a été généré : la sortie d'origine en diff avec la réplique actuelle, le
  modèle, l'heure (la date hors du jour même), et le résumé de réflexion replié quand OpenAI l'a fourni. Le
  composant de diff est construit **ici** (sur les positions de `parse`, 20.1) et réutilisé par Versions (20.17).
- **Given** une scène ouverte, **Then** le front sait d'avance quelles répliques ont un appel rattaché par
  `GET /api/v1/llm-usage/dialogue/{dialogue_id}/costs` (un appel par scène, champ `breakdown[].node_id`, avec
  `success` vrai et `deleted` faux) ; une réplique absente de cette liste a « Pourquoi ? » grisé. Ce signal ne garantit
  pas que la trace soit rejouable (prompt ou réponse non conservés, record antérieur au suivi par appel et ambigu) :
  le `404 generation_trace_not_found` de `POST /api/v1/ai-conversations` reste l'autorité, son message est affiché et
  l'entrée grisée pour la session.
- **Then** une ligne fixe dit la limite mesurée : l'IA relit son contexte et sa réponse, pas son raisonnement ; ses
  explications sont une reconstruction.
- **Given** une question à envoyer, **Then** l'estimation en tokens et en € s'affiche avant (nouvel endpoint
  d'estimation : le service la calcule, aucune route ne l'expose) ; le champ se verrouille jusqu'à la réponse (tours en
  série) et le coût réel de chaque message s'affiche après, en dollars (`cost_usd`).
- **Given** une réplique sans appel rattaché (écrite à la main, générée avant le traçage), **Then** « Pourquoi ? » est
  grisé avec sa raison (état `sans-generation` du board `Discussion`).
- **Given** un invité, **Then** le tiroir s'ouvre verrouillé et dit pourquoi, comme l'état `invite` du board
  `Discussion` (« LECTURE SEULE · MODE INVITÉ », lien « Se connecter pour discuter ») : le back-end refuse toute
  discussion à un invité (`require_non_guest` sur la création, l'envoi et la suppression,
  `api/routers/ai_conversations.py`) et une discussion est privée à son auteur, donc un invité n'en a aucune à relire ;
  aucun appel `POST` n'est tenté.
- **Given** un lecteur connecté sans droit d'édition de la scène (partage en lecture), **Then** le tiroir s'ouvre
  verrouillé comme l'état `lecture` du même board (« LECTURE SEULE · SCÈNE PARTAGÉE »), qui explique qu'ouvrir une
  discussion exige le droit de modifier la scène, au lieu d'afficher le `403 dialogue_access_denied`.
- **Given** un budget atteint (`429 QUOTA_EXCEEDED`), une conversation pleine à 40 messages
  (`409 conversation_full`, à ne pas confondre avec le 409 de révision du document), une trace introuvable
  (`404 generation_trace_not_found`) ou une erreur du modèle (`502 llm_error`), **Then** chaque état s'affiche comme sur
  le board `Discussion` (états `budget`, `plein`, `sans-generation`, `erreur`) et le board `Etats`.
- **Given** une réplique qui a des discussions, **Then** une marque « ◆ n » apparaît dans sa marge (liste par
  `GET /api/v1/ai-conversations?dialogue_id=…&node_id=…`). La liste des discussions dans le tiroir Versions est
  livrée par 20.17, pas ici.

#### Story 20.22 : Demander depuis la palette — interface et GDD — 3 sessions

**En tant qu'** auteur, **je veux** poser une question sur l'outil ou sur le lore sans quitter la scène. (FR145, A15,
board `docs/design/refonte-scene/Discussion.dc.html`, états `palette` et `gdd`, palette de 20.25)

- **Given** la palette (CTRL+K, « Rechercher, aller à, demander… »), **When** l'auteur tape une question et choisit
  « Demander au GDD » ou « Demander comment faire dans l'outil », **Then** le tiroir Discussion s'ouvre question
  préremplie, coût affiché, envoi par CTRL+↵, sur un sujet `gdd_query` (extraits de `ContextBuilder`, montrés sous
  « EXTRAITS ENVOYÉS AU MODÈLE ») ou `ui_help` (guides d'auteur et description de l'écran ; jamais les guides de
  sécurité ou de déploiement).
- À TRANCHER AVEC L'AUTEUR (non urgent) : les guides d'auteur n'existent presque pas dans `docs/guides/`.
  Recommandation : livrer `gdd_query` seul et reporter `ui_help` tant qu'ils manquent.
- **Then** chaque réponse cite ses sources (guide, fiche du GDD) en liens cliquables ; le coût suit la règle de 20.21.
- Back-end : deux résolveurs de sujet sur le socle de la PR #103, avec leurs tests ; aucune exécution de code ni accès
  aux secrets ; invité refusé (`require_non_guest`, comme `dialogue_node`) et tiroir verrouillé côté front comme
  l'état `invite` du board.
- **Given** une question au GDD ou sur l'interface, **Then** le coût estimé vient de l'estimation du back-end pour ce
  sujet et s'affiche avant l'envoi ; aucun chiffre fixe n'est écrit dans l'interface (le board n'en montre pas : le
  coût de ces sujets n'est pas encore mesuré).

#### Story 20.15 : Retrait du panneau de droite — 0,5 session, à date

**En tant qu'** auteur, **je veux** que l'ancien panneau disparaisse quand plus rien n'en dépend. (A2, A14)

- **Given** un mois d'usage depuis la fin de la tranche 2 **et** un compteur d'ouvertures à zéro (ou décision de
  l'auteur), 20.26 étant livrée (les fonctions de liste de la section Éditer y sont), **Then** `GraphInspector`, `NodeEditorPanel` (et le protocole flush) et `UnityDialogueEditor` sont
  retirés ; l'ancien onglet Éditer redirige vers le Script (table de 20.5) ; les fenêtres ponctuelles (simulation,
  règles de contexte, systèmes de jeu) s'ouvrent depuis « Actions ▾ ».
- **Given** la table README § 13, **Then** chaque ligne dont la fonction dépend du panneau ou de l'onglet Éditer est
  cochée avec le test e2e qui la couvre (les lignes de 20.16 et 20.17 viennent après).
- **Given** les specs e2e qui dépendaient encore du panneau, **Then** elles sont migrées, pas supprimées ; seuls les
  tests unitaires des composants retirés partent avec eux.
- Si la condition n'est pas remplie, la story attend ; elle ne bloque pas la tranche 4.

### Tranche 4 — confort (≈ 14,5 sessions)

#### Story 20.16 : Papier, taille, mesure, Focus — 2 sessions

**En tant qu'** auteur, **je veux** régler la page comme un traitement de texte, **afin de** lire et écrire
longtemps sans fatigue, de jour comme de nuit. (FR139, A8, README § 9, § 10, boards `Papier`, `Focus`, `Reglages`)

- **Given** Réglages › Apparence, **Then** Nuit / Papier / suivre le système, taille 16–24 px, mesure 64 / 72 / 80,
  densité et mouvement s'appliquent sans bouton Enregistrer, gardés en local et suivis par le compte. Les transitions
  durent 100 / 160 / 240 ms (board `Gestes`).
- **Given** le Script, **Then** sa barre de vue porte « A− / A+ / Focus CTRL+\ ».
- **Given** le thème Papier, **Then** les 394 couleurs encore en dur dans 97 fichiers passent par les tokens
  (`deferred-work.md`) ; l'estimation de 2 sessions est à recaler.
- **Given** le thème Papier, **Then** chaque paire du README § 10 est testée en contraste (test automatique sur les
  tokens).
- **Given** CTRL+\ dans le Script, **Then** classeur, fiche et fil sont masqués, l'en-tête atténué, la barre d'état
  réduite à « FOCUS · ÉCHAP POUR SORTIR » (ÉCHAP ferme d'abord un champ, un popover ou un tiroir) et les blocs hors
  focus passent à 0,5 ; un clic ou une sélection rend la pleine opacité. Exception assumée à NFR-A2, écrite ici : didascalies et puces atténuées descendent à 2,6:1 (README § 10),
  parce qu'elles ne se lisent pas pendant le premier jet ; réplique et corps restent ≥ 4,2:1, et la pleine opacité
  revient au premier geste.
- **Given** `prefers-reduced-motion`, **Then** aucune transition.

#### Story 20.17 : Journal d'édition — versions, variantes, provenance — 3 sessions

**En tant qu'** auteur, **je veux** retrouver d'une session à l'autre les versions, variantes et la provenance de mes
répliques, **afin de** revenir en arrière sans rien perdre. (FR140, FR134, A12, boards `Versions`, `Gestes`)

- **Given** `GET/PUT /api/v1/documents/{id}/journal` avec sa propre `revision`/409, **Then** versions, variantes,
  provenance et notes écartées sont persistées à côté du layout, jamais lues par l'export (fixtures 20.1 inchangées),
  et une écriture du journal ne fait pas monter la révision du document.
- **Given** une réplique, **Then** une version naît à la sortie du champ si le texte a changé, et à chaque
  génération, régénération et restauration ; elle dit son type (Générée, Retouchée, Régénérée avec consigne,
  Restaurée), « OPTION n SUR N » et son nombre de mots. Le tiroir s'ouvre par « VERSIONS · n » (bloc) ou le menu de
  la carte ; invité et lecteur le lisent ; l'ancien `regenerationHistory` y est repris.
- **Given** une réplique, **When** on ouvre Versions, **Then** chaque version est en diff (composant de diff construit
  par 20.21) ; « Restaurer » crée une nouvelle version (rien n'est perdu).
- **Given** une réplique qui a des discussions avec l'IA (20.21), **Then** le tiroir Versions les liste, chacune
  ouvrant le tiroir Discussion.
- **Given** plus de 20 versions, **Then** les plus anciennes sont résumées (texte seul).

#### Story 20.18 : Téléphone, tactile et petits gestes — 4 sessions (intègre 18.10)

**En tant qu'** auteur, **je veux** relire et jouer une scène au téléphone, et que chaque geste risqué se rattrape.
(README § 9, § 12, boards `Mobile`, `Gestes`, Epic 17)

- **Given** une largeur < 768 px, **Then** Script et Jouer sont utilisables au toucher (cibles ≥ 44 px), le graphe en
  lecture, la barre d'état réduite ; on peut y écrire et « Générer la suite », coût en € affiché avant.
- **Given** une tablette (768–1024 px), **Then** l'édition in-situ au toucher suit les critères de 18.10, dont
  l'arithmétique des cibles est **refaite sur la carte de la refonte** (360 px ou 280 px plan B, réplique bornée à
  12 lignes, réponses jamais coupées, pas de hauteur maximale) et non plus sur 440 × 280 px.
- **Given** un appui long dans la zone éditable, **Then** la sélection native s'applique et le menu du nœud ne s'ouvre
  pas (exemption de `useGraphContextMenuLongPress.ts`, test Vitest).
- **Given** la preuve de la story, **Then** elle se fait par émulation Playwright (presets 375 px et 768 px) ; Marc
  vérifie sur un appareil réel en fin de tranche.
- **Given** la suppression d'une réplique ou d'une réponse, **Then** un toast d'annulation de 6 s, sans modale (la
  confirmation actuelle de nœud est retirée) ; supprimer une scène, irréversible, garde sa confirmation (le board
  « ne pose jamais de question » est moins bon là) ; **given** un état vide, **then** il dit quoi faire.

#### Story 20.19 : Mécanique tirée des catalogues — 1,5 session

**En tant qu'** auteur, **je veux** ne choisir que des traits, compétences et flags qui existent dans le jeu, **afin
qu'**une faute de frappe ne casse pas un test dans Unity. (FR142, A7, board `Technique`)

- **Given** un popover de puce, **Then** traits, compétences et flags sont autocomplétés depuis `data/UnityData/*.csv` ;
  une valeur inconnue est refusée **à la saisie** avec la raison ; les accords de genre d'un trait sont des alias
  (« Loyal » / « Loyale ») et les flags du dialogue (`dialogueFlags`) sont acceptés en plus du catalogue ; le popover
  porte aussi « Caractéristique » (board `Graphe`).
- **Given** une valeur inconnue **déjà présente** dans un document, **Then** elle reste affichée et signalée, et
  n'empêche pas l'enregistrement automatique (mode brouillon) ; seul l'export strict la refuse, comme aujourd'hui.
- **Given** un renommage (trait, compétence ou flag), **Then** l'auteur choisit la portée — document courant ou tous
  les dialogues —, voit avant d'appliquer la liste des occurrences (dialogue, réplique, réponse), et le renommage
  s'applique en une transaction annulable (CTRL+Z pour le document courant) ; un renommage vers une valeur absente du
  catalogue est refusé.

#### Story 20.20 : Ambiance — teinte de lieu, portraits, couvertures — 3 sessions

**En tant qu'** auteur, **je veux** que chaque scène ait la couleur de son lieu et les visages de ses personnages,
**afin d'**avoir envie d'y écrire, sans que l'outil perde son unité. (FR143, A16, board
`docs/design/refonte-scene/Ambiance.dc.html`, repris sur le canvas de la refonte)

**Dépendances** : après 20.4 (lieu et distribution dans la fiche), 20.5 (cartes de l'Accueil), 20.6 (marge des
répliques du Script), 20.3 (variables CSS) et 20.16 (thème Papier ; sinon le critère Papier ci-dessous attend 20.16).
Côté back-end, la copie des images à la synchro Notion suit `.claude/rules/gdd_notion_sync_builder.md`.

- **Given** Réglages › Apparence, **Then** Ambiance se règle sur Pleine (défaut), Réduite (teinte et initiales, aucune
  image chargée) ou Aucune, appliquée et enregistrée seule.
- **Given** la fiche, **Then** elle porte le bandeau et le filigrane du board ; la teinte se choisit dans la fiche.
- À TRANCHER AVEC L'AUTEUR (non urgent) : la source des images (18 fiches seulement ont une URL, ni Grish ni
  Uresaïr). Recommandation : dépôt manuel d'images par fiche, la synchro Notion en complément.
- **Given** une fiche de scène avec un lieu, **Then** la scène prend la teinte du lieu (huit teintes de même clarté et
  saturation, hors de la zone du bleu d'action) sur le fond du bandeau et de la zone de lecture, le point du lieu au
  classeur et la puce de lieu ; aucun texte courant n'est teinté ; le bleu reste seul pour l'action et la sélection.
- **Given** un personnage qui a un portrait, **Then** il apparaît dans la puce de la fiche (28 px), dans la marge de
  ses répliques (44 px) et sur les cartes de l'accueil ; sinon une pastille de couleur avec initiales.
- **Given** l'accueil, **Then** Couvertures (board `Ambiance`, défaut) et Liste (board `Bibliotheque`) se choisissent,
  choix mémorisé ; chaque scène a une couverture : illustration propre à la scène, sinon du lieu, sinon portrait du PNJ sur la
  teinte du lieu, sinon pastille « lieu et portrait à renseigner ».
- **Given** une image importée, **Then** elle est copiée à la synchro Notion (les URL de fichiers Notion expirent),
  retouchée une fois (même désaturation et assombrissement pour toutes), exportée en WebP (portrait 192 px, couverture
  960 × 540, 200 Ko au plus) et servie par l'API ; aucun filtre, masque, flou ni animation CSS en direct.
- **Given** le graphe de 500 répliques, **Then** NFR-P1 tient avec l'ambiance (harnais de 20.2) ; un effet qui coûte
  plus de 5 % du p95 load mesuré sans ambiance par ce même harnais est retiré ; au palier « écrire » seulement un médaillon de 20 px par carte, rien aux paliers « lire »
  et « situer ».
- **Given** le thème Papier, **Then** les mêmes teintes à clarté 0,50 tiennent 4,5:1 (calculé : braise `#8e5224`
  5,5:1, ardoise `#2b6d7c` 5,2:1, cendre `#6a6257` 5,4:1).

#### Story 20.23 : Notes d'intention — expérience mesurée — 1 session

**En tant qu'** auteur, **je veux** savoir si l'IA peut noter son intention au moment où elle écrit, **afin d'**avoir un
« pourquoi » fiable plutôt qu'une reconstruction. (FR144, option C de `docs/architecture/conversations-ia.md`)

Après 20.17 : l'intention se range dans le journal d'édition, que 20.17 livre.

- **Given** 20 suites générées avec et sans champ d'intention (≈ 100–200 tokens de plus, ≈ 0,001–0,002 $ par nœud),
  **When** un juge les note à l'aveugle comme pour le choix de GPT-6.2 Sol, **Then** l'intention n'est activée par
  défaut que si la qualité ne baisse pas ; elle est alors rangée dans le journal d'édition (A12), jamais exportée, et
  montrée en tête du tiroir Discussion comme « intention déclarée à la génération ».
- À TRANCHER AVEC L'AUTEUR (non urgent) : qui juge et à quel seuil. Recommandation : juge LLM à l'aveugle puis
  relecture d'un échantillon par l'auteur ; activation si la moyenne ne baisse pas de plus de 0,3 point sur 10.

---

### Chemin critique et tailles

| Bloc | Sessions | Peut commencer |
|---|---|---|
| Tranche 1 (20.1–20.3) | ≈ 5 | **maintenant** |
| Tranche 1 bis (18.4 reste, 18.8, 18.5a) | ≈ 3,5 | **maintenant**, en parallèle de la tranche 1 |
| Tranche 2 (20.4–20.10, 20.24, 20.25, 20.26, 20.27, et 18.5b, 18.6, 18.7, 18.9, 18.11) | ≈ 37 | après la tranche 1 bis **et** 20.2 ; 20.4 dès la fin de 20.1 ; 18.5b après 20.6 et 20.7 |
| Tranche 3 (20.11–20.15, 20.21, 20.22) | ≈ 20 | après 20.6, 20.8, 20.25, 20.26 et 20.27 ; 20.21 : PR #103 déjà fusionnée |
| Tranche 4 (20.16–20.20, 20.23) | ≈ 14,5 | après 20.3 ; 20.17 après 20.11 et 20.21 ; 20.23 après 20.17 (l'intention se range dans le journal) ; 20.20 après 20.4, 20.5, 20.6 et 20.16 |

Chemin critique : tranche 1 → tranche 2 → tranche 3 → tranche 4 ≈ **77 sessions** (≈ 74 si 20.4 se fait pendant la
tranche 1), la tranche 1 bis se faisant pendant la tranche 1. Écart avec les 57 de la première rédaction : stories
ajoutées (20.24 Jouer, 20.25 Contexte / Fiches / palette), 20.4 portée à 3 sessions (interface de la fiche), 20.14 à
2,5 (relecture « langue »), 20.19 à 1,5 (renommage) ; 18.4 réduite à son reste. Le 2026-11-28, les réponses de l'auteur à
l'audit de la maquette ajoutent ≈ 13 sessions : travaux serveur et moteur (20.8 +1, 20.11 +2, 20.12 +2, 20.24 +1,5),
fonctions actuelles gardées (20.25 +0,5), stories 20.26 et 20.27 (+6). Les tailles sont des estimations, à recaler
après les deux premières stories.

**Par où commencer (trois sessions en parallèle, sans fichier commun)** : 20.2 (la preuve de fluidité décide du plan
B), 20.1 (conversion et fixtures d'export) et 18.4 (reste à faire de l'annulation). Puis 18.8, 20.3, 18.5a, et 20.4
dès la fin de 20.1.

### Garde-fous

1. **Inventaire avant suppression** : aucun écran ni panneau retiré sans sa ligne cochée dans README § 13.
2. **Export golden en CI** à chaque PR (fixtures 20.1), plus contrôle local sur les 36 dialogues avant chaque tranche.
3. **Preuve UI** de chaque story par parcours réel (créer une scène, écrire, générer, jouer), pas seulement par tests
   unitaires.
4. **Une tranche = au plus quelques PR fusionnables** ; pas de branche longue (leçon de `refonte-ui-2026`, 54 commits
   d'avance).
5. **Réversibilité** : panneau de droite derrière un drapeau jusqu'à 20.15 ; redisposition LR réversible (layout).
