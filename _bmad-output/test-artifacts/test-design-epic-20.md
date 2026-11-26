---
workflowStatus: 'completed'
totalSteps: 5
stepsCompleted: ['step-01-detect-mode', 'step-02-load-context', 'step-03-risk-and-testability', 'step-04-coverage-plan', 'step-05-generate-output']
lastStep: 'step-05-generate-output'
nextStep: ''
lastSaved: '2026-11-20'
inputDocuments:
  - _bmad-output/planning-artifacts/epics/epic-20.md
  - _bmad-output/planning-artifacts/epics/epic-18.md
  - docs/architecture/refonte-scene-architecture.md
  - docs/architecture/conversations-ia.md
  - docs/architecture/adr-008-perf-targets.md
  - docs/design/refonte-scene/README.md
  - _bmad-output/project-context.md
  - _bmad-output/implementation-artifacts/sprint-status.yaml
  - .claude/rules/tests.md
  - .claude/rules/frontend_testing.md
  - .claude/rules/graph_editor.md
  - .claude/rules/testnode_sync.md
  - .claude/commands/test-tiers.md
  - .github/workflows/ci.yml
  - _bmad/custom/bmad-testarch-automate.toml
  - .claude/skills/bmad-testarch-test-design/resources/knowledge/{risk-governance,probability-impact,test-levels-framework,test-priorities-matrix,nfr-criteria}.md
---

# Test Design : Epic 20 — Refonte « Scène » (une scène, un texte, trois vues)

**Date :** 2026-11-20
**Auteur :** Team Alteir (TEA, mode non interactif)
**Statut :** Brouillon — à valider avant la première story de la tranche 1

---

## Choix faits sans poser la question (mode non interactif)

| Point où le workflow demande | Choix retenu | Raison |
|---|---|---|
| Mode système ou epic | **Epic** | Demande explicite ; epic + stories avec critères d'acceptation disponibles. |
| Fichier de progression `test-design-progress.md` | **Non écrit** ; l'avancement est porté par le frontmatter de ce fichier | Consigne : n'éditer aucun autre fichier. |
| Exploration navigateur (`tea_browser_automation: auto`) | **Non faite** | Consigne : ne lancer aucun serveur. Analyse sur code, docs et tests. |
| Mode d'orchestration (`tea_execution_mode: auto`) | Séquentiel, un seul livrable | Le niveau epic n'en produit qu'un. |
| Fragments de connaissance | `risk-governance`, `probability-impact`, `test-levels-framework`, `test-priorities-matrix`, `nfr-criteria` (NFR dans le périmètre) | Profil epic. Pas de Pact (désactivé). |
| Surcharge `bmad-testarch-test-design.toml` | Absente ; seule `bmad-testarch-automate.toml` (brownfield) existe et a été appliquée | Inventaire avant plan, écarts seulement. |
| Propriétaire des parades | « Dev » = la session qui code la story ; « Marc » = arbitrage produit | Pas d'équipe QA séparée dans ce dépôt. |

---

## Executive Summary

**Portée :** plan de test niveau epic, stories 20.1–20.23 et tranche 1 bis (18.4–18.9, 18.11 ; 18.10 dans 20.18).

**Inventaire mesuré le 2026-11-20 dans ce worktree :** 308 fichiers pytest (`tests/**/test_*.py`), 331 fichiers Vitest (`frontend/src/**/*.test.ts(x)`), 27 specs Playwright (`e2e/*.spec.ts`). Les chiffres « 259 / 231 / 20 » des sources sont périmés.

**Risques :**

- 20 risques identifiés, **11 à score ≥ 6** (dont 1 à 9).
- Catégories critiques : **DATA** (export, texte, sauvegarde, liens), **PERF**, **BUS** (clavier, coûts), **OPS** (ce que la CI ne rejoue pas).

**Six constats qui changent le plan (vérifiés dans le code) :**

1. **L'export Unity a quatre chemins (graphe front, invité, `save-and-write`, lot), et celui du document canonique est côté front.** `exportToUnity` (`frontend/src/store/slices/persistenceSlice.ts:701`) rebâtit le JSON par `graphToDocument(state.nodes, state.edges)`, qui reconstruit `test*Node` **depuis les arêtes sortant d'un TestNode** (`frontend/src/utils/documentToGraph.ts:289-291`, filtre `edge.source.startsWith('test-node-')`). La story 20.8 cesse de rendre les TestNode : sans adaptation, les quatre issues de chaque test disparaissent de l'export **sans erreur**. Un golden uniquement pytest ne le verrait pas. Le chemin invité (`useUnityExport.ts:86-92`) exporte `JSON.stringify(state.document)` brut, donc **avec** la future clé `scene` (20.4). Le troisième chemin (`save-and-write`, rendu Python) n'est pris que sans `documentId` ; le quatrième est l'export par lot (`export_persisted_document`).
2. **La CI de PR ne rejoue aucun parcours e2e fonctionnel.** `.github/workflows/ci.yml` lance lint, typecheck, pytest, Vitest, puis seulement `auth.spec.ts` et la PWA. Les « preuves UI » et le harnais de perf sont locaux. Le golden de 20.1 doit donc vivre dans pytest **et** Vitest, pas dans Playwright.
3. **Le harnais de perf n'est pas celui que décrivent les stories.** `e2e/perf-document-load.spec.ts` charge un document de **3 nœuds**, mesure une seule charge, n'applique le seuil confort qu'avec `PERF_STRICT=1`, et ne mesure ni glisser ni frappe. Les seuils divergent : NFR-P1 « < 1 s » dans l'epic 20, « p95 load < 3 s (confort, N < 500) » dans `docs/architecture/adr-008-perf-targets.md`.
4. **Le cœur de 18.4 est déjà livré.** Commit `61462f0a8` (2026-11-12) : `updateNode` passe par `runGraphTransaction`, coalescence par rafale de 1 s (`UNDO_COALESCE_WINDOW_MS`, `nodeSlice.ts:467`), testé par `frontend/src/__tests__/graphStore.updateNodeUndo.test.ts` (dont « 30 s of continuous typing does not consume the undo history »). `sprint-status.yaml` marque pourtant 18-4 `backlog`. Il reste : CTRL+Z dans un champ (`allowedInInputs`, `useKeyboardShortcuts.ts:109`, ne contient pas `ctrl+z`), annonce ARIA, mesure du nombre de clones. Même constat pour 18.3 (`NodeEditorPanel.storeTextResync.test.tsx`).
5. **Le comptage de mots `\w+` diverge entre front et back.** En JavaScript, `\w` sans drapeau `u` ne reconnaît pas les lettres accentuées (« Uresaïr » donne deux mots), alors qu'en Python 3 il les reconnaît. Le README § 6 et la story 20.6 imposent un compteur égal à un calcul de référence : il faut fixer **une** définition (`\p{L}\p{N}` avec `u`) avant d'écrire le test.
6. **Sept specs e2e et le helper dépendent du panneau ou du TestNode** (`documents-layout-adr008`, `graph-4-test-results`, `graph-authoring-journey` (@smoke), `graph-connection-target-dropdown`, `graph-manual-node`, `graph-node-generation`, `graph-test-node-generation-4results`, `helpers.ts`). 20.8 et 20.15 les cassent ; la règle du dépôt impose de les **migrer**, pas de les supprimer.

**Couverture prévue (scénarios à créer, hors existant) :**

- P0 : 12 scénarios (~30–50 h)
- P1 : 26 scénarios (~25–45 h)
- P2/P3 : 19 scénarios (~10–20 h)
- **Total : ~65–115 h**, réparties sur les ≈ 57 sessions de l'epic (≈ 1 à 2 h de test par session de dev).

---

## Not in Scope

| Élément | Raison | Parade |
|---|---|---|
| Fusion fine sur 409 | Hors epic (20.10 : « le dernier qui écrit l'emporte ») | Test : rien de ce qui est tapé n'est perdu après relance unique. |
| Co-édition Yjs (A11) | Pari, non engagé | Aucun. |
| `code_assist` (A15) | Hors epic | Aucun. |
| Charge serveur (k6) | Mono-utilisateur, un seul worker gunicorn | Perf front uniquement. |
| RTL | Hors périmètre (18.11) | Décision écrite dans la story. |
| Qualité éditoriale des générations | Jugée par 20.23 (juge à l'aveugle), pas par des tests | Protocole de 20.23. |
| Connexion runtime Unity live | Hors epic (FR94) | Aucun. |

---

## Risk Assessment

Échelle : probabilité 1 (peu probable) – 3 (probable) × impact 1 (mineur) – 3 (critique). Score ≥ 6 = parade obligatoire avant fin de tranche ; 9 = bloquant.

### High-Priority Risks (Score ≥ 6)

| ID | Cat. | Description | P | I | Score | Parade | Propriétaire | Échéance |
|---|---|---|---|---|---|---|---|---|
| **R-01** | DATA | **Export Unity modifié en silence.** Quatre chemins (front `graphToDocument`, invité `state.document`, Python `save-and-write`, lot) ; `test*Node` reconstruit depuis les arêtes des TestNode, que 20.8 supprime ; clé `scene` (20.4) exportée par le chemin invité. | 3 | 3 | **9** | Golden **double** dès 20.1 : pytest **et** Vitest, cinq sorties figées, un fichier attendu par chemin (`tests/fixtures/unity_dialogues/expected/<chemin>/`) : `python-graphe` (route `save-and-write` sur `front-payload`), `python-lot`, `front-canonique`, `front-invite`, `front-payload` ; Vitest régénéré avant pytest, marqueur `p0`. Rejoué à chaque PR (T2) et en T0. | Dev 20.1, 20.8, 20.4 | 20.1 (avant toute autre story de la tranche 2) |
| **R-02** | DATA | **Conversion texte ↔ blocs non idempotente** : `*` non fermé, `**`, `* [Vous …]*` (v1.10.1), CRLF, espaces insécables, apostrophes typographiques, espaces de fin. Si une sortie de champ réécrit `serialize(parse(x))`, la réplique change. | 2 | 3 | **6** | Aller-retour sur chaque `line` et chaque texte de réponse des fixtures + cas limites ; test qui prouve que sortir d'un champ **sans frappe** ne déclenche aucun `updateNode`. Contrôle local sur les 36 dialogues de `Assets/Dialogue/` (36 `.json` comptés dans le dépôt principal). | Dev 20.1 | 20.1 |
| **R-03** | DATA | **Perte de saisie** : champ non contrôlé re-rendu à chaque frappe ; 409 adopté puis relancé une fois ; invité ; hors ligne (journal IndexedDB testé seulement « indisponible ») ; deux révisions (document + journal 20.17). | 2 | 3 | **6** | Store : 409 pendant une rafale ⇒ texte final = texte tapé. e2e local : taper, provoquer un 409 par un PUT concurrent, recharger, comparer. Invité : aucun champ monté. | Dev 18.5, 18.8, 20.10, 20.17 | Fin tranche 1 bis, puis 20.10 |
| **R-04** | DATA | **Liens de choix perdus** : écrire le texte d'une réponse sans reconstruire `choices` depuis le store courant écrase `targetNode`, `choiceId`, `test*Node` ; `via_choice_index: null` crée une arête fantôme (vécu 2026-11-19) ; option gardée connectée par l'API au lieu du front. | 2 | 3 | **6** | Store : frappe continue sur un choix porteur de test ⇒ `choiceId`, ordre, `targetNode`, 4 `test*Node`, id de barre inchangés. Étendre à la frappe dans le bloc de Script (même champ). | Dev 18.6, 20.6, 20.11 | 18.6 |
| **R-05** | PERF | **Graphe à cartes 360 px trop lent** : NFR-P1 ≤ 1 s sur 500 répliques, aucune image > 16 ms au zoom. Harnais actuel à 3 nœuds, sans glisser ni frappe ; seuils contradictoires (1 s / 3 s). | 3 | 2 | **6** | 20.2 construit la fixture 500 répliques (longueurs mesurées sur les fixtures), mesure charge + trace de zoom + p95 frappe, et **consigne** la décision plan A / plan B. Seuil à trancher avant 20.2 (voir NFR). | Dev 20.2 ; Marc (seuil) | 20.2, avant la tranche 2 |
| **R-06** | DATA | **Annulation incohérente** : CTRL+Z hors `allowedInInputs` ⇒ l'annulation native du `<textarea>` et celle du store divergent ; après un undo du store, un champ non contrôlé peut garder l'ancien DOM et le réécrire à la frappe suivante. | 2 | 3 | **6** | Composant : CTRL+Z dans le champ ⇒ undo du store, champ affiche le texte restauré, frappe suivante part de ce texte ; CTRL+Y idem. Ne pas re-tester la coalescence (déjà couverte). | Dev 18.4 (reste), 18.5 | 18.4 |
| **R-07** | BUS | **Dépense LLM non maîtrisée** : lot de N suites, réécriture (nouvel endpoint), discussion (budget, 40 messages), double CTRL+↵. Les e2e locaux ont la vraie `OPENAI_API_KEY`, et un worktree hérite du `.env` principal (vécu 2026-11-11). | 2 | 3 | **6** | Coût total affiché **avant** tout appel ; aucun appel avant confirmation (spy). pytest : `rewrite-span` passe par la gouvernance de coût (429) et refuse l'invité. e2e de génération seulement sur client factice ou avec budget restauré dans `finally`. | Dev 20.11, 20.12, 20.13, 20.21 | Tranche 3 |
| **R-08** | BUS | **Clavier cassé ou capté** : touches seules nouvelles (L, J/K/G/R, ?) qui tireraient dans un champ ; TAB à double sens (Script / Graphe) ; ÉCHAP sans `stopPropagation` replie un panneau ; ALT+1/2/3, ALT+N, CTRL+\ à vérifier navigateur par navigateur ; aide actuelle déjà fausse (README § 2). | 3 | 2 | **6** | Une table unique des raccourcis (`generalShortcuts.ts`) et un test qui génère l'aide **depuis** elle ; test « aucune touche seule ne tire depuis un textarea » ; vérification manuelle Chrome / Edge / Firefox / PWA (20.14). | Dev 18.9, 20.5, 20.6, 20.9, 20.14 | 20.14 |
| **R-09** | TECH | **Fiche de scène ignorée** : 13 fichiers lisent `useContextStore` dans le chemin de génération (`AIGenerationPanel`, `NodeEditorPanel`, `useBatchGenerateFromNodes`, `useGenerationRequest`, `useGenerationHandlers`…) ; graphies `T'vok`/`T’vok` réécrites sans l'auteur. | 2 | 3 | **6** | Test d'inventaire qui échoue si un appel de génération lit `contextStore` ; test « scène A après scène B » sur la requête ; test « aucun `speaker` réécrit sans confirmation ». | Dev 20.4 | 20.4 |
| **R-10** | TECH | **Specs e2e couplées au panneau et au TestNode** (7 specs + `helpers.ts`, dont le @smoke `graph-authoring-journey`) : risque de les supprimer au lieu de les migrer, donc de perdre une fonction (README § 13). | 3 | 2 | **6** | Chaque story qui touche ces écrans migre les specs concernées dans la même PR ; chaque ligne du § 13 cochée avec la spec qui la couvre (garde-fou 1). | Dev 20.8, 20.11, 20.15 | 20.8, 20.15 |
| **R-11** | OPS | **La CI ne voit pas les parcours** : seuls `auth.spec.ts` et la PWA tournent en CI ; tout parcours Scène (écrire, générer, jouer) n'est prouvé qu'en local. | 3 | 2 | **6** | Tout invariant de donnée descend en Vitest/pytest (rejoués en CI) ; e2e réservés aux parcours. Avant chaque fin de tranche : `npm run test:e2e:verify` local, sortie citée. | Dev ; Marc (accepter ce partage) | Chaque fin de tranche |

### Medium-Priority Risks (Score 3–4)

| ID | Cat. | Description | P | I | Score | Parade | Propriétaire |
|---|---|---|---|---|---|---|---|
| R-12 | DATA | Journal d'édition (20.17) : sa révision propre doit ne jamais faire monter celle du document ; 409 du journal confondu avec celui du document. | 2 | 2 | 4 | pytest API `GET/PUT …/journal` (409, révision document inchangée, export ignore le journal). | Dev 20.17 |
| R-13 | TECH | Passage en dagre `LR` : positions précédentes perdues ; tests de disposition écrits pour `TB` (`dagreLayout.returnEdges.test.ts`, `edgeRouting.test.ts`) ; `normalizeTestBarsAfterLayout` sans objet sans TestNode. | 2 | 2 | 4 | Tests de disposition paramétrés `TB`/`LR` ; test « redisposer puis revenir » rend les positions d'origine. | Dev 20.7 |
| R-14 | SEC | Nouveaux endpoints (`rewrite-span`, résolveurs `ui_help`, `gdd_query`) : droits d'édition, invité, pas de secret dans la réponse, texte du GDD qui porte des consignes. | 2 | 2 | 4 | pytest API : 401/403 invité, 403 sans droit sur le dialogue, aucune variable d'environnement dans le prompt ni la réponse. | Dev 20.13, 20.22 |
| R-15 | BUS | Tactile (20.18) : cibles 44 px dans une carte 360 px, appui long qui ouvre le menu du nœud au lieu de la sélection, pas d'ÉCHAP. Aucun appareil réel dans la chaîne de test (jsdom seulement). | 2 | 2 | 4 | Vitest sur l'exemption d'appui long ; Playwright avec viewport mobile ; vérification sur appareil réel en fin d'epic (manuel). | Dev 20.18 |
| R-16 | BUS | Tokens en variables CSS (20.3) « identiques au pixel » : aucun outil de comparaison d'image dans le dépôt (`toHaveScreenshot` absent). | 2 | 2 | 4 | Test Vitest : chaque token publié sur `:root` avec la même valeur ; captures avant/après par Playwright headless dans `tmp/`, comparées à l'œil (critère réaliste). | Dev 20.3 |
| R-17 | BUS | Catalogues (20.19) : une valeur absente des CSV devient refusée ; les documents existants qui en contiennent deviennent ineditables ou bloquent l'enregistrement. | 2 | 2 | 4 | Test : une valeur inconnue **déjà présente** reste affichée et signalée, n'empêche pas l'autosave (mode brouillon). | Dev 20.19 |
| R-18 | BUS | Erreurs d'IA mal présentées : le 409 « conversation pleine » (40 messages, `test_full_conversation_returns_409`) traité comme un conflit de document ; génération en erreur qui jette le texte reçu (20.10). | 2 | 2 | 4 | Vitest : chaque code (409, 429, 502) donne l'état du board `Etats` ; texte partiel conservé. | Dev 20.10, 20.21 |
| R-19 | TECH | Compteurs du fil (mots, suites à écrire, réponses vides) différents entre front, référence et README (§ 6 : 209 emplacements, 105 utiles, 3 887 mots) ; `\w` ASCII en JS. | 3 | 1 | 3 | Fonction pure unique testée sur les fixtures ; définition du mot tranchée (`\p{L}\p{N}`, drapeau `u`) ; chiffres attendus recalculés par la story, jamais recopiés du README. | Dev 20.6 |

### Low-Priority Risks (Score 1–2)

| ID | Cat. | Description | P | I | Score | Action |
|---|---|---|---|---|---|---|
| R-20 | PERF | Ambiance (20.20) : images > 200 Ko ou effets qui coûtent plus de 5 % au rendu ; URL Notion expirées. | 1 | 2 | 2 | Contrôle taille WebP en pytest ; mesure avec le harnais de 20.2. |
| R-21 | BUS | Contraste Papier et teintes (20.16, 20.20) : valeurs déjà calculées dans le README § 10 et la story 20.20. | 1 | 2 | 2 | Test automatique de contraste sur les tokens (prévu par 20.16). |
| R-22 | TECH | Provenance et variantes en mémoire de session seulement jusqu'à 20.17 : perdues au rechargement. | 2 | 1 | 2 | Accepté ; dit dans l'interface. |

### Légende des catégories

TECH architecture/intégration · SEC sécurité/droits · PERF performance · DATA intégrité des données · BUS usage/coût · OPS chaîne de livraison.

---

## NFR Planning

| Catégorie | Exigence / seuil | Risque | Validation prévue | Preuve attendue |
|---|---|---|---|---|
| Fiabilité — NFR-I1 | Export Unity identique octet pour octet sur les fixtures | R-01 | Golden pytest + Vitest, marqueur `p0` | Job CI « Backend » et « Frontend (Vitest) » verts ; diff nul |
| Fiabilité — NFR-R3 | Aucune perte de donnée (aller-retour, 409, hors ligne, restauration) | R-02, R-03, R-06, R-12 | Store + composant (CI) ; e2e 409 local | Rapports Vitest/pytest ; sortie Playwright locale citée dans la PR |
| Performance — NFR-P1 | Premier rendu du graphe ≤ 1 s (epic) **ou** < 3 s (ADR-008) | R-05 | Harnais 20.2, fixture 500 répliques, `PERF_STRICT=1` | Mesures consignées dans la story 20.2 (poste, navigateur, médiane et p95) |
| Performance — NFR-P4 | Réponse UI < 100 ms ; p95 frappe < 100 ms ; aucune image > 16 ms au zoom | R-05 | Trace Performance Playwright ; p95 frappe | Trace exportée dans `tmp/` + chiffres dans la story |
| Accessibilité — NFR-A1 | Tout au clavier | R-08 | Composant (focus, ÉCHAP, TAB) ; manuel multi-navigateurs | Tests Vitest ; tableau de vérification de 20.14 |
| Accessibilité — NFR-A2 | Contraste AA, deux thèmes | R-21 | Test de contraste sur les tokens | Rapport Vitest |
| Accessibilité — NFR-A3 | Nom accessible de chaque élément interactif nouveau | R-08 | RTL `getByRole(..., { name })` | Tests Vitest |
| Sécurité | Invité en lecture seule ; droits d'édition pour générer, annoter, discuter ; aucun secret | R-03, R-07, R-14 | pytest API ; Vitest invité | Rapports pytest |
| Coût | Coût estimé avant tout appel ; budget bloquant avant l'appel | R-07 | Vitest (spy d'appel) + pytest (429) | Rapports |

**Seuils inconnus (à trancher, ne pas deviner) :**

- **NFR-P1 : 1 s ou 3 s ?** L'epic 20 dit ≤ 1 s, ADR-008 dit p95 < 3 s en confort. Et sur quel poste : le Windows de l'auteur, ou le runner Ubuntu ? **UNKNOWN** — à trancher par Marc avant 20.2.
- p95 glisser d'une carte 360 px : **UNKNOWN** (ADR-008 donne < 200 ms pour l'ancien nœud).
- Plafond de coût d'un lot (en €) au-delà duquel une confirmation supplémentaire est demandée : **UNKNOWN**.
- Lecteur d'écran de référence (NVDA, Narrateur) : **UNKNOWN**.
- Appareils tactiles de référence pour 20.18 : **UNKNOWN**.
- Référence du « 5 % » de 20.20 (sur quelle mesure) : **UNKNOWN** — proposer : premier rendu du harnais 20.2.

**Tranché le 2026-11-20** (reporté dans `epic-20.md`, section « Seuils de mesure ») :

- NFR-P1 = **ADR-008, palier confort** : p95 load < 3 s sous 500 nœuds, p95 drag < 200 ms, p95 frappe < 100 ms ;
  mesuré **en local sur le poste Windows de l'auteur**, `PERF_STRICT=1` (la CI ne lance aucun e2e fonctionnel). Le
  « ≤ 1 s » de l'epic est remplacé.
- Interaction (zoom) : p95 des images ≤ 16 ms et aucune tâche longue > 50 ms ; paliers contigus (écrire ≥ 75 %, lire
  40–75 %, situer < 40 %).
- Lot : **aucun seuil en euros** ; confirmation toujours avec le coût total estimé, refus avant tout appel au-delà du
  budget restant (gouvernance existante).
- Lecteur d'écran de référence : **NVDA sous Windows**.
- Tactile : **émulation Playwright** (presets 375 px et 768 px) en preuve de story ; appareil réel vérifié par Marc en
  fin de tranche.
- « 5 % » de 20.20 : retenu, 5 % du p95 load mesuré sans ambiance par le harnais de 20.2.

---

## Entry Criteria

- [ ] Seuil NFR-P1 tranché (1 s ou 3 s, poste de mesure).
- [ ] Fixtures `tests/fixtures/unity_dialogues/` committées (4 dialogues + `data/interactions/rencontre_dans_la_nef_centrale_unity.json`), et leurs fichiers golden générés **depuis le code actuel**, avant toute modification de l'export.
- [ ] `sprint-status.yaml` recalé : 18.4 et 18.3 partiellement livrées (commit `61462f0a8`) ; les stories 18.x se créent sur le reste à faire.
- [ ] Fixture de perf 500 répliques générée (script de 20.2) et versionnée.
- [ ] Les e2e qui génèrent tournent sur un client factice ou restaurent le budget (`cost-governance.spec.ts`) ; `OPENAI_API_KEY=` vidée pour une API locale de worktree.

## Exit Criteria (epic)

- [ ] Tous les P0 verts, en CI pour ce qui est unitaire/composant/API.
- [ ] P1 ≥ 95 %, échecs triés.
- [ ] Golden export : diff nul sur les fixtures, plus contrôle local des 36 dialogues avant chaque fin de tranche.
- [ ] Aucun risque ≥ 6 sans parade livrée.
- [ ] Chaque ligne du README § 13 cochée avec la spec qui la couvre.
- [ ] Specs e2e migrées, aucune supprimée sans fonction retirée et documentée.

Les critères de sortie **par tranche** sont plus bas.

---

## Couverture existante (ne pas réécrire)

Brownfield : ces tests couvrent déjà une partie des risques. Les stories les **gardent verts**, les étendent au besoin, et n'en créent pas de doublons.

| Domaine | Déjà couvert par | Ce qui manque |
|---|---|---|
| Export Unity — rendu Python | `tests/services/test_unity_json_renderer.py`, `tests/services/test_unity_export_normalizer.py`, `tests/api/test_unity_export_story_5_1.py` (dont `test_graph_export_excludes_test_nodes`, préservation des effets, conditions, tests de compétence), `tests/services/test_unity_json_renderer_4_results.py`, `tests/services/test_unity_export_import_4_results.py`, `tests/api/test_dialogue_special_characters.py` | Golden sur dialogues réels ; comparaison octet pour octet |
| Export Unity — front | `frontend/src/__tests__/persistenceSlice.exportUnity.test.ts`, `frontend/src/__tests__/documentToGraph.test.ts` (dont « persists test*Node from test-node edges so round-trip preserves TestNode result links ») | Golden front sur les mêmes fixtures ; chemin invité ; retrait de `scene` |
| Segmentation des répliques (affichage) | `frontend/src/utils/dialogueLineBlocks.test.ts` (narration, `*[Vous …]*`, `*` non fermé, `**`, positions), `frontend/src/__tests__/dialogueLineRoundTrip.test.ts` (aller-retour sur les fixtures), `frontend/src/components/shared/DialogueLineText.test.tsx` | Rien pour la conversion (story 20.1) |
| Annulation | `graphStore.updateNodeUndo.test.ts` (coalescence, 30 s de frappe, no-op), `graphStore.undoRedo.test.ts`, `graphStore.undoSingleStep.test.ts`, `graphStore.noOpUndoStep.test.ts`, `runGraphTransaction.test.ts`, `GraphEditorHeader.undoRedo.test.tsx`, `NodeEditorPanel.openDoesNotTouchUndo.test.tsx` | CTRL+Z **dans** un champ in-situ ; annonce ARIA ; mesure des clones |
| Autosave et 409 | `persistenceSlice.revisionConflict.test.ts`, `useDialogueLoader.autosaveRetry.test.ts`, `GraphEditor.autosave.test.tsx`, `useGraphToolbar.noManualSave.test.ts`, `tests/api/test_documents.py` (409 document et layout, `mustExist`) | 409 **pendant** une rafale de frappe in-situ ; hors ligne réel (le journal n'est testé qu'« indisponible » : `frontend/src/utils/graphJournal.test.ts`) |
| Indicateur d'enregistrement | `frontend/src/__tests__/SaveStatusIndicator.test.tsx`, `GraphEditorHeader.saveStatusMount.test.tsx` | `aria-live` polite agrégé / `role="alert"` en erreur ; libellé « ENREGISTRÉ · hh:mm » de la barre d'état |
| Liens de choix, `targetNode` | `mergeNodeEditorForm.test.ts`, `NodeEditorPanel.selectionFlush.test.tsx`, `NodeEditorPanel.connectionResync.test.tsx`, `NodeEditorPanel.newNodeNoInheritedChoices.test.tsx`, `graphStore.generateFromLeaf.test.ts`, `graphStore.acceptReject.test.ts`, `graphStore.regenerate.test.ts` (`via_choice_index`) | Écriture in-situ d'un texte de réponse (pas de formulaire) |
| TestNode | `testNodeSync.test.ts`, `useGraphStore.testNodeSync.test.ts`, `TestNode.test.tsx`, `graphStore.testNodeMove.test.ts`, `NodeEditorPanel.testNode.4results.test.tsx`, e2e `graph-4-test-results.spec.ts`, `graph-test-node-generation-4results.spec.ts` | Issues portées par des handles de la réponse (20.8) |
| Disposition | `dagreLayout.test.ts`, `dagreLayout.returnEdges.test.ts`, `edgeRouting.test.ts`, `graphNodeLayout.test.ts`, `graphStore.autoLayout.test.ts` | `LR`, hauteur par palier, réversibilité |
| Dramatis / chemin ancêtre | `sceneDramatis.test.ts`, `sceneDramatis.dialogue.test.ts`, `generationSlice.dialogueDramatis.test.ts`, `dialoguePathContext.test.ts`, `tests/services/test_graph_continuation_prompt.py` | Fiche persistée ; inventaire des lecteurs de `contextStore` |
| Coûts, budget | `tests/api/test_graph_estimate_cost.py`, `tests/middleware/test_cost_governance.py`, `tests/services/test_cost_governance_service.py`, `useCostGovernance.test.ts`, `CostEstimationBadge.test.tsx`, `costEstimateHeaders.test.ts`, e2e `cost-governance.spec.ts` | Coût total d'un lot affiché avant appel ; coût engagé/réel dans l'emplacement |
| Lots FR87/FR88 | `tests/api/test_batch_jobs_restart.py` (interrompu, reprise des seuls parents restants, privé), `tests/api/test_batch_generate_from_nodes.py`, `useBatchGenerateFromNodes.test.ts`, `batchNodeGenerationJobStore.test.ts` | Portées et exclusions calculées serveur ; revue en série J/K/G/R |
| Provenance nœud → appel | `tests/api/test_graph_generation_provenance.py`, `tests/services/test_llm_call_provenance.py` | Annotation de la première réplique d'une scène créée par ALT+N |
| Conversations IA (back) | `tests/api/test_ai_conversations.py` (409 conversation pleine, 429 budget, 502, invité, 403/404), `tests/services/test_ai_conversation_service.py`, `tests/services/repositories/sqlite/test_ai_conversations_repository.py` | Tout le front (20.21) ; résolveurs `ui_help`, `gdd_query` (20.22) |
| Clavier | `useKeyboardShortcuts.test.tsx`, `GraphEditor.keyboard.test.tsx` (WASD, CTRL+J, CTRL+SHIFT+F…), `CommandPalette.keyboard.test.tsx`, `KeyboardShortcutsHelp.test.tsx`, `GraphToolbarShortcutsButton.test.tsx` | Aide générée depuis la table ; touches seules nouvelles ; ALT+1/2/3 |
| Tactile | `GraphCanvas.touchLongPress.test.tsx`, `fr119-touch.chrome.test.tsx`, `MainLayout.responsive.test.tsx` | Exemption de l'appui long dans la zone éditable ; 44 px dans la carte |
| Catalogues | `tests/services/test_flag_catalog_service.py`, `tests/api/test_mechanics_flags.py` | Autocomplétion compétences/traits ; valeur inconnue existante |
| Perf | `e2e/perf-document-load.spec.ts` (3 nœuds), `tests/api/test_unity_export_story_5_1.py::test_save_and_write_under_200ms_small_graph` | Fixture 500 répliques, zoom, frappe |

---

## Test Coverage Plan

Niveaux : **U** unitaire (fonction pure, store) · **C** composant (RTL) · **A** API (pytest + `TestClient`) · **E** e2e Playwright.
Paliers (grille `.claude/commands/test-tiers.md`) : **T0** fumée (`p0` pytest, Vitest `--bail=1`, `@smoke`) · **T1** ciblé · **T2** PR (CI : pytest `not slow`, Vitest défaut, lint, typecheck) · **T3** push `main` / déploiement. ⚠ Les e2e fonctionnels ne tournent **jamais** en CI : ils sont T1 locaux (liste explicite de specs) et entrent dans `test:e2e:verify` avant chaque fin de tranche.

### Par story : niveau retenu et palier

| Story | Niveau(x) | Palier | À créer (priorité) |
|---|---|---|---|
| **20.1** Conversion + golden | U (front), A/U (back) | **T0** (`p0`) + T2 ; script local hors CI | Golden pytest (P0) ; golden Vitest des chemins front + invité (P0) ; aller-retour + cas limites (P0) ; « sortie de champ sans frappe = aucune écriture » (P0, livré avec 18.5) ; script 36 dialogues (P1, local) |
| **20.2** Preuve de perf | E | T1 local, `PERF_STRICT=1` | Fixture 500 + premier rendu (P0) ; trace zoom ≤ 16 ms + palier à `onMoveEnd` (P1) ; carte en écriture exemptée (P1, U sur le sélecteur de palier) |
| **20.3** Tokens CSS | U, E (captures) | T2 ; captures T1 | Chaque token sur `:root` (P1) ; captures 1c, 2a–2e avant/après (P2, revue humaine) |
| **18.4** Annulation (reste) | C | T2 | CTRL+Z/CTRL+Y dans le champ = store, DOM resynchronisé (P0) ; annonce ARIA (P1) ; mesure des clones/min consignée (P2) |
| **18.5** Réplique dans le champ | C, E | T2 ; E T1 | Patch mono-champ, pas de brouillon (P1) ; Backspace/Suppr ne suppriment pas le nœud (P1) ; ÉCHAP `stopPropagation` (P1) ; collage texte plat (P2) ; quatre gestes neutralisés (P2) ; invité/playthrough/aperçu sans champ (P0, fusionné avec 20.10) |
| **18.6** Texte des réponses | U (store), C | T2 | Frappe continue sur choix à test : `choiceId`, ordre, `targetNode`, `test*Node`, id de barre (P0) ; réponse vidée non supprimée + `aria-invalid` (P1) ; étiquette d'arête suit sans recréer l'arête (P2) |
| **18.7** Locuteur et titre | U, C | T2 | Champs non touchés intacts (P1) ; casse stockée = casse saisie (P2) |
| **18.8** Indicateur | C | T2 | `aria-live` polite agrégé, erreur en `role="alert"` (P1) ; « en attente / n » pendant envoi (P2) |
| **18.9** Clavier composite | C, E | T2 ; E T1 | Un nœud = un arrêt de TAB, ENTRÉE entre, TAB circule, ÉCHAP rend le focus au nœud (P1) ; curseur dans la réplique à la création (P1) ; « Éditer » du menu édite même si déjà sélectionné (P1 ; étendre `NodeContextMenu.test.tsx`) |
| **18.11** Non-régression | C, E | T2 ; E T1 | Lasso sur dix nœuds : aucun champ monté (P1) ; export PNG/SVG sans état d'édition (P2) ; hauteur de disposition = densité de référence (P2) |
| **20.4** Fiche de scène | U, C, A | T2 | Inventaire `contextStore` dans le chemin de génération (P0) ; scène A après B (P1) ; déduite une fois, enregistrée au premier geste (P1) ; rapprochement de graphies proposé, jamais appliqué seul (P1) ; `scene` retirée des 3 chemins d'export (couvert par le golden, P0 de 20.1 étendu) |
| **20.5** Enveloppe | C, E | T2 ; E T1 | `?scene=…&vue=…` restaure scène et vue (P1) ; chaque élément de la barre d'état ouvre son détail, ÉCHAP rend le focus (P1) ; drapeau `legacyInspector` + compteur (P2) |
| **20.6** Vue Script | U, C, E | T2 ; E T1 | Compteurs du fil = fonction de référence sur les fixtures (P1) ; issue choisie hors document (P1) ; TAB → suite vide suivante (P1) ; noms accessibles (P1) ; p95 frappe (P1, harnais 20.2) |
| **20.7** Cartes, flux LR | U, C, E | T2 ; E T1 | Redisposer LR puis revenir aux positions d'origine (P1) ; réponses jamais coupées, un port chacune (P1) ; ALT+1/ALT+2 conservent le chemin (P1) ; NFR-P1 sur la plus grande fixture (P1, harnais 20.2) |
| **20.8** Tests en sorties | U, C, E | T2 ; E T1 | `graphToDocument` reconstruit les 4 `test*Node` depuis les handles de la réponse (P0, golden) ; « À ÉCRIRE » sur issue vide (P2) ; migration de `graph-4-test-results.spec.ts` et `graph-test-node-generation-4results.spec.ts` (P1) |
| **20.9** Lentille, popovers | C | T2 | L hors champ uniquement (P1) ; popover : ÉCHAP rend le focus à la puce (P1) ; puce atteignable au clavier (P2) |
| **20.10** États transverses | C, E | T2 ; E T1 | Invité : aucun champ n'accepte de frappe, bandeau présent (P0) ; 409 pendant la saisie : toast + rien de perdu (P0 en store, e2e P1) ; génération en erreur garde le texte reçu (P1) ; budget atteint : Générer éteint avant l'appel (P1) |
| **20.11** Emplacement, options | U, C, E | T2 ; E T1 (client factice) | Coût estimé avant, aucun appel avant CTRL+↵ ; double CTRL+↵ = un appel (P0) ; option gardée connectée par `connectNodes`, `via_choice_index: null` sans arête de choix (P1, étendre `graphStore.generateFromLeaf.test.ts`) ; `‹ 1/N ›` (P2) ; retrait des composants § 13 avec spec migrée (P1) |
| **20.12** Lot en série | A, C | T2 | Portées et exclusions calculées serveur (P1 ; pytest) ; coût total affiché avant tout appel (P0, avec 20.11) ; revue J/K/G/R (P2). Reprise après redémarrage : **déjà couverte** (`test_batch_jobs_restart.py`) |
| **20.13** Réécrire | A, C | T2 | Contrat `rewrite-span` : schéma, coût estimé, 422/429/502 (P1) ; droits et invité (P0, R-14 + R-07) ; prompt via `GraphPromptContextFactory` (P1) ; TAB / CTRL+→ / ÉCHAP (P2) |
| **20.14** Diagnostics, aide | U, C, manuel | T2 ; manuel | Diagnostics recalculés à 300 ms sans réseau (P1) ; aide « ? » générée depuis la table (P1) ; aucune touche seule depuis un textarea (P1) ; tableau Chrome/Edge/Firefox/PWA (P1, manuel) |
| **20.21** Discussion | C, E | T2 ; E T1 (client factice) | Mapping 409/429/502 → états du board (P1) ; « Pourquoi ? » grisé sans appel rattaché (P1) ; champ verrouillé pendant un tour (P2) ; invité en lecture (P1). Back-end : **déjà couvert** |
| **20.22** Demander | A, C | T2 | Résolveurs `ui_help`, `gdd_query` : sources citées, aucun secret ni exécution (P1) ; droits (P1) |
| **20.15** Retrait du panneau | E | T1 avant fusion | Chaque ligne du § 13 couverte par une spec (P1) ; suppression des tests du panneau seulement avec le composant retiré (règle du dépôt) |
| **20.16** Papier, Focus | U, C | T2 | Contraste de chaque paire du § 10 (P2) ; `prefers-reduced-motion` (P3) ; réglages sans Enregistrer (P3) |
| **20.17** Journal | A, C | T2 | 409 propre au journal, révision document inchangée, export ignore le journal (P1) ; « Restaurer » crée une version (P1) ; plafond 20 (P2) |
| **20.18** Tactile | C, E, manuel | T2 ; E T1 viewport mobile | Appui long dans la zone éditable : sélection native (P1) ; cibles ≥ 44 px (P2) ; toast d'annulation 6 s (P2) ; appareil réel (P3, manuel) |
| **20.19** Catalogues | U, A | T2 | Valeur inconnue refusée à la saisie, mais existante affichée et non bloquante (P1) |
| **20.20** Ambiance | A, E | T2 ; perf T1 | WebP ≤ 200 Ko, tailles (P2) ; repli sans image (P2) ; perf avec ambiance (P2, harnais 20.2) |
| **20.23** Notes d'intention | Protocole | hors CI | Aucun test automatisé : juge à l'aveugle (P3). Si activé : l'intention n'est jamais exportée (golden, déjà P0) |

### P0 (critique) — rejoués à chaque PR (CI T2) ; marqueur `p0` côté pytest pour T0

**Critère :** bloque le parcours principal + risque ≥ 6 + pas de contournement.

| Exigence | Niveau | Risque | Nb | Propriétaire | Notes |
|---|---|---|---|---|---|
| Golden export, chemins Python (`python-graphe` par la route `save-and-write` sur `front-payload`, `python-lot`) | A/U | R-01 | 1 (paramétré par fixture) | Dev 20.1 | `tests/services/test_unity_export_golden.py`, un fichier attendu par chemin ; lancé après Vitest |
| Golden export, chemins front (`front-canonique`, `front-invite`, `front-payload`) | U | R-01 | 1 (paramétré) | Dev 20.1 | `frontend/src/__tests__/unityExport.golden.test.ts`, un fichier attendu par chemin, régénéré avant le pytest (`front-payload` est l'entrée de `python-graphe`) ; échoue en 20.8 tant que `graphToDocument` ne lit pas les handles |
| Aller-retour texte ↔ blocs | U | R-02 | 1 (paramétré) + cas limites | Dev 20.1 | Chaque `line` et texte de réponse des fixtures |
| Sortie de champ sans frappe = aucune écriture | C | R-02 | 1 | Dev 18.5 | Spy sur `updateNode` |
| CTRL+Z / CTRL+Y dans un champ in-situ | C | R-06 | 2 | Dev 18.4 | Le champ affiche le texte restauré ; frappe suivante part de lui |
| Frappe continue sur réponse à test : liens intacts | U | R-04 | 1 | Dev 18.6 | `choiceId`, ordre, `targetNode`, `test*Node`, id de barre |
| 409 pendant une rafale de frappe | U | R-03 | 1 | Dev 20.10 | Prolonge `persistenceSlice.revisionConflict.test.ts` : texte final = texte tapé |
| Invité : aucun champ, aucune frappe | C | R-03 | 1 | Dev 18.5 / 20.10 | Script et Graphe |
| Premier rendu 500 répliques | E | R-05 | 1 | Dev 20.2 | Local, `PERF_STRICT=1` ; décide plan A / B |
| Aucun appel de génération ne lit `contextStore` | U | R-09 | 1 | Dev 20.4 | Test d'inventaire |
| Coût avant appel, un seul appel par CTRL+↵, aucun appel de lot avant confirmation | C | R-07 | 1 | Dev 20.11 / 20.12 | Spy sur le client API |

**Total P0 :** 12 scénarios, ~30–50 h.

### P1 (haute) — CI T2 pour U/C/A ; e2e en T1 local avant la PR

**Critère :** parcours importants, risque moyen à haut.

Voir la colonne « À créer » ci-dessus : 26 scénarios marqués P1, dont 6 migrations de specs e2e (R-10). Points notables :

- `rewrite-span` et résolveurs : droits, invité, gouvernance de coût (R-07, R-14).
- Journal : 409 propre, révision du document inchangée (R-12).
- Disposition `LR` réversible (R-13).
- Clavier : composite, aide générée, touches seules (R-08).
- Migration des specs couplées au panneau et au TestNode, `graph-authoring-journey.spec.ts` (@smoke) en premier (R-10).

**Total P1 :** ~26 scénarios, ~25–45 h.

### P2 (moyenne) — CI T2 quand unitaire ; sinon fin de tranche

Collage texte plat, gestes neutralisés, casse du locuteur, mesure des clones, `‹ 1/N ›`, revue J/K/G/R, plafond de versions, captures 20.3, contrastes, ambiance, 44 px. **~15 scénarios, ~8–15 h.**

### P3 (basse) — à la demande

`prefers-reduced-motion`, réglages sans Enregistrer, appareil tactile réel, protocole 20.23. **~4 scénarios, ~2–5 h.**

---

## Execution Order

Principe du dépôt : tout ce qui est unitaire, composant ou API tourne à chaque PR (CI T2, quelques minutes) ; les e2e fonctionnels et la perf sont locaux, faute de job CI. Pas de nightly dans ce dépôt ; on ne l'invente pas.

| Moment | Ce qui tourne | Commande |
|---|---|---|
| Itération sur une story | T1 ciblé | `node scripts/getPythonPath.js -m pytest tests/…` ; `cd frontend && npx vitest run src/… --reporter=dot` ; `npx playwright test e2e/x.spec.ts --workers=1` |
| Avant d'ouvrir la PR | T2 + typecheck + e2e T1 des parcours touchés | `npm run test:premerge` ; `npm --prefix frontend run typecheck` |
| PR (CI) | T2 : lint, typecheck, pytest `not slow` (golden inclus), Vitest défaut (golden front inclus), e2e auth + PWA | automatique |
| Push `main` (CI) | T3 | automatique |
| Fin de tranche | `npm run test:e2e:verify` + harnais perf `PERF_STRICT=1` + script local des 36 dialogues | local, sortie citée dans la PR de clôture |
| Déploiement | T3 local | `.claude/rules/ci_before_push.md` |

⚠ Un seul pytest à la fois sur le poste : deux pytest simultanés se bloquent.

---

## Resource Estimates

| Priorité | Scénarios | Effort | Notes |
|---|---|---|---|
| P0 | 12 | ~30–50 h | Fixtures, golden double, harnais 500 répliques |
| P1 | ~26 | ~25–45 h | Dont 6 migrations de specs e2e |
| P2 | ~15 | ~8–15 h | |
| P3 | ~4 | ~2–5 h | Surtout manuel |
| **Total** | **~57** | **~65–115 h** | **≈ 2 à 4 semaines-personne**, réparties sur l'epic |

### Prérequis

**Données de test :**
- `tests/fixtures/unity_dialogues/` : 4 dialogues copiés d'`Assets/Dialogue/` + `data/interactions/rencontre_dans_la_nef_centrale_unity.json` ; fichiers golden générés **avant** le premier changement.
- Fixture de perf 500 répliques, longueurs tirées de la distribution mesurée (script de 20.2).
- Fixtures e2e aux ids valides du schéma (`START`, `END`, `node-…`) : sinon l'autosave en mode export échoue et l'app change le nœud sélectionné sous le test.

**Outils :** Playwright (déjà là) pour traces Performance et captures dans `tmp/` ; aucun outil de comparaison d'image ni d'audit a11y automatique dans le dépôt (pas d'`axe`) — non ajouté par ce plan.

**Environnement :** e2e jamais contre `npm run dev` (auth active ⇒ 401 sur les seeds) ; `OPENAI_API_KEY=` vidée pour les API locales de worktree ; budget restauré dans `finally`.

---

## Critères de sortie par tranche

| Tranche | Critères de sortie |
|---|---|
| **1 — fondation** (20.1–20.3) | Golden pytest **et** Vitest verts en CI, marqueur `p0` ; aller-retour vert sur les fixtures et sur les 36 dialogues locaux (sortie citée) ; décision plan A / plan B écrite dans 20.2 avec les mesures (poste, navigateur, chiffres) ; seuil NFR-P1 tranché ; tokens publiés sur `:root`, captures avant/après jointes. |
| **1 bis — écriture** (18.4–18.9, 18.11) | P0 de 18.4, 18.5, 18.6 verts ; aucun test du panneau supprimé (le panneau reste derrière le drapeau) ; Backspace ne supprime pas un nœud ; lasso sans champ ; p95 frappe mesuré et sous le seuil retenu ; golden inchangé. |
| **2 — la scène** (20.4–20.10) | `graphToDocument` lit les handles d'issue, golden inchangé ; `scene` absente des trois chemins d'export ; test d'inventaire `contextStore` vert ; invité et 409 couverts (store en CI, e2e en local) ; specs e2e migrées (`graph-4-test-results`, `graph-test-node-generation-4results`, `graph-authoring-journey`) ; NFR-P1 tenu sur la plus grande fixture ; lignes du § 13 concernées cochées. |
| **3 — l'IA dans le texte** (20.11–20.15, 20.21, 20.22) | Aucun appel LLM réel en CI ; coût avant appel prouvé par test pour l'emplacement, le lot, la réécriture et la discussion ; contrat `rewrite-span` en pytest (schéma, coût, erreurs, droits) ; états 409/429/502 de la discussion ; 20.15 seulement si chaque ligne du § 13 a sa spec. |
| **4 — confort** (20.16–20.20, 20.23) | Contraste testé sur les tokens des deux thèmes ; journal : 409 propre et révision du document inchangée ; tactile vérifié sur viewport mobile et sur un appareil réel ; catalogues sans blocage des valeurs existantes ; ambiance sous le seuil de coût de perf ; golden inchangé (journal et intention jamais exportés). |

---

## Quality Gate Criteria

- **P0 :** 100 %, sans dérogation.
- **P1 :** ≥ 95 %, échec trié avec ticket.
- **P2/P3 :** ≥ 90 %, informatif.
- **Golden export :** zéro différence. Toute différence est soit un bug, soit un changement de contrat décidé par Marc et qui régénère les fichiers attendus dans une PR à part.
- **Risques ≥ 6 :** parade livrée avant la fin de la tranche concernée.
- **Couverture :** pas de pourcentage global imposé ici (aucune mesure de couverture en CI aujourd'hui) ; l'exigence est que chaque risque ≥ 6 ait au moins un test qui échoue si la parade disparaît.
- **NFR :** chaque catégorie a sa preuve prévue (tableau NFR) ; le verdict PASS/CONCERNS/FAIL revient à `nfr-assess` une fois la preuve produite.

---

## Mitigation Plans

### R-01 : Export Unity modifié en silence (score 9)

**Stratégie :** fixtures + golden committés **avant** tout changement ; deux tests figent cinq sorties figées, un fichier attendu par chemin (`tests/fixtures/unity_dialogues/expected/<chemin>/`) : `python-graphe` (route `save-and-write` sur `front-payload`), `python-lot`, `front-canonique`, `front-invite`, `front-payload` ; Vitest régénéré avant pytest. En 20.8, le test front échoue tant que les issues ne sont pas relues depuis les handles de la réponse. En 20.4, les deux tests vérifient l'absence de `scene`.
**Propriétaire :** Dev 20.1, puis chaque story qui touche le graphe ou le document. **Échéance :** 20.1. **Statut :** prévu.
**Vérification :** retirer la lecture des arêtes d'issue dans `graphToDocument` fait échouer le test front (contrôle par mutation à faire une fois).

### R-02 : Conversion non idempotente (6)

**Stratégie :** identité `serialize(parse(x)) === x` sur toutes les chaînes des fixtures et sur les cas limites ; règle d'implémentation testée : quitter un champ sans frappe n'écrit rien. **Échéance :** 20.1 / 18.5. **Vérification :** script local sur les 36 dialogues, sortie citée.

### R-03 : Perte de saisie (6)

**Stratégie :** test de store 409 pendant une rafale ; e2e local avec PUT concurrent ; invité sans champ. **Échéance :** 18.5, 20.10. **Vérification :** texte persisté (GET API) = texte tapé.

### R-04 : Liens de choix (6)

**Stratégie :** `choices` toujours reconstruit depuis le tableau courant du store ; test sur réponse porteuse de test. **Échéance :** 18.6.

### R-05 : Perf du graphe (6)

**Stratégie :** seuil tranché, fixture 500, mesure avant d'engager la tranche 2 ; plan B déjà défini (280 px, dépliage à la sélection). **Échéance :** 20.2.

### R-06 : Annulation incohérente (6)

**Stratégie :** décider `ctrl+z` dans `allowedInInputs` **ou** gestion par le champ avec `stopPropagation` (AC de 18.4) ; test composant du DOM après undo. **Échéance :** 18.4.

### R-07 : Dépense LLM (6)

**Stratégie :** coût avant appel et absence d'appel avant confirmation testés côté front ; gouvernance testée côté API pour chaque nouvel endpoint ; e2e sur client factice. **Échéance :** tranche 3.

### R-08 : Clavier (6)

**Stratégie :** une table, une aide générée, un test « aucune touche seule depuis un champ », un tableau navigateurs. **Échéance :** 20.14 (table dès 20.5).

### R-09 : Fiche de scène ignorée (6)

**Stratégie :** test d'inventaire des lecteurs de `contextStore` dans le chemin de génération ; test scène A après B. **Échéance :** 20.4.

### R-10 et R-11 : Specs couplées, CI aveugle aux parcours (6)

**Stratégie :** invariants en Vitest/pytest ; specs migrées dans la PR qui casse leur écran ; `test:e2e:verify` local en fin de tranche, sortie citée. **Échéance :** 20.8, 20.15, chaque fin de tranche.

---

## Assumptions and Dependencies

### Hypothèses

1. Le contenu actuel de l'export est la référence : le golden fige **aussi** ses éventuels défauts (ex. `exportToUnity` ne sort que `schemaVersion` et `nodes`). Un défaut trouvé se corrige dans une PR à part qui régénère le golden.
2. Le chemin `save-and-write` reste actif pour les documents sans `documentId` ; s'il est retiré, son golden pytest reste utile pour l'export par lot (`tests/services/test_batch_export_service.py`).
3. Le panneau de droite reste en lecture seule tant qu'il vit derrière le drapeau (A14) ; sinon R-04 remonte à 9.

### Dépendances

1. PR #103 fusionnée — requise par 20.21 (déjà sur `main` : commit `aba4683e1`).
2. Seuil NFR-P1 tranché — requis par 20.2.
3. Table des raccourcis (`frontend/src/components/shared/generalShortcuts.ts`, PR #104) — requise par 20.14.

### Risques sur le plan

- **`sprint-status.yaml` en retard sur le code** (18.3, 18.4 partiellement livrées) : une story recréée « from scratch » dupliquerait du code et des tests. *Contingence :* chaque spec `bmad-build` de la tranche 1 bis part de l'inventaire ci-dessus.
- **Estimations de sessions non recalées** (l'epic le dit) : *contingence :* recaler ce plan après 20.1 et 20.2.

---

## Follow-on Workflows (Manual)

- `bmad-testarch-atdd` : écrire les P0 en échec avant 20.1, 18.4 (reste) et 18.6.
- `bmad-testarch-automate` : couverture plus large une fois le code présent (contrainte brownfield active).
- `bmad-testarch-nfr` : verdict NFR quand les mesures de 20.2 existent.

## Approval

- [ ] Produit (Marc) : seuil NFR-P1, plafond de coût d'un lot, partage CI / local accepté.
- [ ] Tech lead : golden double, fixtures choisies.

---

## Interworking & Regression

| Composant | Impact | Tests existants qui doivent rester verts |
|---|---|---|
| `persistenceSlice` / autosave | Écriture in-situ, 409, invité | `persistenceSlice.revisionConflict.test.ts`, `useDialogueLoader.autosaveRetry.test.ts`, `GraphEditor.autosave.test.tsx`, `tests/api/test_documents.py` |
| `documentToGraph` / export | TestNode retirés, `scene` | `documentToGraph.test.ts`, `persistenceSlice.exportUnity.test.ts`, `tests/api/test_unity_export_story_5_1.py` |
| `nodeSlice` / `undoSlice` | Champs in-situ | `graphStore.updateNodeUndo.test.ts`, `graphStore.undoRedo.test.ts`, `runGraphTransaction.test.ts` |
| `edgeSlice` / génération | Emplacement, options | `graphStore.generateFromLeaf.test.ts`, `graphStore.acceptReject.test.ts`, `graphStore.regenerate.test.ts` |
| `testNodeSync` | Issues en handles | `testNodeSync.test.ts`, `useGraphStore.testNodeSync.test.ts` |
| Disposition | `LR` | `dagreLayout*.test.ts`, `edgeRouting.test.ts` |
| Back-end génération, lot, conversations | Inchangé côté contrat | `tests/api/test_graph_*.py`, `test_batch_jobs_restart.py`, `test_ai_conversations.py` |
| Parcours e2e | Panneau et TestNode retirés | 7 specs listées au constat 6 + `e2e/helpers.ts` |

---

## Appendix

### Knowledge Base References

- `risk-governance.md`, `probability-impact.md`, `test-levels-framework.md`, `test-priorities-matrix.md`, `nfr-criteria.md`

### Documents liés

- Epic : `_bmad-output/planning-artifacts/epics/epic-20.md`, `_bmad-output/planning-artifacts/epics/epic-18.md`
- Architecture : `docs/architecture/refonte-scene-architecture.md`, `docs/architecture/conversations-ia.md`, `docs/architecture/adr-008-perf-targets.md`
- Design : `docs/design/refonte-scene/README.md`

---

**Généré par :** BMad TEA Agent — Test Architect Module
**Workflow :** `bmad-testarch-test-design`
**Version :** 4.0 (BMad v6)
