# Epic 20 Context: Refonte « Scène » — une scène, un texte, trois vues

<!-- Compiled from planning artifacts. Edit freely. Regenerate with compile-epic-context if planning docs change. -->

## Goal

L'auteur n'ouvre plus « Générer », « Éditer » ou « Graphe » : il ouvre une **scène**. Elle porte sa distribution et son contexte (fin du contexte GDD global, cause du bug du 2026-11-19 où une suite a été générée avec le PNJ d'une autre scène), se lit et s'écrit comme un scénario (SCRIPT), se structure dans un graphe dont les cartes portent le texte (GRAPHE) et se joue (JOUER). L'IA devient un geste dans le texte, la technique est à un geste, le panneau de droite disparaît. Valeur : lire et écrire une scène entière sans quitter le texte ni ouvrir de panneau, en voyant à tout moment ce qui reste à écrire et ce que le modèle saura. Epic prioritaire ; elle intègre Epic 18 (édition in-situ) et remplace Epic 19. Sources de vérité : `docs/design/refonte-scene/README.md` (+ boards `*.dc.html`), `docs/architecture/refonte-scene-architecture.md` (A1–A16), `_bmad-output/test-artifacts/test-design-epic-20.md`. La spec UX de `planning-artifacts/ux-design-specification/` est remplacée (seule la charte reste) ; `planning-artifacts/architecture/` ne porte aucune décision de cette refonte.

## Stories

- Tranche 1 : 20.1 Conversion texte ↔ blocs et export golden en CI · 20.2 Preuve de performance (cartes 360 px, flux LR, paliers) · 20.3 Tokens en variables CSS, thème Nuit seul
- Tranche 1 bis (reprise d'Epic 18) : 18.4 Annulation (reste à faire) · 18.8 Indicateur d'enregistrement · 18.5a Champ d'écriture seul, hors graphe
- Tranche 2 : 20.4 Fiche de scène dans le document · 20.5 Enveloppe (en-tête, classeur, barre de vue, barre d'état) · 20.25 Tiroir Contexte, écran Fiches du GDD, palette · 20.6 Vue Script · 20.7 Graphe à cartes de texte, flux gauche → droite · 18.5b, 18.6, 18.7 Champ monté, réponses, en-têtes · 20.8 Tests en sorties et liens hors champ · 18.9 Clavier · 20.9 Lentille technique et popovers ancrés · 18.11 · 20.10 États transverses · 20.24 Jouer
- Tranche 3 : 20.11 Emplacement à écrire et options sur place · 20.12 Remplir et revoir en série · 20.13 Réécrire une sélection · 20.14 Diagnostics continus, relecture, aide clavier · 20.21 Discuter d'une réplique avec l'IA · 20.22 Demander depuis la palette · 20.15 Retrait du panneau de droite (à date)
- Tranche 4 : 20.16 Papier, taille, mesure, Focus · 20.17 Journal d'édition · 20.18 Téléphone et tactile (intègre 18.10) · 20.19 Mécanique tirée des catalogues · 20.20 Ambiance · 20.23 Notes d'intention (expérience mesurée)

## Requirements & Constraints

- **Export Unity identique octet pour octet** pour un document inchangé : golden **double** (pytest + Vitest) : cinq sorties figées, un fichier attendu par chemin (`tests/fixtures/unity_dialogues/expected/<chemin>/`) : `python-graphe` (route `save-and-write` sur `front-payload`), `python-lot`, `front-canonique`, `front-invite`, `front-payload` ; Vitest régénéré avant pytest, marqueur `p0`, à chaque PR. Les golden sont générés depuis le code actuel avant tout changement ; une correction d'export régénère le golden dans une PR à part.
- **Aucune perte de saisie** : sauvegarde au fil de la frappe, jamais de bouton Enregistrer ; 409 = révision serveur adoptée puis une relance (dernier qui écrit l'emporte, pas de fusion fine).
- **Seuils (ADR-008, palier confort, poste Windows de l'auteur, `PERF_STRICT=1`, harnais `e2e/perf-document-load.spec.ts` étendu)** : p95 load < 3 s sous 500 nœuds, p95 frappe < 100 ms, p95 drag < 200 ms ; zoom/défilement : p95 images ≤ 16 ms et aucune tâche longue > 50 ms. Aucun autre chiffre à inventer en story.
- **Coût** : estimation toujours affichée avant tout appel (en €), engagé/réel en $ ; aucun appel avant le geste explicite ; budget dépassé ⇒ refus avant l'appel (gouvernance existante, 429). Pas de seuil en euros pour les lots. E2E de génération sur client factice ou budget restauré ; un worktree hérite du `.env` principal (vider `OPENAI_API_KEY`).
- **Accessibilité** : tout au clavier, contraste AA (exception écrite du mode Focus), nom accessible pour tout élément interactif nouveau ; lecteur d'écran de référence NVDA. Cibles ≥ 24 px, ≥ 44 px sous 1024 px. Tactile prouvé par émulation Playwright 375/768 px.
- **Invité** : lecture seule partout, aucun champ monté ; discussions IA refusées.
- **Définition de « fini » commune** : tests ciblés verts, lint et typecheck à zéro, T2 avant PR ; preuve UI (Playwright ou capture comparée au board) ; états du board `Etats` traités ; aucun écran retiré sans sa ligne cochée au README § 13 ; spec e2e cassée **migrée**, jamais supprimée (7 specs couplées au panneau/TestNode + `e2e/helpers.ts`). La CI ne rejoue aucun parcours e2e : tout invariant de donnée descend en Vitest/pytest.

## Technical Decisions

- **Fiche de scène (A1)** : clé `scene` (PNJ/PJ par `entryId` = `notion_page_id`, lieu, brief, tons, profil d'auteur, fiches liées, budget). Additive ; déduite une fois par `resolveGraphGenerationDramatis` puis enregistrée au premier geste. Sur disque dans `Assets/Scenes/{id}.scene.json`, même transaction/révision que le document ; jamais dans `Assets/Dialogue/{id}.json` ni dans aucun des trois chemins d'export. Toute génération lit la fiche ; `contextStore` ne garde que le hors-scène. Le `speaker` reste une chaîne : rapprochement de graphies proposé, jamais réécrit sans l'auteur. Une scène est créée côté serveur (ALT+N) avant toute génération.
- **Un seul écrivain du texte (A2, A14)** : le `<textarea>` non contrôlé d'Epic 18 (D4) est l'unique surface d'écriture, carte et bloc de script, via `updateNode` transactionnel. Dès 18.5b, `NodeEditorPanel` et `UnityDialogueEditor` passent en lecture seule pour `line`, `speaker`, `title`, `choices[].text` et leur flush n'écrit plus ces champs. Panneau derrière `uiLayoutStore.legacyInspector` (vrai par défaut jusqu'à 20.9, compteur d'ouvertures).
- **Texte ↔ blocs (A3)** : `parse`/`serialize` purs, affichage seulement, stockage inchangé ; `serialize(parse(x)) === x` ; blocs avec positions `start`/`end` (clic → curseur, diff, provenance). `parse` remplace `splitDialogueLine` ; `*` non fermé reste du texte. Sortir d'un champ sans frappe n'écrit rien.
- **Script = projection (A4)** : chemin suivi `[{choiceIndex, outcome}]` en état d'interface, jamais dans le document ; compteurs dérivés en une passe ; mot = `/[\p{L}\p{N}_]+/gu`.
- **IA (A5)** : `generate-node`, `regenerate`, nouveau `rewrite-span` (via `GraphPromptContextFactory`), et `generate/unity-dialogue` pour l'ouverture (à compléter : fiche + `capture_llm_calls`/`annotate_generated_nodes`). Connexion parent → nœud par le front (`connectNodes`) ; `via_choice_index: null` ≠ choix.
- **Diagnostics (A6)** : calculables en front (300 ms, sans réseau) ; jugements LLM à la demande seulement.
- **Graphe (A9, A10)** : dagre `LR`, redisposition une fois par dialogue, positions précédentes gardées dans le layout ; `TestNode` plus rendus, 4 issues = handles de la réponse, `graphToDocument` doit relire `test*Node` depuis ces handles ; paliers calculés à `onMoveEnd` dans `graphViewStore`, carte en écriture exemptée. Plan B si 20.2 échoue : 280 px, dépliage à la sélection.
- **Tokens (A8)** : `redesignTokens.ts` publiés en variables CSS sur `:root`, Papier = `[data-theme="papier"]`.
- **Journal d'édition (A12)** : `journal/<dialogueId>.json` via `GET/PUT /documents/{id}/journal`, révision et 409 propres, jamais lu par l'export, 20 versions max. **Lots (A13)** : jobs FR87/FR88 existants, exclusions calculées serveur. **Discussions (A15)** : back-end PR #103, tiroir unique. **Ambiance (A16)** : 8 teintes OKLCH hors bleu d'action, images WebP copiées à la synchro.
- **Raccourcis** : CTRL jamais ⌘ ; ALT+1/2/3 vues, ALT+N nouvelle scène, L lentille, CTRL+K palette (réécriture sur sélection), CTRL+↵ générer, CTRL+\ Focus ; table unique `generalShortcuts.ts`, aucune touche seule ne tire depuis un `<textarea>`.

## UX & Interaction Patterns

- Enveloppe : en-tête 48 px, classeur 252 px (rail < 1280 px), fiche compacte, barre de vue SCRIPT · GRAPHE · JOUER à place fixe, barre d'état 28 px (ENREGISTRÉ · PROBLÈMES · CONTEXTE · TOKENS / RÉPLIQUE · MODÈLE · LOT ··· MOTS · LECTURE · ? RACCOURCIS), chaque élément ouvrant son détail sur place. Changer de vue ne déplace rien sous le curseur.
- Carte 360 px : réplique bornée à 12 lignes (défilement interne une fois sélectionnée), réponses jamais coupées, un port par réponse, 4 issues colorées ; paliers écrire ≥ 75 % · lire 40–75 % · situer < 40 %, sans trou.
- Tiroirs temporaires 380 px (Contexte, Versions, Lot, Discussion) et popovers ancrés : ÉCHAP ferme et rend le focus ; jamais de panneau permanent.
- Charte maintenue : un seul bouton plein bleu par écran, Instrument Serif pour les répliques, Instrument Sans pour l'interface, IBM Plex Mono pour chiffres et états ; un état n'est jamais porté par la couleur seule. Aucun chiffre inventé dans l'interface. Le modèle de dialogue est un arbre exponentiel (test = 4 issues) ; ne jamais généraliser depuis l'import Voknir.
- Valeurs exactes dans les attributs `style` des boards `docs/design/refonte-scene/*.dc.html` (serveur `design-refonte-scene`, port 8973).

## Cross-Story Dependencies

- 20.1 précède tout (golden et `parse` utilisés par 18.5a, 20.4, 20.8, 20.13, 20.21) ; 20.2 décide plan A/B avant la tranche 2 ; 20.4 démarrable dès la fin de 20.1.
- Ordre tranche 2 : 20.4 → 20.5 → 20.25 → 20.6 → 20.7 → 18.5b → 18.6 → 18.7 → 20.8 → 18.9 → 20.9 → 18.11 → 20.10 → 20.24.
- 20.5 pose la table de redirection des anciennes routes ; Graphe → 20.7, Générer → 20.11, Éditer → 20.15. 20.9 bascule `legacyInspector` à faux.
- 20.25 avant 20.11 (qui retire la page Générer) ; tranche 3 après 20.6, 20.8 et 20.25 ; 20.21 construit le composant de diff réutilisé par 20.17 ; 20.23 après 20.17 ; 20.20 après 20.3, 20.4, 20.5, 20.6 et 20.16 ; 20.15 attend un mois d'usage avec compteur à zéro.
- Dépendances externes : Epic 16 (document canonique, `choiceId`, harnais perf), Epic 17 (responsive), jobs FR87/FR88, PR #103 fusionnée. 18.4 : cœur déjà livré (`61462f0a8`) ; ne reste que CTRL+Z/Y dans un champ, `allowedInInputs` et l'annonce ARIA.
