---
stepsCompleted: ['step-01-document-discovery', 'step-02-prd-analysis', 'step-03-epic-coverage-validation', 'step-04-ux-alignment', 'step-05-epic-quality-review', 'step-06-final-assessment']
verdict: 'Epic 20 PRÊTE SOUS CONDITIONS : tranche 1 (20.1-20.3), 18.4 et 18.8 démarrables après 3 correctifs documentaires ; le reste de la tranche 1 bis doit être reséquencé avant création de ses stories.'
scope: 'Epic 20 (refonte « Scène ») et sa tranche 1 bis (stories 18.4-18.9 et 18.11 d Epic 18) — évaluation delta'
mode: 'non interactif — arbitrages notés en fin de rapport'
inputDocuments:
  - '_bmad-output/planning-artifacts/epics/epic-20.md'
  - '_bmad-output/planning-artifacts/epics/epic-18.md'
  - '_bmad-output/planning-artifacts/epics/epic-19.md'
  - '_bmad-output/planning-artifacts/epics/epic-index.md'
  - '_bmad-output/planning-artifacts/epics/epic-list.md'
  - '_bmad-output/planning-artifacts/epics/requirements-inventory.md'
  - '_bmad-output/planning-artifacts/prd/functional-requirements.md'
  - '_bmad-output/planning-artifacts/prd/non-functional-requirements.md'
  - 'docs/architecture/refonte-scene-architecture.md'
  - 'docs/architecture/conversations-ia.md'
  - 'docs/design/refonte-scene/README.md'
  - 'docs/design/refonte-scene/*.dc.html (23 boards)'
  - '_bmad-output/planning-artifacts/ux-design-specification/ (index + 12 shards)'
  - '.claude/rules/ui_refonte_scene.md'
  - '.claude/rules/ui_redesign_2026.md'
  - '_bmad-output/implementation-artifacts/sprint-status.yaml'
  - '_bmad-output/project-context.md'
  - '.claude/skills/bmad-create-story/SKILL.md'
priorReport: '_bmad-output/planning-artifacts/implementation-readiness-report-2026-10-01.md'
---

# Implementation Readiness Assessment Report

**Date :** 2026-11-20
**Projet :** DialogueGenerator
**Périmètre :** Epic 20 (refonte « Scène », validée et prioritaire le 2026-11-20) et sa tranche 1 bis (18.4, 18.5,
18.6, 18.7, 18.8, 18.9, 18.11). Évaluation **delta** : les rapports du 2026-01-15 et du 2026-10-01 restent la
référence pour les autres epics.

---

## Verdict

### PRÊTE SOUS CONDITIONS

- **Démarrables tout de suite, après les trois correctifs bloquants (documentaires, ≈ 1 h)** : 20.1, 20.2, 20.3
  (tranche 1), 18.4 (annulation) et 18.8 (indicateur d'enregistrement). Leurs propres points « à corriger » (C1, C2)
  se règlent à la création de la story.
- **Pas démarrables en l'état** : 18.5, 18.6, 18.7, 18.9, 18.11. Elles sont écrites contre la densité
  résumé/dépliée et les réponses en lignes de 18.1 et 18.2, retirées du plan, alors que leurs remplaçantes (20.7,
  20.8) viennent en tranche 2. L'affirmation « tranche 1 bis : maintenant, en parallèle de la tranche 1 »
  (`epic-20.md:441`) est fausse pour ces cinq stories (B1).
- **Tranches 2 à 4** : la couverture FR est complète sur le papier (15/15), mais plusieurs destinations de la table
  « où va chaque fonction » (README § 13) n'ont **aucune story** (vue Jouer, tiroir Contexte, écran Fiches du GDD,
  palette, menu « fiche ▾ »). Les stories 20.5, 20.11 et 20.15 ne peuvent pas tenir leurs critères tant que ces trous
  ne sont pas comblés (C7, C10).

**Décompte** : 3 bloquants · 18 à corriger avant la story concernée · 12 mineurs. Déjà en cours ailleurs, non
comptés : boards Discussion (20.21, 20.22) et Ambiance (20.20).

**Dépendances externes vérifiées et levées** : PR #103 fusionnée (`aba4683e1`, routes `/api/v1/ai-conversations`
présentes), PR #104 fusionnée (`8cf2f8688`, `frontend/src/components/shared/generalShortcuts.ts` existe), harnais
`e2e/perf-document-load.spec.ts` présent, Epic 17 `done`, `data/interactions/rencontre_dans_la_nef_centrale_unity.json`
et `data/UnityData/{Flag,Skill,Trait}Catalog.csv` présents, `uiLayoutStore` existe (drapeau A14 implantable).
**Non levée** : Epic 14 (voir C4).

---

## Constats bloquants

### B1 — La tranche 1 bis repose sur trois stories retirées et sur la tranche 2

**Preuve.**
- 18.5 : « **Given** un nœud seul sélectionné, **en densité dépliée** » et « un nœud non sélectionné **en densité
  résumé** … sélectionné **et déplié** » (`epic-18.md:329-338`). La densité dépliée (réplique intégrale) est le
  livrable de 18.1, **remplacée** (`epic-20.md:27-28`). Aujourd'hui le nœud tronque : `nodeLinePreview.ts:13-16`
  coupe à `NODE_LINE_PREVIEW_MAX_CHARS`. On ne peut pas « cliquer à l'endroit voulu » dans un texte tronqué.
- 18.6 : « **Given** un nœud déplié avec N réponses, **When** je clique dans le texte d'une réponse »
  (`epic-18.md:405-407`). Les réponses en lignes sont le livrable de 18.2, **remplacée** par 20.7/20.8, en tranche 2.
- 18.7 : « **Prérequis** : le titre doit être rendu dans le nœud — c'est un livrable de 18.1 » (`epic-18.md:453`).
- 18.11 : AC « aucun nœud ne se déplie » (multi-sélection), « hauteur de référence = densité résumé » (layout),
  « export PNG en densité résumé » (`epic-18.md:653-666`), toutes définies par D3 d'origine, que la refonte rouvre
  (paliers de zoom, A10 ; « hauteur de carte connue par palier », A9 `refonte-scene-architecture.md:138`).
- 18.9 : « il est seul sélectionné, **déplié**, et le curseur est déjà dans la réplique » (`epic-18.md:571-573`).

**Conséquence.** Soit ces stories reconstruisent 18.1/18.2 sur `DialogueNode` (280 px, densité par sélection) pour
les jeter en 20.7 (≈ 3 à 4 sessions perdues), soit elles bloquent en cours de route.

**Correctif proposé (tranché, option recommandée).** Récrire le tableau de la tranche 1 bis (`epic-20.md:126-140`)
et le chemin critique (`:438-450`) :
1. **Restent en tranche 1 bis, maintenant** : 18.4 et 18.8 (aucune dépendance de géométrie) ; plus **18.5a**, le
   composant de champ seul (`<textarea>` D4, D2 ÉCHAP + `stopPropagation`, gardes pointeur `nodrag`/`nowheel`/clic
   droit/double-clic/infobulle, invité et modes lecture, patch mono-champ via 18.4, placeholder, ARIA), testé en
   Vitest/RTL hors graphe — c'est le découpage déjà suggéré en `epic-18.md:391`.
2. **Passent en tranche 2, après 20.6 et 20.7** : 18.5b (montage dans le bloc de script et la carte), 18.6, 18.7,
   18.9, 18.11, avec leurs AC réécrites contre la carte (palier « écrire », 360 px ou 280 px plan B) et le bloc de
   script. 20.6 et 20.7 montent le champ de 18.5a.
3. Alternative si l'on veut une édition in-situ utilisable avant la tranche 2 : réintégrer dans 18.5 les AC
   minimales de 18.1 (réplique intégrale à la sélection unique, titre rendu) et de 18.2 (réponses en lignes),
   en assumant explicitement leur remplacement en 20.7.

### B2 — Le retrait de 18.3 ouvre le chemin de perte de données qu'elle fermait

**Preuve.** `epic-20.md:28-29` : « 18.3 … devient inutile : tant que le panneau de droite reste derrière son
drapeau (A14), **ses champs de texte sont en lecture seule** ». Aucune AC ne pose cette lecture seule : 20.5 ne dit
que « l'ancien panneau de droite reste montable et chaque ouverture incrémente un compteur » (`epic-20.md:174-175`),
et A14 non plus (`refonte-scene-architecture.md:185-189`). Le drapeau lui-même n'arrive qu'en 20.5 (tranche 2).
Les scénarios A, B, C de 18.3 (`epic-18.md:233-239` : boucle d'écrasement, flush au démontage, sauvegarde depuis un
formulaire périmé) restent réels dès qu'un champ in-situ écrit pendant que `NodeEditorPanel` est monté. Même
question pour `UnityDialogueEditor` (onglet Éditer), autre écrivain du même document, retiré seulement en 20.15.

**Correctif.** Ajouter à la **première** story qui met un champ in-situ en service (18.5b selon B1, sinon 18.5)
l'AC : « **Given** `NodeEditorPanel` monté (drapeau `legacyInspector` ou état actuel), **Then** ses champs `line`,
`speaker`, `title` et `choices[].text` sont en lecture seule et son flush n'écrit aucun de ces champs ; test de
régression des scénarios A, B, C de 18.3 ». Ajouter la même phrase à A14 et à 20.5. Préciser dans 20.5 le sort de
l'onglet Éditer pendant la tranche 2 (lecture seule ou redirection vers la scène).

### B3 — La chaîne de création de story nourrit la session avec l'ancienne cible

**Preuve.**
- `bmad-create-story` sans argument prend « la PREMIÈRE story `backlog` de haut en bas »
  (`.claude/skills/bmad-create-story/SKILL.md:140-143`). Dans `sprint-status.yaml`, c'est `10-1-restaurer-session…`
  (l. 196), pas une story de l'epic 20 ; dans le bloc Epic 18, ce serait `18-1-…` (l. 241), **remplacée** mais encore
  `backlog`, comme 18-2, 18-3 (l. 242-243) et 18-10 (l. 250, intégrée à 20.18).
- Le même skill charge `{planning_artifacts}/*ux*/*.md` et `*architecture*/*.md` (`SKILL.md:86-87`), donc
  `ux-design-specification/` (antérieure, contredit la refonte, voir § 4) et `planning-artifacts/architecture/`
  (v10), mais **pas** `docs/design/refonte-scene/README.md` ni `docs/architecture/refonte-scene-architecture.md`.
- `_bmad-output/project-context.md:35`, chargé en `persistent_facts` par ce skill comme par celui-ci, envoie « avant
  tout écran » vers `ux-design-specification/design-system-foundation.md`, `ui_redesign_2026.md` et les maquettes
  `docs/design/refonte-ui-2026/` ; il ne nomme pas la refonte Scène.

**Risque.** Réel : une session `create the next story` crée la mauvaise story ; une session `create story 20-5`
reçoit trois colonnes, panneau droit permanent, `AIGenerationPanel` en modale et `Ctrl+S` comme contexte UX.

**Correctif.**
1. `sprint-status.yaml` : passer 18-1, 18-2, 18-3 et 18-10 hors `backlog` (le fichier n'a pas de statut
   « remplacée » : les mettre en `done` avec le commentaire `# remplacée par 20-x, non implémentée`, ou les retirer) ;
   déplacer le bloc epic 20 (avec 18-4…18-11 dans l'ordre de B1) **en tête** de `development_status`, puisque l'epic
   est prioritaire.
2. `_bmad-output/project-context.md:35` : ajouter « Pour tout écran de l'epic 20 : `docs/design/refonte-scene/README.md`
   (fait foi), `docs/architecture/refonte-scene-architecture.md`, règle `ui_refonte_scene.md` ; la spec
   `ux-design-specification/` est remplacée pour ces écrans. »
3. Créer `_bmad/custom/bmad-create-story.toml` avec `persistent_facts = ["file:{project-root}/docs/design/refonte-scene/README.md", "file:{project-root}/docs/architecture/refonte-scene-architecture.md"]`
   (surcharge durable, `_bmad/` reste intouché).
4. Bandeau de neutralisation de la spec UX (§ 4, texte proposé).

---

## Constats à corriger avant la story concernée

| # | Story | Constat et preuve | Correctif |
|---|---|---|---|
| **C1** | 20.1 | La conversion existe déjà en partie et **diverge** : `splitDialogueLine` (`frontend/src/utils/dialogueLineSegments.ts:6-8`) laisse « la suite en narration » après un `*` non fermé, alors que 20.1 exige que « le `*` non fermé reste du texte » (`epic-20.md:97-98`) ; elle `trim()` chaque segment (`:19-20`), donc n'est pas réversible. Ses blocs n'ont pas d'offsets source, dont dépendent le clic → curseur (18.5, D4), le diff de 20.13 et la provenance par plage d'A12 (`{start, end}`). | AC 20.1 : « `parse` remplace `splitDialogueLine` (ou la fonde) ; `DialogueLineText` et l'estimation de hauteur de dagre (`dagreLayout.ts`) passent sur `parse` ; chaque bloc porte `start`/`end` dans la chaîne source ; comportement du `*` non fermé changé et testé dans les trois consommateurs ». Dire aussi que la story se fait **sur le poste de l'auteur** (fixtures copiées de `Assets/Dialogue/`, non versionné). |
| **C2** | 20.2 | Paliers non contigus : A10 « écrire ≥ 100 %, lire 40–75 %, situer < 40 % » (`refonte-scene-architecture.md:146`), repris en 20.7 (`epic-20.md:202`) ; **75–100 % n'a pas de palier**. « On l'ouvre dans le prototype » (`:108`) ne dit pas quel prototype. « Aucune image ne dépasse 16 ms » (`:110`) est un absolu qu'aucune trace ne tiendra de façon reproductible. | Fixer les bornes (ex. écrire ≥ 75 %, lire 40–75 %, situer < 40 %) dans A10, README § 15.3 et 20.7. Définir le prototype (route ou drapeau dans l'app React Flow réelle). Remplacer l'absolu par un seuil mesurable : p95 des frames ≤ 16 ms et aucune tâche longue > 50 ms pendant le zoom, navigateur et machine nommés ; dire si la redisposition LR compte dans la seconde de NFR-P1. |
| **C3** | 18.5 (ou 18.5a/b) | Les AC d'origine ignorent la décision D4 de la refonte : rien sur « toute la réplique passe en texte brut avec ses `*…*` à l'entrée, mise en forme à la sortie » (README § 7 l. 126, § 8 l. 141, A3). D1 d'origine impose deux clics sur un nœud non sélectionné (`epic-18.md:44`, `:335-338`) ; le board `Carte` (zone 3) et README § 8 disent « un clic pose le curseur ». Le passage rendu → brut décale le texte (guillemets « » de `formatNodeLinePreview`, didascalies à la ligne) : la position cliquée ne correspond pas à un offset brut sans les offsets de C1. | Ajouter l'AC D4 ; trancher la règle du clic par surface (carte au palier « écrire » et bloc de script : un clic = curseur à l'offset brut correspondant, via les offsets de 20.1 ; règle des deux clics seulement si B1 option 3 est retenue). |
| **C4** | 18.9, 20.6, 20.9 | Epic 14 est en `backlog` (`sprint-status.yaml:225-229`) : 14.1 (TAB entre nœuds) et 14.2 (tokens de focus) ne sont pas livrées ; aucun traitement de `Tab` entre nœuds dans `frontend/src/components/graph` (grep). Or 18.9 en dépend (`epic-18.md:544`, `:564`), README § 8 et 20.6 écrivent « en Graphe, TAB reste la navigation entre nœuds (Epic 14.1) ». | Intégrer 14.1 et 14.2 à l'epic 20 (avant 18.9), ou écrire dans 18.9 que le comportement natif de React Flow (nœuds focusables) suffit et quels tokens de focus remplacent 14.2. |
| **C5** | 18.11 | Voir B1 : AC fondées sur D3 d'origine. | Récrire : hauteur de layout = hauteur du palier courant (A9/A10) ; export PNG/SVG à un palier nommé ; multi-sélection = aucun champ monté (pas « aucun dépliage »). |
| **C6** | 20.4 | (a) Aucune AC d'interface alors que le board `Fiche` montre fiche dépliée/compacte, mention `@` avec aperçu de fiche, tons, premier emplacement ; README § 13 y renvoie aussi les Flags (« fiche ▾ › Flags »), « Enregistrer comme profil d'auteur », métadonnées, partage, permissions, suppression (l. 216-221). (b) Aucune AC ne vérifie qu'un `PUT /documents/{id}` conserve `scene`. (c) **À vérifier (spéculation annoncée)** : le document est persisté dans `get_unity_dialogues_path()` (`services/unity_persisted_document_io.py:34-57`) ; si ce dossier est celui que charge Unity, `scene` est dans le fichier lu par le jeu, et le retrait « à l'export » d'A1 ne protège que le téléchargement. | (a) Ajouter les AC d'interface de la fiche et du menu « fiche ▾ », ou une story 20.4b. (b) AC d'aller-retour PUT/GET avec `scene`. (c) Avant la story : établir quel fichier Unity charge ; si c'est le fichier persisté, ranger `scene` dans un artefact distinct (comme le layout ou le journal A12) au lieu de la racine du document. |
| **C7** | 20.5 | (a) AC « on clique un élément (… problèmes, contexte, … lot) → son détail s'ouvre » (`epic-20.md:171-172`) : le popover Problèmes est livré par 20.14 et le Lot par 20.12 (tranche 3), le détail Contexte par **aucune** story → dépendance en avant. (b) La barre de vue montre JOUER (`:168`), mais **aucune story ni FR** ne construit la vue Jouer (board `Jouer` : choix verrouillés expliqués, issue forçable, état de la partie, retour d'un choix ; README § 13 l. 229 « Aperçu de scénario (P) → Vue Jouer »). (c) A1 : « ALT+N crée le document avant toute génération » (`refonte-scene-architecture.md:53-55`) n'est pas une AC ; c'est lui qui rattache la première réplique à son appel (prérequis de « Pourquoi ? » sur l'ouverture). (d) Sort des routes actuelles (Générer, Éditer, Graphe) non dit. (e) Éléments de la barre : README § 4 l. 61 a LECTURE et « ? RACCOURCIS », pas « lot » ; 20.5 et FR137 ont « lot », pas les deux autres. | (a) Limiter 20.5 aux détails existants (`SaveStatusIndicator`, santé de `GraphToolbarStatusRow`, `EstimationBadge`, modèle) et déclarer les autres livrés par 20.12, 20.14 et la story Contexte. (b) Créer une FR (FR146 « vue Jouer ») et une story 20.24 « Vue Jouer » (board `Jouer`), à placer en tranche 2. (c) AC ALT+N. (d) AC sur les anciennes routes (redirection vers la scène). (e) Aligner la liste dans README § 4, FR137 et 20.5. |
| **C8** | 20.6 | « mots (`\w+`) … égaux à un calcul de référence » (`epic-20.md:186-187`, README § 6 l. 111). En JavaScript, `\w` est ASCII : « Uresaïr » compte deux mots, « élan » devient « lan ». Le 3 887 du README vient probablement d'un calcul Unicode (spéculation, le fichier du forgeron n'est pas versionné). | Écrire la règle en Unicode (`/[\p{L}\p{N}_]+/gu`) dans README § 6 et 20.6, et fixer la valeur de référence sur la fixture du forgeron de 20.1. |
| **C9** | 20.7 | Le board `Carte` dessine deux fonctions sans story : le pied « à valider » (Garder, Régénérer, Rejeter, zone 8 ; README § 13 l. 226) et l'insertion par « / » en début de ligne (réplique, didascalie, réponse, test, couper la carte, générer la suite). Le port d'entrée marqué « ? » quand une condition existe (zone 2) n'a pas d'AC non plus. Le « / » dans un `<textarea>` (D4) est un menu à part entière. | Ajouter à 20.7 l'AC du pied « à valider » (cartes `pending`) et du port « ? ». Pour « / » : story dédiée (tranche 4) ou retrait du board, à trancher avant 20.7. |
| **C10** | 20.11 | (a) « la page Générer [est retirée] (lignes README § 13 cochées) » (`epic-20.md:270-271`), mais ses destinations n'ont pas de story : tiroir Contexte (board `Contexte` : tokens par section, budget AUTO, modèle, « voir le prompt »), écran Fiches du GDD (board `Fiches`), Réglages › Notion et GDD, palette (board `Palette`). (b) La première réplique d'une scène vide n'a pas de chemin : A5 ne liste que `generate-node`, `regenerate` et `rewrite-span` (`refonte-scene-architecture.md:105-110`), et `generate-node` exige `parent_node_id` (`api/schemas/graph.py:125`) ; la page Générer passe par `POST /api/v1/dialogues/generate/unity-dialogue`. Le board `Fiche` montre pourtant ce « premier emplacement ». (c) `GenerationProgressModal` n'existe plus : remplacée par `GenerationStreamingInline` (`frontend/src/components/generation/GenerationStreamingInline.tsx:4`). (d) La ligne « TRACE ▸ » de l'emplacement (README § 7 l. 127, § 13 l. 219) n'a pas d'AC. | (a) Créer une story « Tiroir Contexte, Fiches du GDD, palette » (boards `Contexte`, `Fiches`, `Palette`) placée avant 20.11, ou répartir ces lignes dans 20.4/20.5 ; ajouter une colonne « story » à README § 13. (b) Ajouter à A5 et 20.11 l'entrée « réplique d'ouverture » (endpoint existant, fiche de scène, provenance rattachée). (c) Corriger le nom dans 20.11 et README § 7. (d) AC « TRACE ▸ ». |
| **C11** | 20.13 | Le diff « dans le texte » (board `Reecrire` : passage rendu, TAB / CTRL+→ / ÉCHAP) est incompatible avec une sélection faite dans le `<textarea>` brut (D4) : un `<textarea>` n'affiche pas de diff stylé. `ctrl+k` est dans `allowedInInputs` (`useKeyboardShortcuts.ts:109`) et ouvre la palette depuis un champ. TAB a déjà deux sens (chaîne D5, suite vide en Script). | AC : CTRL+K sur une sélection quitte le champ, projette la plage brute sur le rendu (offsets de C1), affiche le diff dans le bloc rendu ; pendant le diff, TAB et CTRL+→ appartiennent au diff ; la palette s'ouvre seulement sans sélection. |
| **C12** | 20.21 | (a) Dépendance en avant vers 20.17 (tranche 4) : « le tiroir Versions les liste » (`epic-20.md:331-332`) et la sortie d'origine « en diff » qui reprend le composant de Versions (A15, `refonte-scene-architecture.md:207-208`). (b) Comment le front sait d'avance qu'une réplique a un appel rattaché (« Pourquoi ? » grisé) n'est pas dit. (c) Le plafond de 40 messages répond 409 `conversation_full` (`api/routers/ai_conversations.py:126-131`), une trace introuvable 404 `generation_trace_not_found` (`:110-115`) ; seuls 429 et 502 sont cités. (d) `conversations-ia.md:141` annonce encore un « panneau “Discuter avec l'IA” sur le nœud ». Board Discussion : en cours (autre agent). | (a) Faire construire le composant de diff par 20.21 (réutilisé par 20.17) et déplacer la liste dans Versions vers 20.17. (b) Nommer la source (coûts par nœud `GET /api/v1/llm-usage/dialogue/{id}/costs`, ou 404 à la création). (c) Citer 409 et 404 dans les états. (d) Renvoyer `conversations-ia.md:141` vers A15 et le tiroir Discussion. |
| **C13** | 20.15 et garde-fou 1 | « chaque ligne est cochée avec le test e2e qui la couvre » (`epic-20.md:352`, `:454`) : la table README § 13 (l. 212-232) n'a que deux colonnes, rien à cocher. | Ajouter les colonnes « story » et « test e2e / ✓ ». |
| **C14** | 20.20 | Dépendances absentes du tableau (« 20.20 après 20.4 », `epic-20.md:444`) : portraits dans la marge des répliques (20.6), cartes de l'accueil (20.5), AC Papier (20.16), variables CSS (20.3), copie d'images à la synchro Notion (back-end, règle `gdd_notion_sync_builder.md`). Board en cours de rapatriement (autre agent). | Compléter : après 20.4, 20.5, 20.6 et 20.16 (ou AC Papier conditionnelle). |
| **C15** | 20.23 | « 20.17 et 20.23 après 20.11 » (`epic-20.md:444`), mais l'intention est « rangée dans le journal d'édition (A12) » (`:431`), livré par 20.17. | 20.23 après 20.17. |
| **C16** | 18.5 à 18.9 | `requirements-inventory.md` garde des FR d'Epic 18 contraires à la refonte : FR122 « a first click on an unselected node selects and expands it » (l. 127), FR123 « maximum (440px) … summary density » (l. 128), FR127 couverte par 18.3 retirée (l. 132) ; le routage dit encore « FR122-128 → Epic 18 » (l. 306). | Récrire FR122/FR123 sur les paliers et la carte, rattacher FR123/FR124 (lecture) à 20.7, FR127 à l'AC de B2, FR128 tactile à 20.18 ; mettre à jour l. 306. |
| **C17** | 20.19 | FR142 exige « renommage partout » ; 20.19 n'a qu'une AC (autocomplétion, refus) (`epic-20.md:398-399`). | AC de renommage (portée, document courant ou tous, aperçu des occurrences). |
| **C18** | 20.14 | 1,5 session pour diagnostics continus, une **nouvelle** relecture « langue » par LLM (seuls `GraphQualityLlmPanel` et `GraphAiSlopPanel` existent), l'aide « ? » générée et la vérification de chaque raccourci dans 3 navigateurs plus la PWA (`epic-20.md:297-310`). Aucun coût estimé avant la relecture, contre le principe 4 du README. | Porter à 2,5–3 sessions ou sortir la relecture « langue » ; AC de coût estimé avant la relecture. |

---

## Constats mineurs

| # | Constat et preuve | Correctif |
|---|---|---|
| M1 | Le PRD s'arrête à FR117 (`prd/functional-requirements.md`) ; FR118–FR145 n'existent que dans `requirements-inventory.md`. Pratique antérieure (FR118–130 dans le même cas), pas propre à l'epic 20. | Reporter FR131–145 dans le PRD, ou écrire dans `prd/index.md` que l'inventaire fait foi au-delà de FR117. |
| M2 | `epic-list.md` n'a pas l'Epic 20, décrit Epic 18 avec le seuil de zoom supprimé (l. 79) et ne marque pas Epic 19 remplacée (l. 83). | Mettre à jour comme `epic-index.md`. |
| M3 | Libellés : bandeau invité « lecture seule — se connecter pour écrire » (20.10, `epic-20.md:239-240`) contre « LECTURE SEULE · MODE INVITÉ — Se connecter pour écrire » (board `Etats`) ; « Bibliothèque » (20.5) contre « Accueil » (README § 5 l. 86, 20.20) ; « fiche ▾ » (README § 13) contre « fiche de scène ▾ » (boards). | Le board fait foi : aligner 20.10 ; choisir un nom pour l'écran d'accueil et l'utiliser partout. |
| M4 | `epic-20.md:128-130` : « deux points tranchés » (360 px, D3) ; README § 14 et `ui_refonte_scene.md` en comptent trois (pas de hauteur maximale, réplique bornée à 12 lignes). | « trois points », avec l'écart 3. |
| M5 | README § 15 garde « Décisions à prendre » alors que l'epic est validée ; la décision 5 (monnaie) est adoptée de fait par 20.11. | Marquer chaque décision prise ou ouverte. |
| M6 | Mode Focus : didascalies atténuées à 2,6:1 (README § 10 l. 189-191), sous NFR-A2 (4,5:1). Choix assumé mais non consigné dans les NFR. | Exception écrite dans NFR-A2 ou dans 20.16. |
| M7 | NFR-A1 cite encore `Ctrl+S (save)` et `Ctrl+G` (`prd/non-functional-requirements.md`, § NFR-A1), contraire à la préférence « jamais de Ctrl+S ». Antérieur. | Retirer à l'occasion. |
| M8 | `ui_redesign_2026.md` (`paths: frontend/src/**`) se dit « source de vérité » sans renvoyer à la refonte Scène ; `ui_refonte_scene.md` ne se charge pas sur `frontend/src/theme/**` (20.3), `utils/**` (20.1), `components/generation/**` (20.11), `store/**`. | Bandeau de renvoi dans `ui_redesign_2026.md` ; élargir les `paths:` de `ui_refonte_scene.md`. |
| M9 | 20.18 « suit les critères de 18.10 » (`epic-20.md:389`), dont l'arithmétique repose sur 440 × 280 px (`epic-18.md:618`). | Refaire le calcul sur la carte de la refonte. |
| M10 | 18.7 édite le locuteur en texte libre ; la fiche de scène (20.4) porte la distribution et rapproche les graphies. | Autocompléter le locuteur depuis la fiche une fois 20.4 livrée. |
| M11 | 20.12 calcule les exclusions (réponses vides, jamais atteintes) côté serveur (`epic-20.md:280-281`) ; A6 les calcule dans le front. | Une seule définition, ou test miroir comme `dialogue_path_context.py` / `dialoguePathContext.ts`. |
| M12 | 20.4 n'a aucune dépendance sur la tranche 1 bis ; elle corrige un bug vécu (2026-11-19). | La rendre démarrable dès la tranche 1 (gain sur le chemin critique). |

---

## 1. Document Discovery

| Type | Format | Emplacement retenu |
|---|---|---|
| PRD | shardé | `prd/` (19 fichiers) ; FR au-delà de FR117 dans `epics/requirements-inventory.md` (M1) |
| Architecture | fichier unique hors `planning-artifacts` | `docs/architecture/refonte-scene-architecture.md` (A1–A16) + `docs/architecture/conversations-ia.md` |
| Epics | shardé | `epics/epic-20.md`, `epic-18.md`, `epic-19.md`, `epic-index.md`, `requirements-inventory.md` |
| UX | handoff de design | `docs/design/refonte-scene/README.md` + 23 boards `*.dc.html` (fait foi) |
| UX legacy | shardé | `ux-design-specification/` (13 fichiers) — antérieure, évaluée en § 4 |

Aucun doublon entier/shardé. `quickdev-plan-architecture-v10.md` et `planning-artifacts/architecture/` (v10) écartés :
ils ne portent aucune décision de la refonte. Boards présents : Avant, Bibliotheque, Carte, Contexte, Etats, Fiche,
Fiches, Focus, Generer, Gestes, Graphe, Jouer, Lot, Main, Mobile, Palette, Paliers, Papier, Problemes, Reecrire,
Reglages, Technique, Versions. Absents (en cours, autre agent) : Discussion, Ambiance.

## 2. Exigences

- **FR131–FR145** (`requirements-inventory.md:136-150`, énoncés identiques à `epic-20.md:41-55`).
- **FR122–FR128** (Epic 18) : toujours dans l'inventaire, en partie contraires à la refonte (C16).
- **FR129–FR130** (Epic 19) : déclarées couvertes par FR133, FR137 et 20.15 (`requirements-inventory.md:309`).
- **NFR touchées** : P1, P4, R3, I1, A1, A2, A3 (`epic-20.md:59-69`) ; définitions vérifiées dans
  `prd/non-functional-requirements.md` (P1 « 500+ nodes < 1 s », P4 « < 100 ms », A2 « 4,5:1 »).

## 3. Couverture

| FR | Story | État |
|---|---|---|
| FR131 fiche de scène | 20.4 | Partiel : données oui, interface et menu « fiche ▾ » non (C6) |
| FR132 vue Script | 20.6 | Couvert (C8 sur le comptage) |
| FR133 emplacement à écrire | 20.11 | Partiel : pas de réplique d'ouverture (C10 b) |
| FR134 options sur place | 20.11, 20.17 | Couvert |
| FR135 réécrire une sélection | 20.13 | Couvert, conflit D4 à trancher (C11) |
| FR136 graphe à cartes de texte | 20.7, 20.8, 20.9 | Couvert (C2 sur les paliers, C9) |
| FR137 barre d'état | 20.5 | Partiel : détails livrés plus tard ou nulle part (C7 a) |
| FR138 diagnostics, relecture | 20.14 | Couvert (C18) |
| FR139 Papier, taille, mesure, Focus | 20.16 | Couvert |
| FR140 versions | 20.17 | Couvert |
| FR141 lot | 20.12 | Couvert |
| FR142 catalogues | 20.19 | Partiel : renommage absent (C17) |
| FR143 ambiance | 20.20 | Couvert, board en cours |
| FR144 discussion | 20.21, 20.23 | Couvert, board en cours (C12) |
| FR145 demander depuis la palette | 20.22 | Couvert, board en cours |

**15/15 FR rattachées à une story ; 11 couvertes, 4 partielles.** Hors FR : la **vue Jouer** (un tiers de « une
scène, trois vues ») n'a ni FR ni story (C7 b).

**Stories UI → boards** : toutes les références de board existent (`Main`, `Bibliotheque`, `Fiche`, `Graphe`,
`Carte`, `Paliers`, `Technique`, `Etats`, `Generer`, `Gestes`, `Lot`, `Reecrire`, `Problemes`, `Papier`, `Focus`,
`Reglages`, `Versions`, `Mobile`). Boards **orphelins** : `Jouer`, `Palette`, `Contexte`, `Fiches` (C7, C10).
Stories sans board : 20.20 (canvas privé), 20.21, 20.22 — en cours ailleurs.

## 4. Alignement UX

### La spec `ux-design-specification/` contredit la refonte

| Fichier | Lignes | Ancienne cible |
|---|---|---|
| `design-direction-decision.md` | 7, 16, 45 · 58 · 89 · 93, 139, 221 · 181, 188, 228 | Trois colonnes « conservé » · `NodeEditorPanel` en panneau droit · choix TB/LR/BT/RL · « Sauvegarder » et `Ctrl+S` · double-clic → `AIGenerationPanel` |
| `ux-consistency-patterns.md` | 66, 105, 106, 115, 120, 145 | `AIGenerationPanel` modal · double-clic · `Ctrl+S` · orientation libre |
| `user-journey-flows.md` | 20, 24, 60, 140, 156 | Double-clic → modale de génération |
| `core-user-experience.md` | 12 · 31 · 37 | Auto-save toutes les 2 min · « pas de tactile » · « pas de refonte majeure » |
| `executive-summary.md` | 38 · 48 · 53 | Panneau droit visible en permanence · `⌘+K` · édition par le seul panneau droit |
| `component-strategy.md` | 8, 9, 18 | Panneaux redimensionnables 3 colonnes, onglets, `AIGenerationPanel` |
| `responsive-design-accessibility.md` | 7, 24, 26 · 49 | Trois colonnes · `Ctrl+S` |
| `ux-pattern-analysis-inspiration.md` | 32, 59 | Trois colonnes, panneau droit pour l'édition |

Seules des notes partielles existent (`ux-pattern-analysis-inspiration.md:61-76` pour Epic 18 ;
`visual-design-foundation.md:3-4` « obsolète » pour couleurs et typographie). Le risque de suivre l'ancienne cible est
**réel** et passe par l'outillage, pas par la lecture humaine (B3).

### Neutralisation proposée (sans suppression)

En tête de `ux-design-specification/index.md` **et** de chacun des 12 shards :

> ⚠️ **Remplacée le 2026-11-20 pour tout écran repris par l'epic 20 (refonte « Scène »).** Font foi :
> [`docs/design/refonte-scene/README.md`](../../../docs/design/refonte-scene/README.md) (écrans, composants,
> raccourcis, table « où va chaque fonction »), les boards `docs/design/refonte-scene/*.dc.html`,
> [`docs/architecture/refonte-scene-architecture.md`](../../../docs/architecture/refonte-scene-architecture.md)
> (A1–A16) et [`epic-20.md`](../epics/epic-20.md). En cas de contradiction, la refonte l'emporte. Restent valables :
> la charte de `design-system-foundation.md` (couleurs, polices, filets, un seul bouton bleu) et les exigences
> d'accessibilité générales. Ce document est conservé pour l'historique ; ne pas en tirer de critère d'acceptation.

Plus, sur les lignes du tableau ci-dessus, un renvoi court en ligne (« → refonte Scène README § n ») pour qu'une
lecture partielle tombe aussi sur le bandeau. Compléter par B3 (2) et (3), sans quoi le bandeau ne suffit pas :
c'est le skill qui charge la spec, pas l'humain.

### Handoff ↔ architecture ↔ stories

- **D4** est cohérente dans README § 7, § 8, § 14, A2, A3, `ui_refonte_scene.md`, board `Carte` et 20.6. Elle ne l'est
  pas dans 18.5 (C3) ni dans 20.13 (C11).
- **Noms de composants** : alignés entre README § 7 et le code (vérifié : `GraphInspector`, `NodeEditorPanel`,
  `UnityDialogueEditor`, `ChoiceEditor`, `AttributeSkillTestEditor`, `ConditionEditor`, `EffectEditor`,
  `CommandPalette`, `SaveStatusIndicator`, `EstimationBadge`, `ContextDetail`, `BatchGenerateFromNodesModal`,
  `GraphQualityLlmPanel`, `GraphAiSlopPanel` existent ; `GraphHealthBadge` est une fonction interne de
  `GraphToolbarStatusRow.tsx`). Exception : `GenerationProgressModal` n'existe plus (C10 c).
- **Raccourcis** : tous en CTRL ou ALT, aucun ⌘ dans le README ni les boards (le seul « Cmd » de `Palette.dc.html`
  est un nom de variable). Ne heurtent pas le navigateur sous Windows d'après README § 8 ; à vérifier en 20.14.
- **Libellés** : `É. CRIT / ÉCHEC / RÉUSSITE / R. CRIT`, `À ÉCRIRE`, `SUITE À ÉCRIRE`, toast 409 « VERSION PLUS
  RÉCENTE ADOPTÉE · SAISIE RÉAPPLIQUÉE », « Garder ce qui est écrit », « LIRE TOUT » : identiques entre stories et
  boards. Écarts en M3.

## 5. Qualité des stories

- **Valeur utilisateur** : chaque story d'interface est formulée du point de vue de l'auteur ; 20.2 (« en tant que
  développeur ») et 20.3 sont des stories techniques assumées, justifiées par le plan B et Papier.
- **Critères testables** : globalement oui (seuils chiffrés, endpoints, fixtures, harnais nommés). Non mesurables
  en l'état : « aucune image > 16 ms » (C2), « un mois d'usage » de 20.15 (mesurable, mais par un compteur local d'un
  seul poste, acceptable pour un auteur unique).
- **Dépendances en avant** : B1 (18.5–18.7, 18.9, 18.11 → 18.1/18.2 retirées et 20.7), C7 a (20.5 → 20.12, 20.14),
  C12 a (20.21 → 20.17), C15 (20.23 → 20.17), C14 (20.20 → 20.6, 20.16).
- **Tailles** : sommes cohérentes avec les totaux annoncés (tranche 1 = 5, 1 bis = 11,5, 2 = 15, 3 = 15, 4 = 14 ;
  ≈ 57 sur le chemin critique). Sous-estimée : 20.14 (C18). B1 déplace ≈ 7 sessions de la tranche 1 bis vers la
  tranche 2 sans allonger le chemin critique (elles y étaient déjà en série).
- **Définition de fini** commune (`epic-20.md:71-77`) : bonne, en particulier « états du board `Etats` traités » et
  « fixtures d'export identiques » ; la ligne « § 13 cochée » dépend de C13.

## 6. Arbitrages pris en mode non interactif

1. **Source des FR** : `requirements-inventory.md` (le PRD s'arrête à FR117) ; écart consigné en M1, non bloquant.
2. **Architecture retenue** : `docs/architecture/refonte-scene-architecture.md` et `conversations-ia.md` ; le
   dossier `planning-artifacts/architecture/` (v10) n'est pas évalué, sauf comme intrant parasite de B3.
3. **Évaluation delta** sur l'epic 20 et la tranche 1 bis ; les stories 18.1, 18.2, 18.3, 18.10 ne sont évaluées
   que pour ce que leur retrait laisse orphelin.
4. **Boards Discussion et Ambiance** : signalés « en cours », non comptés.
5. **B1** : option recommandée = 18.5a maintenant, montage et stories suivantes après 20.6/20.7 ; l'alternative
   (réintégrer 18.1/18.2 minimales) est laissée au choix.
6. **Gravité de B3** : classé bloquant parce que le tout premier appel « create the next story » prendrait 10-1, et
   que le contexte injecté est celui de l'ancienne cible ; correctif sans risque.
7. **C6 (c)** : signalé comme à vérifier, pas comme bloquant, faute de pouvoir lire le chargeur C# (hors dépôt).
8. Aucun test ni serveur lancé ; les vérifications de code sont des lectures et des recherches (grep) du 2026-11-20.

## Prochaines étapes recommandées

1. Appliquer B3 (sprint-status, `project-context.md`, `_bmad/custom/bmad-create-story.toml`, bandeau UX) et B2
   (AC de lecture seule du panneau), puis récrire le plan de la tranche 1 bis (B1).
2. Lancer en parallèle 20.2 (avec C2), 20.1 (avec C1) et 18.4 ; puis 18.8, 20.3, 18.5a, et 20.4 dès la tranche 1 (M12).
3. Avant la tranche 2 : créer la story Vue Jouer et la story Contexte / Fiches / palette, ajouter la colonne
   « story » à README § 13 ; corriger C6, C7.
4. Avant la tranche 3 : C10, C11, C12, C18. Avant la tranche 4 : C14, C15, C17.
