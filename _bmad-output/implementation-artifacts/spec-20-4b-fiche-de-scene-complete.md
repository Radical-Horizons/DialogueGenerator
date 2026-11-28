---
title: 'Story 20.4, lot B — La fiche de scène complète'
type: 'feature'
created: '2026-11-28'
status: 'done'
route: 'dispatch'
review_loop_iteration: 0
baseline_commit: '9b13bf14a0f830d8cf77aa66357b006d379fc80e'
context:
  - '{project-root}/docs/design/refonte-scene/Fiche.dc.html'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** La fiche de scène (lot A) n'a ni tons, ni profil d'auteur, ni fiches du GDD citables et consultables depuis le brief ; une scène sans réplique ne montre qu'un canvas vide.

**Approach:** Compléter la fiche selon le board `Fiche` : tons et profil d'auteur envoyés à toute génération du dialogue ouvert, mention `@` dans le brief avec aperçu de la fiche du GDD, premier emplacement à écrire sous la fiche d'une scène neuve.

## Boundaries & Constraints

**Always:**
- Tons : puces `tension`, `intime`, `humour`, `révélation`, `menace`, `solennel`, `dramatique`, plus « + » (ton libre) ; rangés dans `scene.tones`. Les puces de ton du panneau de génération IA du graphe deviennent celles de la fiche (les cocher y écrit la fiche) : une seule source.
- Profil d'auteur (décidé) : les voix d'écriture, profils de l'équipe et voix fournies, pas les templates. Un choix ou aucun, `scene.authorProfileId`, description affichée à côté. Texte introuvable (supprimé, privé d'un autre) : la fiche le dit et la génération part sans profil.
- Tons et profil partent avec suite, test, lot et job, régénération et estimations, par les champs `narrative_tags` / `author_profile` du prompt existant (même construction que « Générer »).
- Mention : `@` + saisie propose les fiches (personnages, lieux, objets, espèces, communautés) ; choisir écrit `@Nom` et ajoute la fiche à `linkedEntries` (mode complet), sauf PNJ, PJ, lieu et doublon. Effacer la mention ne retire pas la fiche (liste visible, retirable). Le modèle reçoit le nom sans `@`.
- Brief : lu avec les mentions cliquables ; un clic dans le texte le passe en texte brut, ÉCHAP ou sortie le remet en forme ; sauvegarde au fil de la frappe.
- Aperçu (mention ou puce de fiche liée) : nom, épithète, catégorie, métier, résumé, « Ouvrir la fiche » (détail complet existant, en fenêtre) ; ÉCHAP ferme et rend le focus.
- Ligne « Ce que le modèle saura » : fiches envoyées, brief, ton, profil ; ni tokens ni « voir le prompt » (20.25).
- Scène neuve (aucune réplique) : fiche dépliée, premier emplacement à écrire dessous. Son geste (décidé) : « Écrire la première réplique » crée la réplique d'ouverture vide (`START`, locuteur = premier PNJ de la fiche) et la sélectionne dans l'éditeur existant ; pas de saisie dans l'emplacement.
- Invité ou sans droit d'écriture : tout se lit, rien ne s'édite, pas d'emplacement actif.

**Never:**
- Menu « fiche de scène ▾ » (lot C), titre éditable, enveloppe (20.5), tiroir Contexte (20.25), « Générer » la réplique d'ouverture (20.11).
- « Utilisée dans N scènes » (20.25 : la plupart des fiches sont encore déduites, le nombre serait faux).
- Modifier la page Générer, le format des nœuds, l'export ou le golden ; perdre les réponses à test à la sauvegarde (connu, hors mission) ; appel LLM facturé.

## I/O & Edge-Case Matrix

| Scénario | État | Attendu |
|---|---|---|
| Tons et profil | `tones`, `authorProfileId` remplis | requêtes des cinq voies : `narrative_tags` et `author_profile` ; le prompt contient `narrative_tone` et `author_directives` |
| Fiche sans l'un ni l'autre | `tones` vide, pas de profil | champs absents, prompt inchangé |
| Profil pas encore chargé | génération juste après l'ouverture | le texte est attendu avant l'envoi |
| Profil introuvable | identifiant inconnu | avertissement, envoi sans `author_profile` |
| Mention répétée ou du PNJ | `@Nom` déjà lié | aucun doublon |
| Mention sans fiche | `@xyz` | reste du texte |
| Scène neuve | dialogue à zéro réplique | emplacement affiché ; il disparaît dès qu'une réplique existe |

</frozen-after-approval>

## Code Map

- `frontend/src/components/scene/SceneSheetBar.tsx` -- fiche du lot A (613 l.) : extraire brief, tons, profil et aperçu en composants voisins.
- `frontend/src/utils/sceneSheet.ts` -- `SceneSheet` (champs libres `tones`, `authorProfileId` déjà conservés), `buildSceneGeneration`, `composeSceneInstructions`, `sceneRefFor`. Fonctions pures.
- `store/slices/sceneSlice.ts` (`updateScene`), `store/sceneCatalogStore.ts` (personnages et lieux seuls), `api/context.ts`, `api/authorProfiles.ts` (`listAuthorProfilesApi`, `listPrebuiltAuthorProfilesApi`).
- Voies de génération : `generationSlice.ts` (l. 205-290, 765-800), `useBatchGenerateFromNodes.ts` (`buildParentSpec`), `AIGenerationPanel.tsx` (puces l. 56 et 650, estimation l. 217), `NodeEditorPanel.tsx` (estimation l. 650).
- Serveur : `api/schemas/graph.py` (estimate, generate, regenerate), `api/schemas/batch_node_generation.py`, `api/routers/graph_cost.py`, `graph_generation.py` (l. 269, 395), `graph_node_history.py` (l. 306, sans tons aujourd'hui), `services/graph_node_orchestrator.py`, `batch_node_generation_service.py` (l. 245), `graph_prompt_context.py` (`build`, `render`). `PromptInput.author_profile` existe : le graphe ne le passe pas.
- `components/context/ContextDetail.tsx` -- détail à réutiliser ; `utils/gddSummary.ts` -- résumé.
- `components/graph/GraphEditor.tsx` (l. 484, 600) ; `nodeSlice.ts` (`addNode`).
- Valeurs de style : `Fiche.dc.html`, via `theme/redesignTokens`.

## Tasks & Acceptance

**Execution:**
- [x] Serveur ci-dessus + `tests/` -- `author_profile` et `narrative_tags` jusqu'au prompt sur les cinq voies.
- [x] `utils/sceneSheet.ts` -- tons, profil, mentions (découpage, ajout de fiche, retrait du `@`) ; tests.
- [x] Voies de génération du front + `types/graph.ts` -- envoi depuis la fiche ; tests.
- [x] `components/scene/` -- tons, profil, brief à mentions, aperçu, ligne de contexte ; tests.
- [x] `components/scene/` + `GraphEditor.tsx` -- premier emplacement ; tests.
- [x] `CLAUDE.md` -- fait « PJ/PNJ d'une génération du graphe » : `buildSceneGeneration` / `useSceneGeneration`.
- [x] `deferred-work.md` -- retirer le lot B, marquer faite l'entrée `CLAUDE.md`, garder le lot C ; `sprint-status.yaml` : story `in-progress`.

**Acceptance Criteria:**
- Given une fiche avec tons et profil, when on rouvre le dialogue, then ils sont relus et `Assets/Dialogue/{id}.json` n'a pas de `scene`.
- Given un lecteur au clavier, when il atteint tons, profil, mentions et aperçu, then chacun a un nom accessible et s'actionne.

## Implementation Notes

- Point d'envoi unique : `openSceneGeneration` (`sceneSlice.ts`) ; `useSceneGeneration` pour les estimations.
- `scene.authorProfileId` seul est enregistré ; le texte est relu avant chaque génération (`store/sceneProfileStore.ts`), sans attente quand la fiche n'a pas de profil.
- Lot en job : tons et profil au niveau du job (`BatchGenerateFromNodesJobRequest`), pas par parent.
- Le `@` n'est retiré que devant un nom connu (fiche de scène ou catalogue GDD).
- Aperçu : résumé coupé à 420 caractères ; « Ouvrir la fiche » montre `ContextDetail` sans l'historique local.

- Revue : une passe, 17 correctifs par le sous-agent, plus Tab depuis l'aperçu (il le laissait ouvert).
- Vérification finale (Python 3.11.0, version de la CI) : 2864 pytest, 2270 Vitest, lint et typecheck à zéro, deux specs e2e du graphe (5 passés), preuve UI sur une scène jetable.
- La story reste `in-progress` : lot C à faire.

## Spec Change Log

## Review Triage Log

Passe 1 — B : relecteur sans contexte, E : cas limites, V : trous de vérification, T : tri.

- B1 · low · patch — `sceneProfileStore` : sur lecture incomplète, les voix de la liste réussie sont aussi reprises (un profil supprimé revient).
- B2 · medium · patch — « introuvable » est aussi dit d'un profil sans texte ou de listes illisibles ; la ligne de contexte se tait quand les listes sont en erreur.
- B3 (attente sans fin) · false · rejeté — `apiClient` a un délai par défaut de 30 s (`api/client.ts:20`) et `load` n'échoue jamais.
- B3 (changement de dialogue pendant l'attente) · false · rejeté — la requête part de l'état lu avant l'attente, pour le dialogue où l'auteur a cliqué ; la même fenêtre existe pendant tout l'appel LLM.
- B3 (régénération sans garde de séquence) · medium · defer — antérieur : `regenerateNode` applique la réponse par `nodeId` sans vérifier le dialogue ouvert.
- B3 (avertissement répété en lot séquentiel) · low · rejeté — il faut un profil supprimé ; dédoublonner ajoute un état.
- B4 · low · patch — la ligne « fiches envoyées » compte des noms sans fiche GDD. Le lieu libre n'est pas une fiche : son omission est juste.
- B5 (ÉCHAP et piège à focus après un clic) · medium · patch — les deux fenêtres n'ont pas de `tabIndex`.
- B5 (Tab hors de l'aperçu) · low · patch — l'aperçu reste ouvert et ÉCHAP ne le ferme plus.
- B5 (position au défilement) · low · rejeté — un clic ailleurs ferme l'aperçu ; suivre le défilement ajoute des écouteurs.
- B6 · medium · patch — après un choix, effacer le nom ne repropose rien.
- B7 · low · rejeté — décocher un ton libre le retire : le garder demande une liste enregistrée de plus.
- B8 · false · rejeté — la fiche n'est dépliée que pour une scène neuve ; une première réplique n'apparaît que par un geste de l'auteur, et le repli lui rend le canvas.
- B9 (catégorie en échec gardant l'ancienne révision) · low · rejeté — garder la dernière liste connue vaut mieux que vider.
- B9 (cinq listes relues tant qu'une échoue) · low · rejeté — cinq lectures locales au changement de dialogue.
- B9 (révision plus ancienne écrasant la récente) · low · rejeté — il faut une re-sync pendant le chargement (même course que le lot A).
- B9 (pas d'état de chargement) · low · rejeté — fenêtre courte ; ajoute une surface.
- B9 (`@` gardé avant l'arrivée du catalogue) · low · rejeté — les noms des fiches liées suffisent à le retirer.
- B10 · low · rejeté — il faut un PNJ rangé sous un alias, ce que `sceneRefFor` évite dès que le catalogue est là.
- B11 · medium · patch — le test du job ne vérifie pas l'état final et boucle sans pause.
- B12 (catalogue partiel, profils illisibles) · low · patch — voir V4 et V5.
- B12 (reprise d'un job) · false · rejeté — toute génération lit la fiche du moment, reprise comprise.
- B12 (régénération serveur sans ton ni profil) · low · patch — cas absent du paramétrage.
- B13 · low · rejeté — mêmes champs sans borne que `author_profile` et `user_instructions` existants.
- B14 · low · rejeté — « de L'Éthérée » est correct pour un nom propre ; aucun jouable ne commence par Œ, Ë ou Ï.
- E1 · medium · patch — curseur dans une mention écrite : la liste rouvre et Entrée double la fin du nom.
- E2 · low · patch — Maj+Entrée et Ctrl+Entrée insèrent une mention.
- E3 · medium · patch — voir B6.
- E4 · medium · patch — la perte de focus de la fenêtre (Alt+Tab) démonte le champ du brief.
- E5 · medium · patch — voir B5 (piège à focus).
- E6 · low · patch — voir B5 (Tab hors de l'aperçu).
- E7 · low · rejeté — voir B5 (position au défilement).
- E8 · low · patch — `ContextDetail` reçoit un `item` neuf à chaque rendu et replie les sections lues.
- E9 · medium · patch — voir B2.
- E10 · medium · patch — voir B2 (ligne de contexte).
- E11 · low · patch — voir B1 ; le cas du changement de compte tombe avec le même filtre.
- E12 · low · rejeté — voir B9 (révision plus ancienne).
- E13 · low · patch — brief en lecture seule : plus de focus clavier, donc plus de défilement.
- V1 · medium · patch — rien ne vérifie que `GraphEditor` monte l'emplacement.
- V2 · medium · patch — estimation de `NodeEditorPanel` sans tons ni profil vérifiés.
- V3 · medium · patch — chargement des objets, espèces et communautés non vérifié.
- V4 · medium · patch — échec partiel du catalogue non vérifié.
- V5 · medium · patch — échec de lecture des profils non vérifié.
- V6 · medium · patch — relecture du profil avant chaque génération non vérifiée.
- V7 · medium · patch — flèches dans la liste des mentions non vérifiées.
- V8 · low · patch — ÉCHAP sur un ton libre non vérifié.
- V autre 1 · medium · patch — voir B2.
- V autre 2 · medium · patch — voir B11.
- T1 · low · patch — un nom connu qui préfixe un plus long (« La Forge » puis « La Forge ambulante ») ferme la liste avant le nom long.

## Verification

**Commands:**
- `npm run test:premerge`, `npm --prefix frontend run typecheck` -- verts

**Manual checks:**
- Navigateur intégré, `dialogue-generator-dev-sans-llm` : fiche complète et scène neuve comparées au board, relues après rechargement ; `npm run dev:stop`.
