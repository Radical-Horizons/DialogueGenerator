---
title: 'Migration silencieuse des modèles Unity legacy (anti-clignotement alerte)'
type: 'bugfix'
created: '2026-07-22'
status: 'done'
baseline_commit: '8b71cc805bdf3d39d424be37a0a840252e92b20f'
review_loop_iteration: 0
context: []
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** Sur la page d’accueil en prod, l’alerte jaune « modèle gpt-5.4 non supporté → bascule gpt-5.6-sol » apparaît et disparaît en boucle alors que le sélecteur affiche déjà GPT-5.6 Sol. Cause : le draft/panel conserve le littéral `"gpt-5.4"` tandis que le store LLM a déjà `gpt-5.6-sol`, et les deux sources se battent.

**Approach:** Normaliser silencieusement les IDs legacy (miroir de `LEGACY_MODEL_ID_MAP` Python) dès le chargement / avant détection de correctifs, persister le modèle migré, et ne plus afficher d’alerte pour un ID remappable.

## Boundaries & Constraints

**Always:**
- Parité des IDs legacy avec `constants.py` `ModelNames.LEGACY_MODEL_ID_MAP` (`gpt-5.4` → sol, `gpt-5.2` → terra, etc.).
- Migration silencieuse + persistance (draft panel + store LLM) pour éviter le ping-pong.
- Les modèles vraiment non supportés (ex. Mistral pour Unity) gardent une alerte / correctif explicite.

**Ask First:**
- Changer le mapping legacy côté backend Python (hors miroir frontend).

**Never:**
- Laisser une bannière « Corriger automatiquement » pour un ID legacy remappable.
- Corriger uniquement le sélecteur sans écrire le draft/panel.
- Refactor large hors normalisation modèle / sync store↔draft.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Legacy draft | `llmModel: "gpt-5.4"` en draft, store déjà `gpt-5.6-sol` | Panel + draft + store = `gpt-5.6-sol` ; **aucune** alerte modèle | N/A |
| Legacy seul | Draft/store `"gpt-5.4"` au boot | Migration silencieuse vers sol ; pas de flash d’alerte | N/A |
| Mistral Unity | `llmModel: labs-mistral-…` | Alerte + correctif vers un modèle Unity supporté (comportement actuel) | N/A |
| Déjà valide | `gpt-5.6-sol` / terra / luna | Aucun correctif modèle | N/A |

</frozen-after-approval>

## Code Map

- `frontend/src/constants.ts` — ajouter `LEGACY_MODEL_ID_MAP` + `normalizeModelId` (parité Python)
- `frontend/src/utils/generationConfigNormalization.ts` — `resolveModelForUnityGeneration` / `detectGenerationConfigFixes` : normaliser avant comparaison ; pas de fix UI pour legacy remappé
- `frontend/src/store/llmStore.ts` — migrer à l’init / `setModel` + persister `llm-model`
- `frontend/src/hooks/useGenerationDraft.ts` (et/ou hydrate settings) — migrer `llmModel` au load/save draft
- `frontend/src/components/generation/GenerationPanel.tsx` — éviter sync store↔local qui re-injecte un legacy
- `frontend/src/utils/generationConfigNormalization.test.ts` — tests littéral `"gpt-5.4"` (pas seulement `MODEL_NAMES.GPT_5_4`)
- Miroir référence : `constants.py` `ModelNames.LEGACY_MODEL_ID_MAP` / `normalize_model_id`

## Tasks & Acceptance

**Execution:**
- [x] `frontend/src/constants.ts` -- ajouter map legacy + `normalizeModelId` alignée sur Python -- source unique côté FE
- [x] `frontend/src/utils/generationConfigNormalization.ts` -- appliquer `normalizeModelId` dans resolve/detect ; ne pas pousser de `GenerationConfigFix` llmModel pour un ID remappé vers un Unity supporté -- coupe l’alerte épileptique
- [x] `frontend/src/store/llmStore.ts` + draft hydration (`useGenerationDraft` / sync settings) -- réécrire et persister le slug migré au chargement -- empêche le retour de `"gpt-5.4"` depuis le draft
- [x] `frontend/src/utils/generationConfigNormalization.test.ts` (+ store/draft si existants) -- couvrir littéral `"gpt-5.4"` → sol sans fix ; Mistral garde un fix -- non-régression

**Acceptance Criteria:**
- Given un draft avec `llmModel: "gpt-5.4"` et un store à `gpt-5.6-sol`, when la page d’accueil charge, then aucune alerte modèle ne s’affiche et l’état persisté devient `gpt-5.6-sol`.
- Given un modèle Mistral sélectionné pour Unity, when `detectGenerationConfigFixes` tourne, then un correctif modèle reste proposé.
- Given un modèle Unity 5.6 déjà valide, when détection, then zéro correctif modèle.

## Spec Change Log

## Verification

**Commands:**
- `cd frontend && npx vitest run src/utils/generationConfigNormalization.test.ts --reporter=dot` -- expected: pass
- Tests store/draft ciblés si touchés -- expected: pass
- `npm --prefix frontend run lint` -- expected: 0 error sur fichiers touchés

**Manual checks (if no CLI):**
- Boot avec draft local contenant `"gpt-5.4"` : sélecteur Sol, pas de bandeau jaune qui clignote.

## Suggested Review Order

**Normalisation silencieuse**

- Point d’entrée : map legacy miroir Python + `normalizeModelId`.
  [`constants.ts:42`](../../frontend/src/constants.ts#L42)

- Pas d’alerte si le littéral remappe vers un modèle Unity supporté.
  [`generationConfigNormalization.ts:127`](../../frontend/src/utils/generationConfigNormalization.ts#L127)

**Persistance store + draft**

- Init / `setModel` réécrivent `llm-model` migré.
  [`llmStore.ts:28`](../../frontend/src/store/llmStore.ts#L28)

- `loadDraft` / `saveDraft` migrent et sync le store.
  [`useGenerationDraft.ts:158`](../../frontend/src/hooks/useGenerationDraft.ts#L158)

- Cache settings serveur + push draft migré après hydratation.
  [`useUserSettingsSync.ts:101`](../../frontend/src/hooks/useUserSettingsSync.ts#L101)

**Tests**

- Littéral `"gpt-5.4"` → zéro fix modèle.
  [`generationConfigNormalization.test.ts:18`](../../frontend/src/utils/generationConfigNormalization.test.ts#L18)
