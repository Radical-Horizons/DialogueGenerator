---
title: 'Story 20.4, lot B — La fiche de scène complète'
type: 'feature'
created: '2026-11-28'
status: 'draft'
route: 'dispatch'
review_loop_iteration: 0
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
- Profil d'auteur : un choix ou aucun, `scene.authorProfileId`, description affichée à côté. Texte introuvable (supprimé, privé d'un autre) : la fiche le dit et la génération part sans profil.
- Tons et profil partent avec suite, test, lot et job, régénération et estimations, par les champs `narrative_tags` / `author_profile` du prompt existant (même construction que « Générer »).
- Mention : `@` + saisie propose les fiches (personnages, lieux, objets, espèces, communautés) ; choisir écrit `@Nom` et ajoute la fiche à `linkedEntries` (mode complet), sauf PNJ, PJ, lieu et doublon. Effacer la mention ne retire pas la fiche (liste visible, retirable). Le modèle reçoit le nom sans `@`.
- Brief : lu avec les mentions cliquables ; un clic dans le texte le passe en texte brut, ÉCHAP ou sortie le remet en forme ; sauvegarde au fil de la frappe.
- Aperçu (mention ou puce de fiche liée) : nom, épithète, catégorie, métier, résumé, « Ouvrir la fiche » (détail complet existant, en fenêtre) ; ÉCHAP ferme et rend le focus.
- Ligne « Ce que le modèle saura » : fiches envoyées, brief, ton, profil ; ni tokens ni « voir le prompt » (20.25).
- Scène neuve (aucune réplique) : fiche dépliée, premier emplacement à écrire dessous.
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

## Open Questions

1. « Profil d'auteur » désigne quoi ? Le board montre « Salutation / première rencontre », qui dans l'application est un *template* de scène, pas un profil d'auteur.
   - **a (recommandé)** — les voix d'écriture : profils d'auteur de l'équipe et voix fournies (« Neutre », « Littéraire »…). C'est le sens du terme dans le code, envoyé comme directives d'auteur.
   - **b** — les templates (comme l'exemple du board) : choisir en envoie la consigne ; les voix d'écriture ne seraient plus choisissables dans la fiche.
2. Que permet le premier emplacement avant 20.11 ?
   - **a (recommandé)** — un bouton « Écrire la première réplique » crée la réplique d'ouverture vide (`START`, locuteur = premier PNJ) et la sélectionne dans l'éditeur existant.
   - **b** — on tape directement dans l'emplacement : un second champ d'écriture, avant celui que livrent 18.5a et 20.11.
   - **c** — emplacement seulement informatif jusqu'à 20.11.

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
- [ ] Serveur ci-dessus + `tests/` -- `author_profile` et `narrative_tags` jusqu'au prompt sur les cinq voies.
- [ ] `utils/sceneSheet.ts` -- tons, profil, mentions (découpage, ajout de fiche, retrait du `@`) ; tests.
- [ ] Voies de génération du front + `types/graph.ts` -- envoi depuis la fiche ; tests.
- [ ] `components/scene/` -- tons, profil, brief à mentions, aperçu, ligne de contexte ; tests.
- [ ] `components/scene/` + `GraphEditor.tsx` -- premier emplacement ; tests.
- [ ] `CLAUDE.md` -- fait « PJ/PNJ d'une génération du graphe » : `buildSceneGeneration` / `useSceneGeneration`.
- [ ] `deferred-work.md` -- retirer le lot B, marquer faite l'entrée `CLAUDE.md`, garder le lot C ; `sprint-status.yaml` : story `in-progress`.

**Acceptance Criteria:**
- Given une fiche avec tons et profil, when on rouvre le dialogue, then ils sont relus et `Assets/Dialogue/{id}.json` n'a pas de `scene`.
- Given un lecteur au clavier, when il atteint tons, profil, mentions et aperçu, then chacun a un nom accessible et s'actionne.

## Implementation Notes

## Spec Change Log

## Review Triage Log

## Verification

**Commands:**
- `npm run test:premerge`, `npm --prefix frontend run typecheck` -- verts

**Manual checks:**
- Navigateur intégré, `dialogue-generator-dev-sans-llm` : fiche complète et scène neuve comparées au board, relues après rechargement ; `npm run dev:stop`.
