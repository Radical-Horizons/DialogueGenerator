---
title: 'Colonne de génération — trois onglets d''entrée et un tiroir de réglages'
type: 'refactor'
created: '2026-08-19'
status: 'in-review'
review_loop_iteration: 0
baseline_commit: 'ba006b6444501d047f43affb8caa6ca75d837bb0'
context:
  - '{project-root}/.claude/rules/ui_redesign_2026.md'
  - '{project-root}/.claude/rules/responsive_frontend.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem :** le bandeau de brief aligne six entrées d'apparence identique pour des objets de
natures différentes — deux bascules et quatre navigations. L'utilisateur ne peut pas prédire si
un clic révèle ou remplace la surface de travail, et « brief » / « briefs » / « templates »
nomment trois choses dont deux se recouvrent.

**Approach :** faire porter à la forme la nature réelle des objets. La colonne est la zone
d'**entrée** de la génération : ses onglets sont les trois familles qu'on rédige (Brief, Flags,
Templates), et le tiroir du bas devient « Réglages de génération » — modèle, profil d'auteur,
règles du jeu, prompt système. Les briefs enregistrés redeviennent un repli **à l'intérieur** de
l'onglet Brief, dont ils sont une sous-fonction.

## Boundaries & Constraints

**Always :**
- Rien ne part vers l'inspecteur de droite : c'est la zone de **sortie**. `dialogue_flags` est un
  champ de la requête de génération, donc une entrée.
- Aucune fonctionnalité supprimée : tout panneau déplacé garde ses actions. Le prompt système
  conserve son avertissement « zone avancée ».
- Tokens depuis `redesignTokens.ts` ; espacements 5/9/14/20/34 ; un seul bouton plein par écran.
- Mode écriture : seul l'onglet Brief est actif, bandeau masqué.
- Desktop ≥1024 sans régression ; la barre d'onglets ne passe pas à la ligne.

**Ask First :**
- Sortir les **règles du jeu** du tiroir vers un onglet, si leur usage réel est scène-par-scène.
- Toute suppression de données utilisateur en `localStorage`.

**Never :**
- Ne pas migrer les briefs enregistrés vers les templates — découpé, voir `deferred-work.md`.
- Ne pas toucher aux templates d'**auteur** locaux : `PresetConfiguration` n'a pas de champ
  `authorProfile`. Ils suivent le panneau profil d'auteur dans le tiroir.
- Ne pas modifier le backend, les schémas API ni la persistance.
- Ne pas réintroduire de `CustomEvent` / `window.addEventListener` pour la communication
  inter-composants.

## I/O & Edge-Case Matrix

| Scénario | Entrée / État | Comportement attendu | Gestion d'erreur |
|---|---|---|---|
| Sélection d'onglet | Clic sur Flags depuis Brief | Le contenu bascule ; l'onglet actif est souligné ; le texte du brief est conservé | N/A |
| Mode écriture hors Brief | Onglet Flags actif, `writingMode` → `true` | Retour forcé au Brief ; bandeau masqué | N/A |
| Tiroir replié | `showGenerationSettings = false` | La ligne résumé affiche le modèle ; les quatre réglages ne sont pas visibles | N/A |
| Tiroir déplié | Clic sur la ligne résumé | Modèle, profil d'auteur, règles du jeu, prompt système accessibles sans quitter l'onglet courant | N/A |
| Compteur de flags | 4 flags liés au dialogue | L'onglet affiche « Flags · 4 » | 0 flag → « Flags » sans compteur |
| Briefs enregistrés | Onglet Brief, clic sur le repli | Les briefs locaux et serveur s'affichent sous le brief, sans le remplacer | N/A |

</frozen-after-approval>

## Code Map

Après implémentation — les fichiers créés sont marqués **(nouveau)**.

- `frontend/src/hooks/useGenerationInputTab.ts` **(nouveau)** -- onglet actif + invariant du
  mode écriture, sorti de la vue pour être testable sans monter `GenerationPanel`.
- `frontend/src/components/generation/GenerationInputTabs.tsx` **(nouveau)** -- barre d'onglets.
- `frontend/src/components/generation/GenerationSettingsDrawer.tsx` **(nouveau)** -- tiroir ;
  reçoit les réglages de modèle en `children` et monte les trois panneaux en sections.
- `frontend/src/components/generation/AuthorProfilePanel.tsx` **(nouveau)**,
  `GameRulesPanel.tsx` **(nouveau)**, `SystemPromptPanel.tsx` **(nouveau)** -- extraits de
  `SystemPromptEditor`, chacun autonome (hooks et état internes).
- `frontend/src/components/generation/SystemPromptEditor.tsx` -- 1388 → 490 l., ne porte plus
  que le brief et son repli « briefs enregistrés ».
- `frontend/src/components/generation/GenerationPanel.tsx` -- barre d'onglets, contenu actif,
  tiroir ; propriétaire unique de l'onglet via le hook.
- `e2e/templates-*.spec.ts` -- ouverture par `input-tab-templates`.

## Tasks & Acceptance

**Execution :**
- [x] `GenerationSettingsDrawer.tsx` -- créé ; accueille modèle (`children`), profil d'auteur,
  règles du jeu et prompt système en sections repliables.
- [x] `AuthorProfilePanel.tsx` / `GameRulesPanel.tsx` / `SystemPromptPanel.tsx` -- extraits ;
  ~500 lignes déplacées, JSX découpé programmatiquement pour éviter toute erreur de recopie.
- [x] `SystemPromptEditor.tsx` -- réduit au brief ; les briefs enregistrés redeviennent un
  `<details>` natif à l'intérieur, sans état porté.
- [x] `GenerationPanel.tsx` -- barre d'onglets, contenu actif, tiroir.
- [x] `useGenerationInputTab.ts` + `GenerationInputTabs.tsx` -- extraits pour que la matrice
  soit couverte par des tests qui tournent en CI (le fichier d'intégration `GenerationPanel`
  est exclu de la config Vitest par défaut **et rouge avant ce chantier**).
- [x] Tests -- `useGenerationInputTab.test.ts`, `GenerationInputTabs.test.tsx`,
  `GenerationSettingsDrawer.test.tsx`, `SystemPromptEditor.brief.test.tsx`.
- [x] `e2e/templates-*.spec.ts` -- 8 specs adaptées.

**Acceptance Criteria :**
- Étant donné la colonne au repos, quand je regarde le bandeau, alors je vois exactement trois
  onglets — Brief, Flags, Templates — et aucun lien secondaire.
- Étant donné n'importe quel onglet actif, quand je déplie « Réglages de génération », alors
  j'accède aux quatre réglages sans quitter mon onglet.
- Étant donné l'onglet Brief, quand j'ouvre les briefs enregistrés, alors ils s'affichent sous le
  brief sans le remplacer.
- Étant donné le mot « briefs », quand je parcours l'UI, alors il ne désigne plus qu'une chose.

## Design Notes

Le partage est **entrée vs comportement**, pas « fréquent vs rare » :

```
Onglets = ce que je rédige       Brief (par nœud) · Flags (par dialogue) · Templates (par projet)
Tiroir  = comment le LLM traite  modèle · effort · budgets · auteur · règles · prompt système
```

`SystemPromptEditor` perd la propriété de la barre d'onglets : elle remonte à `GenerationPanel`,
qui détient déjà les bascules flags et templates. C'est ce qui supprime la **classe** de bug à
l'origine du signalement — un lien du bandeau pilotait un état local pendant que le panneau qu'il
prétendait ouvrir vivait chez le parent.

## Notes d'implémentation

**Ajout non prévu par la matrice, révélé par les E2E.** Charger un template écrit dans le brief.
Sans retour à l'onglet Brief, l'action était invisible : l'utilisateur appliquait un modèle et
rien ne bougeait sous ses yeux. `backToBriefAfter` enveloppe les quatre callbacks de chargement
(preset, template, pré-built, suggestion). « Copier vers mes templates » n'est **pas** enveloppé :
il ne touche pas au brief.

Cinq specs E2E échouaient sur `#user-instructions-textarea` — elles disaient la même chose que
l'utilisateur aurait dite. Le correctif est allé dans le code, pas dans les assertions.

**Audit de la matrice I/O** — chaque ligne couverte par un test exécuté et vert :

| Ligne | Test |
|---|---|
| Sélection d'onglet | `GenerationInputTabs.test.tsx` (sélection, onglet actif unique) ; conservation du brief entre bascules : `e2e/templates-apply.spec.ts` |
| Mode écriture hors Brief | `useGenerationInputTab.test.ts` |
| Tiroir replié / déplié | `GenerationSettingsDrawer.test.tsx` |
| Compteur de flags | `GenerationInputTabs.test.tsx` (avec et sans compte) |
| Briefs enregistrés | `SystemPromptEditor.brief.test.tsx` |

## Verification

**Commands :**
- `cd frontend && npx tsc --noEmit` -- expected : 0 erreur
- `cd frontend && npm run lint` -- expected : 0 erreur, 0 warning
- `cd frontend && npx vitest run src/components/generation/__tests__/ --reporter=dot` -- expected : vert
- `npx playwright test e2e/templates-*.spec.ts --reporter=list --workers=1` -- expected : 11 passed

**Manual checks :**
- `npm run dev`, navigateur à 1440 px puis 1024 px : trois onglets sur une ligne, bascule sans perte
  du brief, tiroir contenant les quatre réglages, zéro erreur console.
