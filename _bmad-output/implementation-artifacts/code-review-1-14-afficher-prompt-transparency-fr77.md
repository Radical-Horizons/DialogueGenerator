# Code Review — Story 1.14 (Afficher prompt transparency FR77)

**Story:** 1-14-afficher-prompt-transparency-prompt-exact-envoyé-au-llm-fr77  
**Date:** 2026-03-06  
**Reviewer:** Amelia (Dev Agent, adversarial code review)  
**Suite :** Corrections automatiques appliquées (option 1). Statut story → **done**.

---

## Git vs Story Discrepancies

- **Fichiers modifiés (git) non listés dans la File List de la story :**  
  `frontend/src/App.tsx`, `frontend/src/components/graph/GraphEditor.tsx`.  
  Si les changements sont liés à la story, la File List doit être mise à jour ; sinon, à documenter comme hors périmètre (l’utilisateur a indiqué que certains fichiers du diff ne sont pas liés à l’US).
- **Fichiers de la story :** tous présents dans le diff ou en untracked (nouveaux), cohérent avec la File List pour les fichiers applicatifs.

---

## Issues Found

### HIGH (à traiter)

1. **AC #1 partiel — Sections délimitées**  
   - **Exigence :** « les sections sont clairement délimitées (System prompt, Context GDD, Instructions, etc.) ».  
   - **Constat :** Le modal affiche un seul bloc `<pre>` avec le `raw_prompt` brut, sans découpage ni libellés (System prompt, Context GDD, Instructions).  
   - **Fichier :** `frontend/src/components/graph/PromptViewerModal.tsx`  
   - **Action :** Soit parser le prompt et afficher des sections titrées (si format connu), soit au minimum afficher des séparateurs visuels pour les blocs déjà identifiables dans la chaîne (ex. "Contexte précédent", "Réponse du joueur", "Instructions pour la suite").

### MEDIUM (recommandé)

2. **AC #1 — Point d’entrée "menu contextuel"**  
   - **Exigence :** « "Voir le prompt" (menu contextuel **ou** panneau détails) ».  
   - **Constat :** Seul un bouton au survol/sélection du nœud est implémenté (équivalent panneau détails). Aucune entrée « Voir le prompt » dans un menu contextuel (clic droit).  
   - **Fichier :** `frontend/src/components/graph/nodes/DialogueNode.tsx` ; menu contextuel géré dans `GraphCanvas.tsx` (actuellement on empêche le menu natif).  
   - **Action :** Ajouter une entrée « Voir le prompt » dans le menu contextuel du nœud (si le pattern existe déjà pour d’autres actions), ou documenter explicitement que seul le bouton sur le nœud est livré pour cette story.

3. **Préparation Story 1.15 — Utilisation du prompt stocké**  
   - **Constat :** L’endpoint `GET /graph/prompt` reconstruit toujours le prompt et ne lit jamais un champ `prompt` sur l’enregistrement LLM. Quand la Story 1.15 ajoutera `prompt` (et éventuellement `response`) à `LLMUsageRecord`, cet endpoint devra utiliser `record.prompt` lorsqu’il est présent, et renvoyer `is_historical=True` + message « Prompt historique - contexte GDD depuis modifié » si pertinent.  
   - **Fichier :** `api/routers/graph.py` — `get_node_prompt` (lignes 516–556).  
   - **Action :** Après livraison 1.15, adapter la logique : si `record` existe et `getattr(record, 'prompt', None)` est renseigné, utiliser ce prompt et mettre `is_historical=True` au lieu de toujours reconstruire.

4. **Incohérence dans la story**  
   - **Constat :** Dans la section « Story Completion Status », il est écrit « Status : ready-for-dev » alors que l’en-tête de la story indique « Status: review ».  
   - **Fichier :** `_bmad-output/implementation-artifacts/1-14-afficher-prompt-transparency-prompt-exact-envoyé-au-llm-fr77.md`  
   - **Action :** Mettre à jour « Story Completion Status » pour refléter « review » (ou « done » après corrections).

5. **File List vs git**  
   - Si les changements dans `App.tsx` et `GraphEditor.tsx` sont liés à la story, les ajouter à la File List et au Change Log. Sinon, ne pas les inclure (déjà noté que l’utilisateur considère une partie du diff comme hors US).

### LOW (améliorations)

6. **Logging — Récupération du record usage**  
   - **Constat :** Dans `get_node_prompt`, `except Exception: record = None` avale toute exception lors de l’appel à `usage_service.repository.get_by_dialogue_and_node`. En cas de bug (ex. erreur de sérialisation), le diagnostic est difficile.  
   - **Fichier :** `api/routers/graph.py` (vers 524–526).  
   - **Action :** Logger au niveau debug (ou warning) l’exception avant de continuer avec `record = None`.

7. **Tests API — Record avec tokens**  
   - **Constat :** Aucun test ne mocke `get_by_dialogue_and_node` pour retourner un enregistrement avec `prompt_tokens` / `completion_tokens` et ne vérifie que la réponse JSON contient bien ces champs. Les tests actuels couvrent uniquement le cas « prompt reconstruit » sans record.  
   - **Fichier :** `tests/api/test_graph_prompt.py`  
   - **Action :** Ajouter un test avec mock du repository retournant un `LLMUsageRecord` (tokens, timestamp) et assertion sur les champs de la réponse.

8. **Numéros de ligne (Task 2)**  
   - Les Completion Notes mentionnent « numéros de ligne » pour le modal. Les AC ne l’exigent pas explicitement. Actuellement le prompt est affiché sans numéros de ligne.  
   - **Action :** Optionnel — ajouter des numéros de ligne (ex. colonne gauche du `<pre>`) pour faciliter le debug, ou clôturer la tâche sans si on considère que ce n’est pas bloquant.

---

## Validation des AC et tâches

| AC / Tâche | Statut | Commentaire |
|------------|--------|-------------|
| AC #1 | Partiel | Modal + prompt + Copier + tokens OK ; sections délimitées manquantes ; entrée « menu contextuel » non implémentée |
| AC #2 | OK | Copier, affichage tokens (prompt_tokens, completion_tokens, total) |
| AC #3 | N/A (1.15) | Sauvegarde automatique du prompt dans les logs — prévu Story 1.15 |
| AC #4 | Partiel | Prompt de base affiché ; variations par nœud batch non implémentées (dépendent 1.15) |
| AC #5 | Partiel | Message « Prompt reconstruit (contexte actuel) » présent ; message « Prompt historique - contexte GDD depuis modifié » pour plus tard (1.15) |
| Task 1 | OK | Endpoint GET /prompt, schéma NodePromptResponse, reconstruction, get_by_dialogue_and_node |
| Task 2 | Partiel | Modal, Copier, tokens OK ; sections délimitées et option menu contextuel manquantes |
| Task 3 | OK | Message informatif ; variations batch documentées comme post-1.15 |
| Task 4 | OK | Tests backend (6) et frontend (8) présents et passants |

---

## Synthèse

- **CRITICAL :** 0 (aucune tâche marquée [x] sans implémentation).  
- **HIGH :** 1 (sections délimitées AC #1).  
- **MEDIUM :** 4 (menu contextuel, préparation 1.15, incohérence statut story, File List vs git).  
- **LOW :** 3 (logging, test avec record mocké, numéros de ligne).

Tous les tests exécutés (backend `test_graph_prompt` + `test_llm_usage_repository`, frontend `PromptViewerModal.test.tsx`) sont verts.
