# Epic 20 Context: Refonte « Scène » — une scène, un texte, trois vues

<!-- Compiled from planning artifacts. Edit freely. Regenerate with compile-epic-context if planning docs change. -->

## Goal

L'auteur n'ouvre plus « Générer », « Éditer » ou « Graphe » mais une **scène**, qui porte sa distribution et son contexte (fin du contexte GDD global) et se lit (SCRIPT), se structure (GRAPHE) et se joue (JOUER). L'IA devient un geste dans le texte, le panneau de droite disparaît. Epic prioritaire ; elle intègre Epic 18 et remplace Epic 19. Sources de vérité : `docs/design/refonte-scene/` (README et boards), `docs/architecture/refonte-scene-architecture.md` (A1–A16), `_bmad-output/test-artifacts/test-design-epic-20.md`.

## Stories

- Tranche 1 (livrée) : 20.1 Texte ↔ blocs et export golden · 20.2 Preuve de performance · 20.3 Tokens en variables CSS
- Tranche 1 bis (critères dans `epic-18.md`) : 18.4 Annulation · 18.8 Indicateur d'enregistrement · 18.5a Champ d'écriture seul
- Tranche 2 : 20.4 Fiche de scène · 20.5 Enveloppe · 20.25 Contexte, Fiches du GDD, palette · 20.6 Vue Script · 20.7 Cartes de texte · 18.5b, 18.6, 18.7 Édition in-situ · 20.8 Tests en sorties · 18.9 Clavier · 20.9 Lentille technique · 18.11 Non-régression · 20.10 États transverses · 20.24 Jouer
- Tranche 3 : 20.11 Emplacement à écrire · 20.12 Remplir en série · 20.13 Réécrire une sélection · 20.14 Diagnostics, aide clavier · 20.21 Discuter avec l'IA · 20.22 Demander depuis la palette · 20.15 Retrait du panneau
- Tranche 4 : 20.16 Papier, Focus · 20.17 Journal d'édition · 20.18 Téléphone et tactile · 20.19 Catalogues mécaniques · 20.20 Ambiance · 20.23 Notes d'intention

## Requirements & Constraints

- **Export Unity identique octet pour octet** pour un document inchangé : golden pytest et Vitest (`p0`, chaque PR) sur `tests/fixtures/unity_dialogues/` ; régénération Vitest d'abord, puis pytest ; une correction d'export part dans une PR à part.
- **Aucune perte de saisie** : sauvegarde au fil de la frappe, jamais de bouton Enregistrer ; 409 = révision serveur adoptée puis une relance.
- **Seuils** (poste Windows de l'auteur, `PERF_STRICT=1`) : p95 load < 3 s sous 500 nœuds, frappe < 100 ms, glisser < 200 ms ; zoom : p95 images ≤ 16 ms, aucune tâche longue > 50 ms. N'en inventer aucun autre.
- **Coût** : estimation (€) avant tout appel LLM, dépense engagée et réelle en $ ; aucun appel sans geste explicite ; budget dépassé = refus avant l'appel.
- **Accessibilité** : tout au clavier, contraste AA, nom accessible pour tout élément interactif nouveau (NVDA) ; cibles ≥ 24 px, ≥ 44 px sous 1024 px.
- **Invité** : lecture seule, aucun champ monté.
- **Fini** : tests ciblés verts, lint et typecheck à zéro, T2 avant PR ; preuve UI comparée au board cité ; états du board `Etats` traités ; aucun écran retiré sans sa ligne cochée au README § 13 ; spec e2e cassée migrée, jamais supprimée. La CI ne lance aucun e2e fonctionnel : les invariants de données se testent en Vitest/pytest.

## Technical Decisions

- **Inchangé** : document canonique Unity JSON (`revision`, `choiceId`, layout distinct), construction du prompt, structured output.
- **Fiche de scène (A1)** : clé `scene` (PNJ, PJ, lieu, brief, tons, profil d'auteur, fiches liées, budget) ; fiches du GDD désignées par `entryId` = `notion_page_id`. Dans le contrat HTTP mais **jamais** dans `Assets/Dialogue/{id}.json` (copié dans Unity) : compagnon `Assets/Scenes/{id}.scene.json`, même transaction et même révision ; absente de tout export. Sans `scene`, le document reste valide ; la fiche est déduite une fois et montrée pour correction.
- **Génération** : toute génération lit la fiche, plus les sélections globales de `contextStore` (réservé au catalogue et au hors-scène). Aucun `speaker` réécrit sans l'auteur.
- **Un seul écrivain du texte (A2, A14)** : un `<textarea>` non contrôlé unique (carte et Script), via `updateNode` transactionnel. Dès 18.5b, `NodeEditorPanel` et `UnityDialogueEditor` sont en lecture seule pour le texte. Panneau derrière `uiLayoutStore.legacyInspector`, vrai jusqu'à 20.9.
- **Texte ↔ blocs (A3, livré)** : affichage seulement, chaîne stockée inchangée ; positions `start`/`end` pour curseur, diff, provenance.
- **Script (A4)** : projection d'un chemin tenu en état d'interface, jamais dans le document.
- **IA (A5)** : toute génération passe par l'estimation ; connexion parent → nœud faite par le front.
- **Graphe (A9, A10)** : dagre `LR` (positions précédentes gardées), `TestNode` non rendus (4 issues = handles de la réponse), paliers calculés à la fin du zoom.
- **Thèmes (A8, livré)** : valeurs dans `theme/tokenValues.ts` ; couleurs et ombre lues par `var()`, via `redesignTokens`. Papier (20.16) ne sera qu'un second jeu de valeurs.

## UX & Interaction Patterns

- Enveloppe : en-tête 48 px, classeur 252 px (rail < 1280 px), fiche compacte en une ligne et dépliable, vues SCRIPT · GRAPHE · JOUER à place fixe, barre d'état 28 px.
- Carte 360 px : réplique bornée à 12 lignes, réponses jamais coupées, un port par réponse ; paliers écrire ≥ 75 %, lire 40–75 %, situer < 40 %.
- Tiroirs 380 px et popovers ancrés : ÉCHAP ferme et rend le focus ; aucun panneau permanent.
- Charte maintenue (couleurs, polices, filets, un seul bouton plein bleu) ; un état n'est jamais porté par la couleur seule ; aucun chiffre inventé ; on compte des répliques, pas des nœuds.
- Raccourcis en CTRL (jamais ⌘) : ALT+1/2/3 vues, ALT+N nouvelle scène, L lentille, CTRL+K palette ou réécriture, CTRL+↵ générer.
- Valeurs exactes dans les `style` des boards (config `design-refonte-scene`, port 8973). La spec UX et l'architecture de `planning-artifacts/` ne s'appliquent pas (seule la charte de `design-system-foundation.md` reste).

## Cross-Story Dependencies

- Tranche 1 livrée, tranche 1 bis pas encore. 20.4 ne dépend que de 20.1.
- 20.2 a retenu le **plan A (360 px)** avec peu de marge sur le glisser, sur un prototype sans nœuds de test : 20.7 reprend ses optimisations et son protocole (`spec-20-2-preuve-performance-cartes-360.md`) ; glisser et frappe se jugent après 20.8.
- Ordre tranche 2 : 20.4 → 20.5 → 20.25 → 20.6 → 20.7 → 18.5b → 18.6 → 18.7 → 20.8 → 18.9 → 20.9 → 18.11 → 20.10 → 20.24.
- La fiche (20.4) nourrit l'enveloppe (20.5), l'ouverture générée (20.11) et l'ambiance (20.20) ; son menu « fiche de scène ▾ » réutilise les composants existants.
- 20.5 crée la scène côté serveur dès ALT+N et pose les redirections des anciennes routes, activées par 20.7, 20.11 et 20.15. 20.25 précède 20.11, qui retire la page Générer.
- Tranche 3 après 20.6, 20.8 et 20.25 ; 20.15 attend un mois d'usage sans recours au panneau (ou décision de l'auteur).
