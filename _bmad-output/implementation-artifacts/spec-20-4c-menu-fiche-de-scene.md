---
title: 'Story 20.4, lot C — Le menu « fiche de scène ▾ »'
type: 'feature'
created: '2026-11-28'
status: 'done'
route: 'dispatch'
review_loop_iteration: 0
baseline_commit: '9d2f79ff36fe1bc56bf352eb7b7d0d77efa5cd66'
context:
  - '{project-root}/docs/guides/templates-et-profils-auteur.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** Depuis la fiche de scène, on ne peut ni régler les flags du dialogue, ni réutiliser la scène, ni voir ses métadonnées, la partager, voir ses permissions ou la supprimer : il faut passer par les pages Générer et Éditer, que la refonte retire.

**Approach:** Un menu « fiche de scène ▾ » sur la fiche, repliée comme dépliée, qui ouvre les composants existants (README § 13), et le titre de la scène écrit sur place. Ce lot ferme la story 20.4.

## Boundaries & Constraints

**Always:**
- Entrées et droits identiques à la section Éditer : « Flags du dialogue » et « Métadonnées » toujours ; « Partager » au propriétaire ou à l'admin ; « Permissions » hors invité ; « Supprimer » si le serveur l'autorise. Une entrée sans droit n'apparaît pas.
- Flags : le panneau existant, en fenêtre, sur le dialogue ouvert ; sauvegarde au fil du geste. Invité ou sans droit d'écriture : lecture seule, sans ajout, retrait ni saisie.
- Métadonnées, partage, permissions : `DialogueMetadataPanel`, `DialogueSharingModal`, `DialoguePermissionsPanel`, inchangés.
- Supprimer : confirmation native actuelle, avec le titre, « irréversible », et l'avertissement sur les modifications non enregistrées. Après suppression, la scène se ferme, la liste se rafraîchit, aucune sauvegarde ne recrée le fichier. Échec : message, scène intacte.
- Template (décidé) : « Enregistrer comme template » (hors invité) garde distribution, lieu, brief et fiches liées par la fenêtre de création existante ; ni tons ni profil. Un template ainsi gardé se recharge aussi par la page Générer.
- « Appliquer un template… » (décidé ; avec droit d'écriture) : remplace distribution, lieu, brief et fiches liées de la scène ouverte, avec confirmation si la fiche est remplie ; répliques, tons et profil intacts. Les réglages de modèle du template sont ignorés.
- Titre (décidé) : éditable dans la fiche, sauvegarde au fil de la saisie, nom du fichier inchangé ; un titre vide n'est pas enregistré. Lecture seule : texte.
- Clavier : menu et fenêtres s'actionnent au clavier, ont un nom accessible ; ÉCHAP ferme le plus proche et rend le focus.

**Never:**
- Recréer une fonction existante, retirer ou modifier les pages Générer et Éditer.
- Enveloppe (20.5), tiroir Contexte (20.25), changer l'API de partage, de permissions ou de templates, le format des nœuds, l'export ou le golden ; appel LLM facturé.

## I/O & Edge-Case Matrix

| Scénario | État | Attendu |
|---|---|---|
| Propriétaire | writer sur son dialogue | Flags, Enregistrer comme template, Appliquer un template, Métadonnées, Partager, Permissions, Supprimer |
| Co-éditeur | écrit, ne possède pas | ni « Partager » ni « Supprimer » |
| Writer sans droit d'écriture | dialogue d'un autre | pas d'« Appliquer » ; « Flags » en lecture seule |
| Invité | session guest | « Flags » (lecture seule) et « Métadonnées » seuls |
| Flag ajouté | puis rechargement | liaison relue |
| Suppression annulée | confirmation refusée | rien ne change |
| Suppression avec saisie en attente | autosave programmé | fichier absent, non recréé |
| Template appliqué, refusé | fiche remplie | fiche inchangée |
| Titre vidé | champ vide à la sortie | titre précédent rétabli |
| Autre dialogue ouvert | fenêtre ouverte, changement de scène | la fenêtre se ferme |

</frozen-after-approval>

## Code Map

- `frontend/src/components/scene/SceneSheetBar.tsx` -- `SceneSheetPanel` : en-tête (titre, « déplier la fiche ▾ ») ; y monter le menu, dans un composant voisin. `useSceneReadOnly` pour la lecture seule.
- `components/unityDialogues/DialogueMetadataPanel.tsx`, `DialogueSharingModal.tsx`, `DialoguePermissionsPanel.tsx` -- props `{documentId, open, onClose}`.
- `components/unityDialogues/UnityDialogueDetails.tsx` -- règles de droits (`canManageShares`, `canViewPermissions`, `canDelete`).
- `components/unityDialogues/DialogueListContextMenu.tsx` (l. 72-103) -- confirmation et suppression à partager : `deleteUnityDialogue`, `notifyDialogueDeleted`.
- `hooks/useDialogueLoader.ts` (l. 187-202) -- ferme le graphe à la suppression ; vérifier aussi la route `/graph-editor/:dialogueId`.
- `store/slices/persistenceSlice.ts` (l. 463, 532), `store/types/graphState.ts` -- seul `canEditDocument` est gardé : ajouter `can_delete` et `is_owner`.
- `components/generation/DialogueFlagsPanel.tsx` -- lit le store du graphe (`dialogueFlagsSlice` marque le document modifié) ; ajouter `readOnly`.
- `components/generation/TemplateCreatorModal.tsx` (`{isOpen, snapshot, onClose}`), `store/templateStore.ts`, `hooks/usePresetManagement.ts` (l. 262, 387 : forme de la configuration), `utils/sceneSheet.ts` -- enregistrer et appliquer un template (conversion fiche ↔ configuration, fonctions pures).
- `persistenceSlice.ts` (l. 591-623) -- titre repris de `state.document` et du serveur à la sauvegarde.

## Tasks & Acceptance

**Execution:**
- [x] `store/` -- droits `can_delete` / `is_owner` du dialogue ouvert ; tests.
- [x] `components/generation/DialogueFlagsPanel.tsx` -- lecture seule ; tests.
- [x] `utils/` + `DialogueListContextMenu.tsx`, `UnityDialogueDetails.tsx` -- suppression et confirmation partagées ; tests existants verts.
- [x] `components/scene/` -- menu, fenêtres, droits, clavier ; tests de la matrice.
- [x] `utils/` + `components/scene/` -- enregistrer et appliquer un template ; titre éditable ; tests.
- [x] `docs/design/refonte-scene/README.md` § 13 -- aligner la ligne ; `deferred-work.md` -- retirer le lot C, noter le manque « voix et templates sans écran après 20.11 » ; `sprint-status.yaml` -- story `done`.

**Acceptance Criteria:**
- Given un dialogue ouvert dans le graphe, when on ouvre « fiche de scène ▾ », then chaque fonction que le README § 13 y range est atteignable sans passer par Générer ni Éditer.
- Given les pages Éditer et bibliothèque, when on supprime un dialogue, then la confirmation et l'effet sont ceux d'avant.

## Implementation Notes

- Menu : `SceneSheetMenu` ; fenêtres : `SceneWindow` (focus, ÉCHAP, frappes retenues, `body` compris).
- Scène sans réplique : l'autosave s'écrit aussi pour un titre ou des flags changés (`titleDirty`, `flagsDirty`) et se suspend pendant une suppression.
- Un titre écrit ici prime sur celui du serveur à un 409 et n'est pas repris par l'annulation.
- Lieu libre : le serveur le retire de `locations`, il est gardé dans `subLocation`. La page Générer signale alors la référence avant de charger.
- Personnages absents du GDD : retirés du template par le serveur (reporté).
- Vérification finale : `test:premerge` vert (2864 pytest, 2331 Vitest, lint zéro), typecheck zéro, preuve UI sur un dialogue jetable (menu, flags, titre, template à lieu libre, suppression : un DELETE, aucun PUT). Invité, co-éditeur et sans droit d'écriture : Vitest seulement. Pas de spec Playwright.

## Spec Change Log

## Review Triage Log

Passe 1 — B : relecteur sans contexte, E : cas limites, V : trous de vérification, T : tri.

- B1 (sans PJ, Générer met le PNJ en PJ) · low · rejeté — la configuration est positionnelle ; dire « pas de PJ » demande un champ neuf pour un cas rare.
- B2 (sans PJ, un PNJ jouable devient PJ) · low · rejeté — voir B1.
- B3 (template de Générer : tous les personnages en PNJ) · low · rejeté — réel, mais la génération reçoit les mêmes fiches ; le format ne distingue pas protagonistes et contexte, un marqueur serait une surface neuve. Signalé à l'auteur.
- B4 (focus sur `body`, raccourcis du graphe derrière la fenêtre) · medium · patch — `keepKeysInside` n'entend que le conteneur ; le dialogue n'a pas de `tabIndex`.
- B5 (garde de suppression limitée à l'autosave) · low · rejeté — fenêtre de quelques ms ; `mustExist` empêche déjà de recréer le fichier.
- B6 (409 : flags du serveur écrasés) · medium · defer — antérieur : `putDocumentAt` envoyait déjà les liaisons locales.
- B7 (titre vidé puis page quittée sans sortie) · low · rejeté — il faut recharger pendant que le champ est vide ; ajoute un anti-rebond.
- B8 (titre long rogné dans un champ d'une ligne) · medium · patch — le `<h2>` passait à la ligne.
- B9 (usage du template non compté) · low · rejeté — les suggestions ne vivent que sur la page Générer, qui sera retirée ; ajoute un appel.
- B10 (appliquer n'est pas annulable) · low · rejeté — confirmation décidée ; l'annulation serait une fonction neuve.
- B11 (la fenêtre de création demande des réglages ignorés) · low · rejeté — fenêtre existante réutilisée telle quelle (décidé) ; Générer lit ces réglages.
- B12 (aucun retour pendant l'enregistrement du template) · low · rejeté — lectures locales brèves.
- B13 (flèches bloquées sur « Suppression… ») · low · patch — correction directe du sélecteur.
- B14 (renommage non reflété dans la bibliothèque) · low · rejeté — il faut un échec du layout ou une génération entre-temps ; la liste se relit au chargement suivant.
- B15 (en-tête de `dialogueDeletion.ts` : confirmation « partagée » avec Éditer) · low · patch — commentaire faux.
- B16 (story `done` sans e2e) · false · rejeté — la colonne e2e du README § 13 conditionne le retrait du panneau (20.15), pas cette story.
- B17 (entrée du lot C effacée de `deferred-work.md`) · false · rejeté — la consigne de la mission est de retirer ce qui est livré ; la décision est dans cette spec.
- E1 (le serveur retire les noms absents du GDD) · medium · patch (lieu) et defer (PNJ, PJ) — reproduit au navigateur : « La Forge » libre perdue ; garder les personnages libres demande de changer l'API des templates, exclu.
- E2 (sans PJ) · low · rejeté — voir B1.
- E3 (PJ déduit du statut jouable) · low · rejeté — voir B1 ; avec un PJ, il est premier dans la liste.
- E4 (personnages de contexte en PNJ) · low · rejeté — voir B3.
- E5 (focus sur `body`) · medium · patch — voir B4.
- E6 (flèches et entrée désactivée) · low · patch — voir B13.
- E7 (fenêtre de création qui s'empile) · low · rejeté — lectures locales brèves ; ajoute une garde.
- E8 (onglet masqué ou dialogue changé pendant la suppression) · low · rejeté — voir B5.
- E9 (suppression pendant un PUT en vol) · low · rejeté — le PUT part avant le DELETE et `confirm` bloque la page entre les deux.
- E10 (titre partiel si le champ est démonté) · low · rejeté — voir B7.
- E11 (titre vidé puis rétabli : marqué modifié) · low · patch — un 409 écraserait un renommage fait ailleurs.
- E12 (scène vide, layout en échec) · low · rejeté — le document est écrit ; le layout d'une scène vide ne porte rien.
- E13 (renommage et liste après échec du layout) · low · rejeté — voir B14.
- E14 (« En attente » après un refus avec erreurs de champs) · low · rejeté — des flags ou un titre n'en produisent pas.
- E15 (menu flottant au redimensionnement) · low · rejeté — un clic ailleurs le ferme ; ajoute des écouteurs.
- V1 (titre d'une scène sans réplique non vérifié à l'autosave) · medium · patch.
- V2 (rafraîchissement de la liste non vérifié) · medium · patch.
- V3 (retour à `/graph-editor` non vérifié) · medium · patch.
- V4 (recherche du lieu à l'enregistrement du template non vérifiée) · medium · patch.
- V5 (alias et noms absents à l'application non vérifiés) · medium · patch.
- V6 (état d'échec de la fenêtre des flags non vérifié) · medium · patch.
- V autre 1 (renommage et liste) · low · rejeté — voir B14.
- V autre 2 (« En attente ») · low · rejeté — voir E14.
- T1 (en-tête du graphe : « Enregistré · HH:MM » rogné à 1440 px avec la bibliothèque ouverte) · low · defer — antérieur au lot C, vu au navigateur.

## Design Notes

La section Éditer et le menu contextuel de la bibliothèque ont deux confirmations différentes ; celle du menu contextuel (titre, modifications non enregistrées) est retenue pour la fiche.

## Verification

**Commands:**
- `npm run test:premerge`, `npm --prefix frontend run typecheck` -- verts

**Manual checks:**
- Navigateur intégré, `dialogue-generator-dev-sans-llm` : chaque entrée du menu sur un dialogue jetable, suppression comprise ; `npm run dev:stop`.
