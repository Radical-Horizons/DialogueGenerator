---
description: Erreurs de validation API explicites — jamais de 422 opaque pour un réglage UI valide ; erreurs save Unity → champs inline graphe.
paths:
  - "api/schemas/**/*.py"
  - "api/utils/unity_schema_validator.py"
  - "services/unity_export_validation_service.py"
  - "frontend/src/utils/documentValidationFieldErrors.ts"
---
# Validation API explicite

- Les plafonds Pydantic (`Field(ge/le)`) doivent rester **≥ toute valeur que le frontend peut envoyer** pour ce champ, ou le frontend doit normaliser **avant** l'appel (voir `generationConfigNormalization.ts`).
- Garder alignés : `constants.py` `Defaults`, `api/schemas/dialogue.py`, `frontend/src/constants.ts` (`API_MAX_COMPLETION_TOKENS`).
- Les handlers FastAPI (`api/main.py` `validation_exception_handler`) renvoient déjà `error.details` par champ : le frontend doit les afficher en prod (`getErrorMessage`), pas seulement en dev.
- Pour les paramètres simples du panneau génération : proposer une normalisation automatique (`detectGenerationConfigFixes` + bouton « Corriger ») plutôt qu'un échec silencieux.

## Save dialogue Unity (PUT /documents) → inline graphe

- **Source** : `validate_unity_export_document` → `error.details.structured_errors[]` (`code`, `message`, `path`, `node_id`). Ne pas compter sur `validation_errors` string seules pour l'UX inline.
- **Mapper frontend** : `frontend/src/utils/documentValidationFieldErrors.ts` — `path` `nodes.N.choices` → champ formulaire `choices` ; `nodes.N.choices.I.test` → `choices.I.test`. Fallback si message legacy `champ 'choices' … is too long`.
- **Application** : `persistenceSlice.applySaveFieldValidationErrors` → `setDocumentFieldErrors` + `setSelectedNode` + `focusNode`. Toast court (`inlineValidationToastMessage`) ; détail sous le champ.
- **Messages backend** : `api/utils/unity_schema_validator._error_to_structured` — jamais dumper l'instance JSON dans le message (`maxItems` choices → texte actionnable). Enrichissement FR : `unity_export_validation_service._enrich_structured_errors`.
- **Nouvelle erreur schéma** : si mappable sous un champ éditable (`NodeEditorPanel`, `ChoiceEditor`), ajouter le mapping + test Vitest dans `documentValidationFieldErrors.test.ts` ; message FR côté `_error_to_structured` si validator jsonschema brut.
