# Epic 20 Context: Refonte « Scène » — une scène, un texte, trois vues

<!-- Compiled from planning artifacts. Edit freely. Regenerate with compile-epic-context if planning docs change. -->

## Goal

L'auteur n'ouvre plus « Générer », « Éditer » ou « Graphe » : il ouvre une **scène**, qui porte sa distribution et son contexte (fin du contexte GDD global), se lit et s'écrit comme un scénario (SCRIPT), se structure dans un graphe dont les cartes portent le texte (GRAPHE) et se joue (JOUER). L'IA devient un geste dans le texte, la technique est à un geste, le panneau de droite disparaît. Valeur : lire et écrire une scène entière sans changer d'écran, en voyant ce qui reste à écrire et ce que le modèle saura. Epic prioritaire ; elle intègre Epic 18 (édition in-situ) et remplace Epic 19. Sources de vérité : `docs/design/refonte-scene/README.md` et ses boards `*.dc.html`, `docs/architecture/refonte-scene-architecture.md` (A1–A16), `_bmad-output/test-artifacts/test-design-epic-20.md`.

## Stories

- Tranche 1 : 20.1 Conversion texte ↔ blocs et export golden en CI · 20.2 Preuve de performance (cartes 360 px, flux LR, paliers) · 20.3 Tokens en variables CSS, thème Nuit seul
- Tranche 1 bis (critères dans `epic-18.md`) : 18.4 Annulation (reste à faire) · 18.8 Indicateur d'enregistrement · 18.5a Champ d'écriture seul, hors graphe
- Tranche 2 : 20.4 Fiche de scène · 20.5 Enveloppe (en-tête, classeur, barres) · 20.25 Tiroir Contexte, Fiches du GDD, palette · 20.6 Vue Script · 20.7 Cartes de texte, flux gauche → droite · 18.5b, 18.6, 18.7 Champ monté, réponses, locuteur et titre · 20.8 Tests en sorties, liens hors champ · 18.9 Clavier · 20.9 Lentille technique, popovers · 18.11 Non-régression · 20.10 États transverses · 20.24 Jouer
- Tranche 3 : 20.11 Emplacement à écrire, options sur place · 20.12 Remplir et revoir en série · 20.13 Réécrire une sélection · 20.14 Diagnostics, relecture, aide clavier · 20.21 Discuter d'une réplique avec l'IA · 20.22 Demander depuis la palette · 20.15 Retrait du panneau de droite
- Tranche 4 : 20.16 Papier, taille, mesure, Focus · 20.17 Journal d'édition · 20.18 Téléphone et tactile (intègre 18.10) · 20.19 Mécanique tirée des catalogues · 20.20 Ambiance · 20.23 Notes d'intention

## Requirements & Constraints

- **Export Unity identique octet pour octet** pour un document inchangé : golden pytest et Vitest (marqueur `p0`, chaque PR) ; régénération Vitest d'abord, puis pytest ; une correction d'export part dans une PR à part.
- **Aucune perte de saisie** : sauvegarde au fil de la frappe, jamais de bouton Enregistrer ; 409 = révision serveur adoptée puis une relance (pas de fusion fine).
- **Seuils** (poste Windows de l'auteur, `PERF_STRICT=1`) : p95 load < 3 s sous 500 nœuds, frappe < 100 ms, glisser < 200 ms ; zoom : p95 images ≤ 16 ms, aucune tâche longue > 50 ms. N'en inventer aucun autre.
- **Coût** : estimation affichée avant tout appel LLM (€), engagé et réel en $ ; aucun appel sans geste explicite ; budget dépassé = refus avant l'appel.
- **Accessibilité** : tout au clavier, contraste AA (seule exception : mode Focus), nom accessible pour tout élément interactif nouveau (NVDA) ; cibles ≥ 24 px, ≥ 44 px sous 1024 px.
- **Invité** : lecture seule, aucun champ monté.
- **Fini** : tests ciblés verts, lint et typecheck à zéro, T2 avant PR ; preuve UI comparée au board cité ; états du board `Etats` traités ; aucun écran retiré sans sa ligne cochée au README § 13 ; spec e2e cassée migrée, jamais supprimée. La CI ne lance aucun e2e fonctionnel : les invariants de données se testent en Vitest/pytest.

## Technical Decisions

- **Inchangé** : document canonique Unity JSON (`revision`, `choiceId`, layout distinct), construction du prompt, structured output.
- **Tokens (A8, 20.3)** : chaque token de `redesignTokens.ts` publié en variable CSS sur `:root` ; les styles inline lisent `var(--…)`. Migration mécanique des fichiers déjà sur `redesignTokens` (environ 88, tests compris) ; ceux sur `theme.ts` suivent écran par écran, plus tard. 20.3 livre Nuit seul, sans changement visuel (écrans 1c, 2a–2e identiques avant/après, tolérance antialiasing). Aucun outil de comparaison d'images au dépôt : test Vitest des valeurs publiées, plus captures Playwright headless dans `tmp/` relues. Papier (20.16) ne sera qu'un jeu de valeurs sous `[data-theme="papier"]`.
- **Fiche de scène (A1)** : clé `scene` (PNJ, PJ, lieu par `entryId` Notion, brief, tons, profil, budget), stockée dans `Assets/Scenes/{id}.scene.json` (même transaction et révision), jamais exportée. Toute génération la lit, pas `contextStore`. Aucun `speaker` réécrit sans l'auteur.
- **Un seul écrivain du texte (A2, A14)** : `<textarea>` non contrôlé unique (carte et Script), via `updateNode` transactionnel. Dès 18.5b, `NodeEditorPanel` et `UnityDialogueEditor` passent en lecture seule pour le texte. Panneau derrière `uiLayoutStore.legacyInspector`, vrai jusqu'à 20.9.
- **Texte ↔ blocs (A3, livré par 20.1)** : affichage seulement, chaîne stockée inchangée ; positions `start`/`end` pour curseur, diff, provenance.
- **Script (A4)** : projection d'un chemin tenu en état d'interface, jamais dans le document.
- **IA (A5)** : toute génération passe par l'estimation ; connexion parent → nœud faite par le front ; nouveau `rewrite-span`.
- **Graphe (A9, A10)** : dagre `LR` (positions précédentes gardées), `TestNode` non rendus (4 issues = handles de la réponse), paliers calculés à la fin du zoom.
- **Plus tard** : diagnostics calculables en front sans réseau (A6) ; journal d'édition à révision propre, jamais exporté (A12) ; lots sur les jobs FR87/FR88 (A13) ; discussions sur le back-end existant (A15) ; huit teintes de lieu en variables CSS (A16).

## UX & Interaction Patterns

- Enveloppe : en-tête 48 px, classeur 252 px (rail < 1280 px), fiche compacte, vues SCRIPT · GRAPHE · JOUER à place fixe, barre d'état 28 px dont chaque élément ouvre son détail sur place.
- Carte 360 px : réplique bornée à 12 lignes, réponses jamais coupées, un port par réponse ; paliers écrire ≥ 75 %, lire 40–75 %, situer < 40 %.
- Tiroirs temporaires 380 px et popovers ancrés : ÉCHAP ferme et rend le focus ; aucun panneau permanent.
- Charte maintenue (couleurs, polices, filets, un seul bouton plein bleu) ; Nuit inchangé ; un état n'est jamais porté par la couleur seule ; aucun chiffre inventé dans l'interface.
- Raccourcis en CTRL (jamais ⌘) : ALT+1/2/3 vues, ALT+N nouvelle scène, L lentille, CTRL+K palette ou réécriture, CTRL+↵ générer, CTRL+\ Focus.
- Valeurs exactes dans les attributs `style` des boards (config `design-refonte-scene`, port 8973). La spec UX et l'architecture de `planning-artifacts/` ne s'appliquent pas (seule la charte de `design-system-foundation.md` reste).

## Cross-Story Dependencies

- 20.1 et 20.2 livrées. 20.2 a retenu le **plan A (360 px)**, sur un prototype sans nœuds de test, avec peu de marge sur le glisser en vue ajustée. 20.7 doit reprendre ses optimisations et son protocole (`spec-20-2-preuve-performance-cartes-360.md`) ; ses seuils de glisser et de frappe se jugent une fois les nœuds de test retirés (20.8).
- Ordre tranche 2 : 20.4 → 20.5 → 20.25 → 20.6 → 20.7 → 18.5b → 18.6 → 18.7 → 20.8 → 18.9 → 20.9 → 18.11 → 20.10 → 20.24.
- 20.5 pose les redirections des anciennes routes, activées par 20.7 (Graphe), 20.11 (Générer), 20.15 (Éditer). 20.25 précède 20.11, qui retire la page Générer.
- Tranche 3 après 20.6, 20.8 et 20.25 ; 20.21 construit le diff réutilisé par 20.17 ; 20.23 après 20.17 ; 20.20 après 20.3–20.6 et 20.16 ; 20.15 attend un mois d'usage avec compteur d'ouvertures à zéro (ou décision de l'auteur).
