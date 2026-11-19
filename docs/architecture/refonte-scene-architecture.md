# Refonte « Scène » — architecture et migration

**Statut : proposition du 2026-11-20, non validée.** Compagnon technique de
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
    "npcIds": ["Grish T'vok"], "pcId": "Uresaïr", "placeId": null,
    "brief": "…", "tones": ["tension", "intime"], "authorProfileId": "…",
    "linkedEntries": [{ "category": "Personnages", "name": "Grish T'vok" }],
    "contextBudget": "auto"
  },
  "dialogueFlags": [], "nodes": []
}
```

- Additif : un document sans `scene` reste valide ; à l'ouverture, la fiche est **déduite une fois** par
  `resolveGraphGenerationDramatis` puis enregistrée (migration paresseuse, pas de script).
- Toute génération (premier nœud, suite, lot, réécriture) lit la fiche ; le store global de contexte devient un
  simple cache de catalogue GDD.
- ⚠ À vérifier avant la story : le chargeur Unity ignore-t-il une clé de tête inconnue ? Sinon, l'export retire
  `scene` (comme il retire déjà les métadonnées éditeur des nœuds).

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

**Décision.** Une **couche de conversion pure** `line ↔ blocs` (`didascalie`, `réplique`, segments en ligne) :
- l'affichage (carte, script, jouer) rend les blocs ; le champ en écriture montre le texte brut de **la ligne
  active** seulement (modèle « aperçu vivant », comme Highland : on ne réécrit jamais le texte de l'auteur) ;
- **aucun changement de stockage** : la chaîne Unity reste la donnée ;
- test aller-retour `parse(serialize(x)) === x` sur **tous** les dialogues de `Assets/Dialogue/` (36 fichiers, 623
  réponses au 2026-11-19) avant toute story d'affichage.

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
- **Jugements LLM** (qualité, slop) : à la demande seulement (« Relecture »), résultats en notes de marge. Aucun
  jugement simulé par heuristique (règle « diagnostic : uniquement du calculable »).

### A7 — Mécanique tirée des catalogues

Traits, compétences et flags proviennent de `FlagCatalog.csv`, `SkillCatalog.csv`, `TraitCatalog.csv`
(`data/UnityData/`) : autocomplétion dans les popovers des puces, valeur inconnue refusée, renommage partout.

### A8 — Thèmes par variables CSS

Les tokens (`redesignTokens.ts`) sont publiés en variables CSS sur `:root` (`[data-theme="papier"]` pour Papier) ;
les styles inline lisent `var(--…)`. Coût : migration mécanique des ~73 fichiers déjà sur `redesignTokens`, les ~181
encore sur `theme.ts` suivent écran par écran. Bénéfice annexe : `:hover`, `:focus-visible` et media queries
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

### A11 (pari) — Document collaboratif (Yjs)

Gains : sauvegarde, annulation par auteur, hors ligne et co-édition sans 409. Coût : refonte de la persistance. **Ne
se justifie que si plusieurs auteurs écrivent la même scène en même temps** ; à rouvrir après la tranche 2 si la
co-édition actuelle (partage, permissions) montre ce besoin.

## 3. Ordre et dépendances

```
Tranche 1 — fondation (rien de visible ne casse)
  A3 conversion texte ↔ blocs + aller-retour        A8 variables CSS (Nuit seul)
Tranche 2 — la scène (Epic 18 livrée avant)
  A1 fiche de scène → A4 vue Script → A2 retrait des formulaires
  A9 + A10 graphe LR, cartes 360, paliers
Tranche 3 — l'IA dans le texte
  A5 emplacement à écrire, options ‹ 1/4 ›, rewrite-span     A6 diagnostics continus
Tranche 4 — confort
  thème Papier, Focus, versions, gestes, mobile              A7 catalogues
```

## 4. Risques et parades

| Risque | Parade |
|---|---|
| L'export Unity change sans qu'on le voie | Test golden : export de chaque dialogue d'`Assets/Dialogue/` avant / après chaque tranche, comparaison octet par octet |
| Perte de fonction en retirant un écran | Table « où va chaque fonction » du README § 12, vérifiée par story ; un test e2e par parcours |
| Perf du graphe avec des cartes plus hautes | A10 prouvé avant livraison ; `onlyRenderVisibleElements` conservé |
| Conflit TAB (suite vide en Script, navigation entre nœuds en Graphe, Epic 14.1) | TAB n'a ce sens qu'en vue Script ; aide clavier générée depuis une seule table |
| Fiche de scène mal déduite à la migration | Déduction visible et corrigeable dans la fiche ; jamais silencieuse |

## 5. Comment on saura que c'est gagné

| Mesure | Aujourd'hui (2026-11-19) | Cible |
|---|---|---|
| Largeur du graphe à 1 440 px | ≈ 720 px (mesuré sur capture) | 1 384 px (classeur en rail) |
| Texte lisible dans le graphe sans ouvrir de panneau | tronqué (« carav… ») | complet au palier « écrire » |
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
