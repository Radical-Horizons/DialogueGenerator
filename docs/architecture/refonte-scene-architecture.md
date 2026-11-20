# Refonte « Scène » — architecture et migration

**Statut : validée le 2026-11-20, prioritaire** (epic 20, démarrée tout de suite). Compagnon technique de
[`docs/design/refonte-scene/README.md`](../design/refonte-scene/README.md). Epic proposée :
[`epic-20.md`](../../_bmad-output/planning-artifacts/epics/epic-20.md).

Ce document dit ce qui change **sous** l'interface pour que la refonte tienne, dans quel ordre, et ce qui ne change
pas. Les affirmations sur le code citent leur source ; ce qui reste à vérifier est marqué ⚠.

## 1. Ce qui ne change pas

- **Le document canonique Unity JSON reste la source de vérité** (ADR-008, Epic 16) : `GET/PUT /api/v1/documents/{id}`,
  `revision`, 409 adopté puis une relance, `choiceId` stables, layout en artefact distinct.
- **L'export Unity reste octet pour octet identique** pour un document qui ne change pas.
- **La génération** garde sa construction : `GraphPromptContextFactory` (`services/graph_prompt_context.py`) résout le
  contexte GDD une fois par requête, `PromptEngine` enveloppe chaque appel ; structured output inchangé.
- **Sauvegarde automatique** (ADR-006, préférence produit) : pas de brouillon, pas de bouton Enregistrer.
- **Les tests de non-régression existants** (~259 fichiers pytest, ~231 Vitest, 20 specs Playwright) restent la
  garde ; une story qui fait tomber un test vérifie d'abord si une fonction a disparu (règle du dépôt).

## 2. Décisions proposées

### A1 — La scène porte sa distribution et son contexte

**Problème.** Le contexte de génération vit dans un store global (`contextStore`, colonne Contexte GDD) partagé par
toutes les scènes. Conséquence vécue le 2026-11-19 : une suite du graphe de Voknir générée avec le PNJ d'une autre
scène ; contournement par `resolveGraphGenerationDramatis` (`frontend/src/utils/sceneDramatis.ts`), qui *devine* le
PNJ et le PJ à partir du graphe.

**Décision.** Le document porte une **fiche de scène** en tête :

```json
{
  "schemaVersion": "…",
  "title": "Rencontre avec le forgeron itinérant",
  "scene": {
    "npcs": [{ "entryId": "1b46e4d2-1b45-8081-992e-febbfed44a5d", "name": "Grish T'vok" }],
    "pc": { "entryId": "…", "name": "Uresaïr" }, "place": null,
    "brief": "…", "tones": ["tension", "intime"], "authorProfileId": "…",
    "linkedEntries": [{ "category": "Personnages", "entryId": "…" }],
    "contextBudget": "auto"
  },
  "dialogueFlags": [], "nodes": []
}
```

- **Identifiant stable** : `entryId` = le `notion_page_id` de la fiche du GDD (présent dans chaque fichier, ex.
  `personnages/Grish_T_vok_1b46e4d2-….json`) ; `name` n'est qu'un libellé. Le `speaker` des nœuds reste une chaîne
  (format Unity) ; à la migration, ses graphies sont rapprochées de la fiche (le forgeron en a deux, `T'vok` et
  `T’vok`, plus un locuteur vide sur une réplique ajoutée à la main) et proposées à l'auteur, jamais réécrites sans lui.
- Additif : un document sans `scene` reste valide ; à l'ouverture, la fiche est **déduite une fois** par
  `resolveGraphGenerationDramatis`, montrée dans la fiche pour correction, puis enregistrée (migration paresseuse).
- **Une scène est enregistrée dès sa création** (ALT+N crée le document avant toute génération). Effet de bord voulu :
  la première réplique générée est rattachée à son appel LLM, ce qui lève la limite « nœud START de Générer sans
  dialogue » de la PR #103 (`docs/architecture/conversations-ia.md`).
- Toute génération (premier nœud, suite, lot, réécriture) lit la fiche. Le `contextStore` global garde le catalogue
  GDD et les sélections **hors scène** (page Fiches du GDD) ; ses lecteurs dans le chemin de génération sont à
  inventorier en story 20.4 (critère : plus aucun appel de génération ne lit les sélections globales).
- **Export : `scene` est retirée.** Vérifié le 2026-11-20 sur le contrat publié
  (`docs/JsonDocUnity/Documentation/dialogue-format.schema.json`) : la racine n'a pas d'`additionalProperties`, donc
  une clé de tête en plus y est permise, alors que tous les objets imbriqués l'interdisent. Le chargeur C# n'est pas
  dans ce dépôt ; plutôt que de parier sur lui, l'export retire `scene` comme il retire déjà les métadonnées éditeur
  des nœuds. Coût nul, export identique (fixtures 20.1).

### A2 — Une seule surface d'édition, qui écrit directement dans le store

**Problème.** Le même nœud s'édite dans l'onglet Éditer (`UnityDialogueEditor`), le formulaire du panneau
(`NodeEditorPanel`, react-hook-form) et le résultat de génération. Le formulaire est une copie tampon qu'il faut
« flusher » au changement de sélection : `targetNode` écrasé, choix hérités par un nœud neuf (2026-11-12), titre
effacé (2026-11-12) — trois bugs de la même famille (`.claude/rules/graph_editor.md`).

**Décision.** Le **champ d'Epic 18** (`<textarea>` non contrôlé, D4) devient l'unique surface d'écriture, utilisé
dans la carte du graphe **et** dans le bloc de script. Il écrit champ par champ via `updateNode` transactionnel
(story 18.4). Quand la vue Script et la vue Graphe sont livrées, `NodeEditorPanel` et `UnityDialogueEditor` sont
retirés, et avec eux le protocole flush/confirmFlush.

### A3 — Texte structuré à l'affichage, texte brut à l'écriture

**Problème.** Les conventions vivent dans la chaîne : `*…*` pour les didascalies, `*[Vous …]*` pour les actions du PJ,
préfixes « (Test d'intimidation DD9) ». Le correctif v1.10.1 (« `* [Vous …]*` recollé ») montre la fragilité.

**Décision.** Une **couche de conversion pure** `line → blocs` (`didascalie`, `réplique`, segments en ligne), pour
**l'affichage seulement** :
- l'affichage (carte, script, jouer) rend les blocs ;
- **l'écriture reste le `<textarea>` d'Epic 18 (D4), un par réplique** : à l'entrée dans une réplique, **toute la
  réplique** passe en texte brut avec ses `*…*` ; à la sortie, elle redevient mise en forme. Pas d'éditeur de blocs,
  pas de champ par paragraphe : sélection, flèches, collage et annulation restent ceux d'un `<textarea>` (option
  écartée : « seul le paragraphe actif en brut », qui aurait exigé un éditeur de blocs — sélection entre paragraphes,
  collage multi-paragraphes, coalescence d'annulation — et contredit D4) ;
- **aucun changement de stockage** : la chaîne Unity reste la donnée ;
- test aller-retour `serialize(parse(x)) === x` exécuté **en CI** sur des fixtures committées
  (`tests/fixtures/unity_dialogues/`, à créer en story 20.1 : 4 dialogues copiés de `Assets/Dialogue/`, dont l'import
  Notion de Voknir pour ses conventions hors modèle, plus `data/interactions/rencontre_dans_la_nef_centrale_unity.json`
  déjà versionné), et en contrôle supplémentaire local sur les 36 dialogues de `Assets/Dialogue/` (dossier ignoré par
  git, présent seulement sur le poste de l'auteur).

### A4 — La vue Script est une projection, pas une donnée

Le Script affiche le chemin suivi (`[{choiceIndex, outcome}]`), stocké dans l'état d'interface (par scène, en
mémoire locale de session), jamais dans le document. Les compteurs du fil (répliques, mots, suites à écrire, réponses
vides) se dérivent du document en une passe.

### A5 — Une primitive d'IA, trois points d'entrée

| Point d'entrée | Endpoint | Existant ? |
|---|---|---|
| Emplacement à écrire (suite) | `POST /api/v1/unity-dialogues/graph/generate-node` | oui |
| Régénérer une réplique, variante | `POST /api/v1/unity-dialogues/graph/nodes/{id}/regenerate` | oui |
| CTRL+K sur une sélection (réécrire un passage) | `POST /api/v1/unity-dialogues/graph/rewrite-span` (nouveau) | **non** — même `GraphPromptContextFactory`, sortie = un passage, pas un nœud |

Toutes passent par l'estimation (`…/graph/estimate-cost`) avant l'appel et affichent le coût engagé pendant. La connexion
parent → nouveau nœud reste faite par le front (`connectNodes` dans `generationSlice`), jamais déléguée à l'API.

### A6 — Diagnostics continus

- **Calculables** (réponse vide, suite manquante, nœud jamais atteint, test sans issue) : recalculés dans le front sur
  changement du document, avec un délai de 300 ms, sans appel réseau → popover « PROBLÈMES » et marques en place.
- **Validation serveur** (schéma Unity, lore) : à l'enregistrement, comme aujourd'hui (`structured_errors`).
- **Jugements LLM** (qualité, slop, langue : accords, fautes probables) : à la demande seulement (« Relecture »),
  résultats en notes de marge et dans un groupe « RELECTURE » séparé du popover, daté de la dernière passe. Aucun
  jugement simulé par heuristique (règle « diagnostic : uniquement du calculable ») ; une faute n'est pas un
  avertissement permanent.

### A7 — Mécanique tirée des catalogues

Traits, compétences et flags proviennent de `FlagCatalog.csv`, `SkillCatalog.csv`, `TraitCatalog.csv`
(`data/UnityData/`) : autocomplétion dans les popovers des puces, valeur inconnue refusée, renommage partout.

### A8 — Thèmes par variables CSS

Les tokens (`redesignTokens.ts`) sont publiés en variables CSS sur `:root` (`[data-theme="papier"]` pour Papier) ;
les styles inline lisent `var(--…)`. Coût : migration mécanique des fichiers déjà sur `redesignTokens` (88 par grep,
tests compris, au 2026-11-20) ; les 197 encore sur `theme.ts` suivent écran par écran. Bénéfice annexe : `:hover`, `:focus-visible` et media queries
redeviennent possibles sans contournement.

### A9 — Graphe : flux gauche → droite, cartes 360 px, tests en sorties

- `dagre` passe en `rankdir: 'LR'` ; hauteur de carte connue par palier de zoom (A10) pour éviter les chevauchements.
- Les `TestNode` cessent d'être rendus (ils sont déjà dérivés, `testNodeSync.ts`) : leurs 4 issues deviennent des
  handles de la réponse ; l'export n'en dépend pas.
- Migration : une redisposition par dialogue à la première ouverture, positions précédentes conservées dans le layout
  (retour possible).

### A10 — Zoom par paliers sans re-rendu par image

Trois paliers (écrire ≥ 100 %, lire 40–75 %, situer < 40 %) calculés **à `onMoveEnd`** et posés dans
`graphViewStore` ; les cartes lisent le palier par sélecteur. La carte en écriture est exclue du changement de palier.
⚠ À prouver : rendu ≤ 1 s sur 500 nœuds (NFR-P1) et aucune image > 16 ms pendant un zoom — prototype en story 20.2
avant la livraison.

### A12 — Journal d'édition : ce qui n'est pas du dialogue

**Problème.** Provenance du texte généré (« jusqu'à la première retouche »), variantes `‹ 2/3 ›`, versions retouchées à
la main, notes de relecture ignorées : rien de cela n'est du dialogue Unity, et rien n'a de place aujourd'hui (seuls
`status`, `regenerationHistory`, `lastGenerationInstructions` vivent déjà dans les nœuds comme métadonnées éditeur).

**Décision.** Un **journal d'édition** par dialogue, artefact distinct comme le layout (ADR-008) :
`journal/<dialogueId>.json` à côté de `Layouts/`, lu et écrit par `GET/PUT /api/v1/documents/{id}/journal`. Le
journal a **son propre compteur `revision`** et son propre 409 (même protocole que le document : révision serveur
adoptée, une relance) : écrire une version ne fait jamais monter la révision du document, donc ne provoque aucun
conflit sur le texte.

```json
{ "revision": 12, "entries": {
  "node-3836…": {
    "versions":   [{ "at": "…", "by": "llm|auteur", "model": "gpt-6.2-sol", "text": "…" }],
    "variants":   [{ "id": "v2", "text": "…", "kept": false }],
    "provenance": [{ "start": 0, "end": 212, "source": "llm" }],
    "dismissed":  [{ "rule": "tournure-frequente", "span": "comme une …" }]
  } } }
```

- Jamais lu par l'export Unity (aucun changement d'export) ; les champs éditeur déjà présents dans les nœuds y migrent
  à terme, en option.
- Plafond : 20 versions par réplique, les plus anciennes résumées (texte seul).
- Provenance recalculée à chaque frappe : une plage retouchée sort de la provenance « llm ».

### A13 — Lots : réutiliser les jobs existants

Le tiroir Lot (`Lot.dc.html`) s'appuie sur les jobs de lot persistés (`data/batch_jobs/*.json`, FR87/FR88) : un seul
worker, un job interrompu au redémarrage, reprise des seuls parents restants. Ajouts : portée par niveau ou par
scène, exclusions (réponses vides, répliques jamais atteintes), coût total estimé avant (`estimate-cost` × N),
progression dans la barre d'état, revue en série des « à valider ».

### A14 — Réversibilité du retrait du panneau

Pendant la tranche 2, `GraphInspector` et `NodeEditorPanel` restent montables derrière un drapeau
(`uiLayoutStore.legacyInspector`, défaut : faux) avec un compteur local d'ouvertures. Le retrait définitif (story
20.15) n'a lieu qu'après un mois d'usage avec un compteur à zéro, ou sur décision de l'auteur.

### A15 — Conversations avec l'IA : intégration front (PR #103)

**Socle.** La PR #103 livre le back-end : `POST/GET/DELETE /api/v1/ai-conversations`, `POST …/{id}/messages`, sujets
enfichables (`dialogue_node` d'abord), instantané de la génération (contexte, sortie, résumé de réflexion quand OpenAI
le fournit), nœud tel qu'il est aujourd'hui, budget, 40 messages, tours en série, invité en lecture seule. Limite
mesurée : l'IA ne relit pas son raisonnement brut ; une explication après coup est une reconstruction.

**Décision front.** Une seule surface, le **tiroir Discussion** (tiroir temporaire de 380 px, même famille que
Contexte, Versions et Lot ; ÉCHAP ferme ; jamais de panneau permanent), avec trois entrées :

| Entrée | Sujet | Où | Story |
|---|---|---|---|
| « Pourquoi ? » sur une réplique générée | `dialogue_node` (livré) | marge du bloc (Script), pied de carte (Graphe), palette | 20.21 |
| « Demander » depuis la palette | `ui_help`, `gdd_query` (résolveurs à écrire) | CTRL+K « Rechercher, aller à, demander… » | 20.22 |
| « Signaler un problème » | `code_assist` | menu « ? » | **hors epic** : epic à part (agent de code isolé, PR, revue humaine, jamais d'exécution depuis l'API de prod) |

Ordre du tiroir pour une réplique : (1) ce qui a été généré, en diff avec la réplique actuelle (composant de Versions,
A12), modèle et date ; (2) le résumé de réflexion, replié, quand il existe ; (3) la ligne fixe sur la limite de
reconstruction ; (4) le fil de messages, chaque réponse avec son coût réel (`cost_usd`) ; (5) le champ, verrouillé
pendant un tour. Une réplique qui a des discussions porte une marque « ◆ n » dans sa marge ; le tiroir Versions les
liste. Les conversations restent côté serveur (SQLite de la PR #103), pas dans le journal d'édition.

**Notes d'intention (option C de l'étude).** Seule source d'un « pourquoi » fiable, mais elle change le contrat de
génération. Décision : expérience mesurée d'abord (story 20.23, juge à l'aveugle sur 20 suites) ; si la qualité tient,
l'intention est rangée dans le journal d'édition (A12), jamais exportée, et montrée en tête du tiroir.

### A16 — Ambiance : teintes de lieu et images

- **Teintes** : une table de huit ambiances (même clarté et même saturation en OKLCH, hors de la zone du bleu
  d'action), choisie par lieu dans la fiche de scène ; publiée en variables CSS (A8), déclinée en Papier à clarté 0,50.
  Elles ne touchent que les fonds (bandeau, zone de lecture), les points et les puces de lieu, jamais le texte courant.
- **Images** : portraits et illustrations de lieu copiés à la synchro Notion (les URL de fichiers Notion expirent),
  retouchés une seule fois à l'import (même désaturation et assombrissement pour toutes, fondus intégrés), stockés avec
  les fiches en WebP (portrait 192 px, couverture 960 × 540, 200 Ko au plus) et servis par l'API avec cache long.
  Aucun filtre, masque, flou ni animation CSS en direct.
- **Repli** : sans portrait, pastille de couleur avec initiales ; sans lieu illustré, portrait du PNJ sur la teinte du
  lieu ; sans rien, « lieu et portrait à renseigner ».
- **Graphe** : médaillon de 20 px au palier « écrire » seulement ; rien aux paliers « lire » et « situer ».
- Maquettes : canvas « Ambiance » <https://claude.ai/artifact/GVZfj6RsZqGQGwEg8X5SxN> (deux écrans, notés 8,1/10).

### A11 (pari) — Document collaboratif (Yjs)

Gains : sauvegarde, annulation par auteur, hors ligne et co-édition sans 409. Coût : refonte de la persistance. **Ne
se justifie que si plusieurs auteurs écrivent la même scène en même temps** ; à rouvrir après la tranche 2 si la
co-édition actuelle (partage, permissions) montre ce besoin.

## 3. Ordre et dépendances

```
Tranche 1 — fondation, tout de suite                                             ≈ 5 sessions   20.1–20.3
  A3 conversion + fixtures CI · preuve de perf A10 · A8 variables CSS
Tranche 1 bis — fondation d'écriture (stories d'Epic 18), en parallèle           ≈ 12 sessions  18.4–18.9, 18.11
  A2 champ unique · annulation transactionnelle · clavier composite · indicateur d'enregistrement
Tranche 2 — la scène                                                             ≈ 15 sessions  20.4–20.10
  A1 fiche → enveloppe → A4 Script → A9 cartes et flux LR → tests en sorties → lentille et popovers → états
  A14 panneau derrière un drapeau
Tranche 3 — l'IA dans le texte                                                    ≈ 15 sessions  20.11–20.15, 20.21, 20.22
  A5 emplacement et options · A13 lots · rewrite-span · A6 diagnostics · A15 discussions · retrait du panneau
Tranche 4 — confort                                                              ≈ 15 sessions  20.16–20.20, 20.23
  Papier, Focus · A12 journal · téléphone et tactile · A7 catalogues · A16 ambiance · notes d'intention
Chemin critique : tranche 1 bis → 2 → 3 → 4 ≈ 57 sessions (tranche 1 en parallèle de la tranche 1 bis).
```

## 4. Risques et parades

| Risque | Parade |
|---|---|
| L'export Unity change sans qu'on le voie | Test golden en CI sur les fixtures committées (4 scènes) avant / après chaque tranche, comparaison octet par octet ; contrôle local en plus sur les 36 dialogues de `Assets/Dialogue/` (non versionnés) |
| Perte de fonction en retirant un écran | Table « où va chaque fonction » (README § 13), vérifiée par story ; un test e2e par parcours ; panneau derrière un drapeau (A14) |
| Perf du graphe avec des cartes plus hautes | Preuve 20.2 avant engagement ; `onlyRenderVisibleElements` conservé ; **plan B** : cartes 280 px et dépliage à la sélection (Epic 18 D3), le texte complet restant dans la vue Script |
| Conflit TAB (suite vide en Script, navigation entre nœuds en Graphe, Epic 14.1) | TAB n'a ce sens qu'en vue Script ; aide clavier générée depuis une seule table |
| Raccourcis captés par le navigateur sous Windows (ALT seul, CTRL+1–9, CTRL+N) | Choix L, ALT+1/2/3, ALT+N ; vérification Chrome, Edge, Firefox et PWA en critère d'acceptation |
| Fiche de scène mal déduite, graphies de locuteur multiples | Déduction et rapprochement visibles et corrigeables dans la fiche ; jamais silencieux |
| Journal d'édition qui grossit | Plafond de 20 versions par réplique, résumé au-delà |

## 5. Comment on saura que c'est gagné

| Mesure | Aujourd'hui (2026-11-19) | Cible |
|---|---|---|
| Largeur du graphe à 1 440 px | ≈ 720 px (mesuré sur capture) | 1 188 px classeur ouvert, 1 384 px replié |
| Texte lisible dans le graphe sans ouvrir de panneau | tronqué (« carav… ») | réplique sur 12 lignes au palier « écrire », 2 au palier « lire », entière en défilant ou en vue Script |
| Répliques jamais atteintes visibles | non (8 sur 19 dans la scène du forgeron) | encadrées au palier « situer », comptées dans PROBLÈMES |
| Clics pour corriger une réponse depuis le graphe | sélectionner, « éditer », trouver le champ, taper (≥ 3) | 1 clic dans le texte |
| Décompte affiché pour 19 répliques | « 67 NŒUDS » | « 19 RÉPLIQUES » |
| Suites à écrire visibles | non | compteur + TAB |

## 6. Sources

- Inventaire de l'interface et captures « avant » : session du 2026-11-19 (captures dans `docs/design/refonte-scene/captures/`).
- Recherche sur les éditeurs (articy:draft X, Arcweave, Yarn Spinner, tldraw, Heptabase, React Flow) et sur les
  outils d'écriture (iA Writer, Ulysses, Scrivener, Final Draft, Highland 2, Inky, inklewriter, Cursor, Copilot,
  Notion AI, Sudowrite, Linear, Raycast, Superhuman, NN/g, WCAG) : synthèse et URL dans
  [`_bmad-output/planning-artifacts/research/ux-refonte-scene-2026-11-19.md`](../../_bmad-output/planning-artifacts/research/ux-refonte-scene-2026-11-19.md).
- Cadrage antérieur : [`research/ux-edition-in-situ-articy-notion-2026-10-01.md`](../../_bmad-output/planning-artifacts/research/ux-edition-in-situ-articy-notion-2026-10-01.md), Epics 18 et 19.
