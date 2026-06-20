## Epic 5: Export et intégration Unity

Les utilisateurs peuvent exporter les dialogues vers Unity JSON format avec validation 100% schema conformity. Le système valide avant export, génère logs metadata, permet preview et batch export.

**FRs covered:** FR49-54 (export Unity, validation schema, preview, logs, batch export)

**NFRs covered:** NFR-I1 (Unity Export Reliability 100% valid), NFR-P3 (API Response <200ms export)

**Valeur utilisateur:** Pipeline fiable DialogueGenerator → Unity sans erreurs d'intégration (0% invalid exports).

**Dépendances:** Epic 1 (dialogues à exporter), Epic 2 (graphe structure), Epic 4 (validation avant export)

---

## Index des user stories (seules sections `### Story N.M:` ci-dessous)

| Story | Titre | FR |
|-------|-------|-----|
| **5.1** | Exporter dialogue single vers format Unity JSON | FR49 |
| **5.2** | Exporter batch plusieurs dialogues vers Unity JSON | FR50 |
| **5.3** | Valider JSON exporté contre schéma Unity custom | FR51 |
| **5.4** | Télécharger fichiers JSON exportés | FR52 |
| **5.5** | Prévisualiser export avant téléchargement | FR53 |
| **5.6** | Générer logs export avec métadonnées | FR54 |

> Les sections **Contexte GDD** et **Garde-fous** (titres `####` ou `##`) ne sont **pas** des user stories — ne pas les ajouter à `sprint-status.yaml`.

---

## Contexte GDD Alteir — Ce que le schéma Unity doit couvrir

Source : `gdd-systems-reference.md`. L'export Unity n'est pas un simple dump JSON de nœuds : il porte l'ensemble des systèmes GDD qui gouvernent les dialogues en jeu.

#### Structure d'un nœud dialogue (Unity)

```
UnityDialogueNode {
  id, text, speakerTag,
  choices[]: { text, targetNodeId, conditions[], actions[] },
  conditions[],           // visibilité/déclenchement du nœud entier
  actions[],              // effets au déclenchement
  nextNodeId,             // nœud suivant si pas de choix
  nodeType,               // "dialogue" | "cutscene" | "memory_exploration"
  skillCheckConfig?       // { characteristic, DD, successNode, failNode }
}
```

#### Flags — 3 types distincts à sérialiser


| Type                                   | Opérateurs conditions      | Opérateurs actions                    |
| -------------------------------------- | -------------------------- | ------------------------------------- |
| `bool`                                 | `is_true`, `is_false`      | `set_true`, `set_false`               |
| `compteur` (int, min/max GDD)          | `>=`, `<=`, `==`, `>`, `<` | `increment`, `decrement`, `set_value` |
| `enum` (valeurs ordonnées avec défaut) | `==`, `!=`, `in_list`      | `set_value`                           |


Convention de nommage : `Flag_[scope]_[entité]_[description]`
Scopes : `perso`, `lieu`, `faction`, `systeme`, `quete`, `objet`

#### Réputation — règle critique export

Les 3 axes (Admiration, Prestige, Crainte) sont exportés comme **valeur agrégée entière** — le tier dynamique (Sympathie/Faveur/Dévotion) n'est **jamais** stocké dans un champ séparé du JSON Unity (Source of Truth = agrégat).

Condition de réputation dans choices :

```json
{ "type": "reputation", "faction": "Gardiens", "axis": "Prestige", "operator": ">=", "value": 30 }
```

Action de réputation :

```json
{ "type": "reputation_delta", "faction": "Gardiens", "axis": "Admiration", "delta": +5 }
```

#### Tests de caractéristiques (Core System)

Les 8 caractéristiques (Puissance, Agilité, Perception, Intelligence, Créativité, Sociabilité, Technique, Volonté) peuvent conditionner des choix ou déclencher un skill check :

```json
{
  "type": "skill_check",
  "characteristic": "Sociabilité",
  "DD": 14,
  "successNodeId": "node_42",
  "failNodeId": "node_43"
}
```

#### Types de nœuds spéciaux

Scope couvert par les stories **5.1** (sérialisation export) et **5.3** (validation schéma) — pas des US séparées.

- **Cut-scene** (`nodeType: "cutscene"`) : pas de choix interactifs, déclenche séquence animatique. Actions possibles : `trigger_animation`, `camera_movement`, `unlock_memory`.
- **Exploration de souvenir** (`nodeType: "memory_exploration"`) : exploration de fragments de mémoire, flags `Flag_systeme_memoire_`* modifiés en fin de séquence.
- **Nœud Influence/Respect** : action `influence_delta` / `respect_delta` avec `{ npcId, delta }`.

#### Repères de maintenabilité (alertes non-bloquantes)

- **~1 000 nœuds** par dialogue : alerte de complexité (seuil GDD, pas de blocage export)
- **~10 flags conversationnels par PNJ** : alerte de maintenabilité
- **~3 compteurs par PNJ** : alerte de maintenabilité

**→ Ces seuils génèrent des warnings dans le log d'export (Story 5.6), jamais des erreurs bloquantes.**

---

## ⚠️ GARDE-FOUS - Vérification de l'Existant (Scrum Master)

**OBLIGATOIRE avant création de chaque story de cet epic :**

#### Checklist de Vérification

1. **Fichiers mentionnés dans les stories :**
  - Vérifier existence avec `glob_file_search` ou `grep`
  - Vérifier chemins corrects (ex: `core/llm/` vs `services/llm/`)
  - Si existe : **DÉCISION** - Étendre ou remplacer ? (documenter dans story)
2. **Composants/Services similaires :**
  - Rechercher composants React similaires (`codebase_search` dans `frontend/src/components/`)
  - Rechercher stores Zustand similaires (`codebase_search` dans `frontend/src/store/`)
  - Rechercher services Python similaires (`codebase_search` dans `services/`, `core/`)
  - Si similaire existe : **DÉCISION** - Réutiliser ou créer nouveau ? (documenter dans story)
3. **Endpoints API :**
  - Vérifier namespace cohérent (`/api/v1/dialogues/`* vs autres)
  - Vérifier si endpoint similaire existe (`grep` dans `api/routers/`)
  - Si endpoint similaire : **DÉCISION** - Étendre ou créer nouveau ? (documenter dans story)
4. **Patterns existants :**
  - Vérifier patterns Zustand (immutable updates, structure stores)
  - Vérifier patterns FastAPI (routers, dependencies, schemas)
  - Vérifier patterns React (composants, hooks, modals)
  - Respecter conventions de nommage et structure dossiers
5. **Documentation des décisions :**
  - Si remplacement : Documenter **POURQUOI** dans story "Dev Notes"
  - Si extension : Documenter **COMMENT** (quels champs/méthodes ajouter)
  - Si nouveau : Documenter **POURQUOI** pas de réutilisation

---

### Story 5.1: Exporter dialogue single vers format Unity JSON (FR49)

As a **utilisateur créant des dialogues**,
I want **exporter un dialogue unique vers le format Unity JSON**,
So that **je peux intégrer le dialogue dans Unity sans erreurs de format**.

**Acceptance Criteria:**

**Given** j'ai un dialogue complet avec nœuds et connexions
**When** je clique sur "Exporter vers Unity"
**Then** le dialogue est converti au format Unity JSON strict
**And** la validation schéma Unity est automatiquement exécutée avant export (voir Story 4.13)
**And** l'export se termine en <200ms (NFR-P3)

**Given** la validation schéma échoue (erreurs détectées)
**When** je tente d'exporter
**Then** l'export est bloqué avec message "Erreurs de validation détectées - corriger avant export"
**And** la liste des erreurs est affichée avec navigation vers nœuds concernés
**And** je peux corriger les erreurs et réessayer l'export

**Given** la validation schéma réussit (100% conforme)
**When** l'export est lancé
**Then** le fichier JSON Unity est généré avec nom basé sur le titre du dialogue (slug)
**And** le fichier est sauvegardé dans le répertoire Unity configuré (voir Story 5.2)
**And** un message de succès s'affiche "Dialogue exporté : [filename].json"

**Given** je configure le chemin Unity dans les paramètres
**When** le chemin est configuré
**Then** le chemin est sauvegardé et utilisé pour tous les exports
**And** le répertoire est créé automatiquement s'il n'existe pas

**Given** un dialogue contient des flags (bool/compteur/enum), conditions de réputation ou tests de caractéristiques (voir Epic 9 + GDD Alteir)
**When** l'export est lancé
**Then** chaque nœud inclut ses `conditions[]` et `actions[]` sérialisés selon le type GDD (bool, compteur, enum, reputation, skill_check)
**And** les agrégats de réputation sont exportés en valeur entière (le tier dynamique n'est jamais stocké dans le JSON Unity)
**And** les nœuds cut-scene (`nodeType: "cutscene"`) et exploration de souvenir (`nodeType: "memory_exploration"`) sont exportés avec leur structure spécifique

**Technical Requirements:**

- Backend : Endpoint `/api/v1/dialogues/unity/export` (POST) avec conversion graphe → Unity JSON (existant)
- Service : `GraphConversionService.graph_to_unity_json()` (existant) convertit ReactFlow → Unity
- Validation : Intégration avec Story 4.13 (validation schéma) avant export
- Format : JSON Unity strict — tableau de `UnityDialogueNode` avec `conditions[]`, `actions[]`, `choices[]`, `nodeType`, `skillCheckConfig` optionnel
- Sérialisation flags : 3 types GDD (bool/compteur/enum) sérialisés avec opérateurs distincts (voir section GDD ci-dessus)
- Réputation : Valeur agrégée entière uniquement (tier dynamique jamais stocké)
- Nœuds spéciaux : `nodeType` "cutscene" / "memory_exploration" exportés avec structure dédiée
- Warnings export : Seuils GDD dépassés (~1000 nœuds, ~10 flags/PNJ, ~3 compteurs/PNJ) → warnings non-bloquants dans logs
- Frontend : Bouton "Exporter vers Unity" dans `GraphEditor.tsx` avec confirmation
- Stockage : Fichier JSON sauvegardé dans répertoire Unity configuré (`unity_dialogues_path`)
- Tests : Unit (conversion format incluant flags/réputation/skill_check), Integration (API export), E2E (workflow export complet)

**References:** FR49 (export single dialogue), Story 4.13 (validation schéma), NFR-I1 (Unity Export 100% valid), NFR-P3 (API Response <200ms)

---

### Story 5.2: Exporter batch plusieurs dialogues vers Unity JSON (FR50)

As a **utilisateur gérant plusieurs dialogues**,
I want **exporter plusieurs dialogues en batch vers Unity JSON**,
So that **je peux intégrer toute ma bibliothèque de dialogues en une seule opération**.

**Acceptance Criteria:**

**Given** j'ai plusieurs dialogues dans le système
**When** je sélectionne plusieurs dialogues (checkboxes) et clique sur "Exporter batch"
**Then** tous les dialogues sélectionnés sont exportés vers Unity JSON
**And** un indicateur de progression s'affiche "Export batch : 3/10 dialogues"
**And** chaque dialogue est validé avant export (validation schéma)

**Given** un dialogue du batch échoue la validation
**When** l'export batch est lancé
**Then** les dialogues valides sont exportés normalement
**And** les dialogues invalides sont listés avec erreurs "X dialogues non exportés : [liste]"
**And** je peux corriger les erreurs et réexporter uniquement les dialogues échoués

**Given** l'export batch réussit
**When** tous les dialogues sont exportés
**Then** un résumé s'affiche "Export batch terminé : X dialogues exportés, Y échecs"
**And** tous les fichiers JSON sont sauvegardés dans le répertoire Unity
**And** un log d'export est généré (voir Story 5.6)

**Given** je configure les options d'export batch
**When** j'ouvre "Options export batch"
**Then** je peux choisir : validation avant export (on/off), format nom fichiers, répertoire destination
**And** les options sont sauvegardées pour prochains exports

**Given** l'export batch est en cours
**When** je lance l'export batch
**Then** je peux interrompre l'export batch (bouton "Arrêter")
**And** les dialogues déjà exportés restent sauvegardés (pas de rollback)

**Technical Requirements:**

- Backend : Endpoint `/api/v1/dialogues/batch-export` (POST) avec liste dialogue IDs
- Service : `BatchExportService` avec boucle export + gestion erreurs individuelles
- Validation : Validation schéma pour chaque dialogue avant export (optionnel selon config)
- Progression : SSE ou polling pour mise à jour progression frontend
- Frontend : Composant `BatchExportPanel.tsx` avec sélection dialogues + options + progression
- Logs : Génération log export batch avec résultats (voir Story 5.6)
- Tests : Unit (batch export logic), Integration (API batch export), E2E (workflow batch)

**References:** FR50 (batch export), Story 5.1 (export single), Story 4.13 (validation schéma), Story 5.6 (export logs)

---

### Story 5.3: Valider JSON exporté contre schéma Unity custom (FR51)

As a **utilisateur exportant des dialogues**,
I want **valider le JSON exporté contre le schéma Unity custom**,
So that **je peux garantir 100% de conformité avant intégration Unity**.

**Acceptance Criteria:**

**Given** un dialogue est prêt à exporter
**When** la validation schéma est lancée (automatique avant export)
**Then** le JSON Unity est validé contre le schéma Unity strict (Pydantic models ou JSON Schema)
**And** toutes les erreurs de conformité sont détectées (champs manquants, types incorrects, valeurs invalides)

**Given** le JSON contient un champ invalide (ex: type incorrect, tier de réputation stocké en flag, type de flag non reconnu)
**When** la validation est lancée
**Then** une erreur s'affiche "Erreur schéma Unity : champ 'X' a type incorrect (attendu Y, reçu Z)"
**And** le nœud concerné est identifié
**And** je peux corriger l'erreur avant export

**Given** le JSON est conforme au schéma Unity
**When** la validation est lancée
**Then** un message de succès s'affiche "Validation schéma Unity : 100% conforme"
**And** l'export peut être lancé sans risque d'erreur

**Given** plusieurs erreurs de schéma sont détectées
**When** la validation est lancée
**Then** toutes les erreurs sont listées avec : champ concerné, erreur, nœud concerné
**And** un résumé s'affiche "X erreurs de schéma détectées"
**And** je peux corriger toutes les erreurs en une session

**Given** je consulte le schéma Unity de référence
**When** j'ouvre "Schéma Unity de référence"
**Then** le schéma complet s'affiche avec : champs requis, types, valeurs autorisées, exemples
**And** je peux comparer mon JSON avec le schéma pour comprendre les erreurs

**Technical Requirements:**

- Backend : Service `UnitySchemaValidator.validate_unity_json()` (existant) avec validation stricte
- Schéma : Modèles Pydantic `UnityDialogueNode` couvrant : `conditions[]` (types bool/compteur/enum/reputation/skill_check), `actions[]` (types correspondants), `nodeType` (enum: dialogue/cutscene/memory_exploration), `skillCheckConfig` optionnel (characteristic parmi les 8 GDD, DD entier, successNodeId, failNodeId)
- Règle réputation : Validation que les tiers dynamiques ne sont pas stockés comme flag (erreur bloquante si violation)
- Validation seuils GDD : Warnings non-bloquants si >~~1000 nœuds ou >~~10 flags/PNJ ou >~3 compteurs/PNJ
- API : Endpoint `/api/v1/dialogues/{id}/validate-schema` (POST) retourne erreurs schéma (existant)
- Frontend : Composant `SchemaValidationPanel.tsx` affiche erreurs avec navigation nœuds + schéma référence
- Auto-validation : Intégration avec Story 5.1 (export) pour validation automatique avant export
- Tests : Unit (validation schéma incluant types GDD), Integration (API validation), E2E (workflow validation + export)

**References:** FR51 (validation schéma Unity), Story 4.13 (validation schéma), Story 5.1 (export), NFR-I1 (Unity Export 100% valid)

---

### Story 5.4: Télécharger fichiers JSON exportés (FR52)

As a **utilisateur exportant des dialogues**,
I want **télécharger les fichiers JSON exportés**,
So that **je peux transférer les dialogues vers Unity ou les archiver**.

**Acceptance Criteria:**

**Given** un dialogue a été exporté vers Unity JSON
**When** l'export est terminé
**Then** un bouton "Télécharger" s'affiche avec le nom du fichier
**And** je peux cliquer pour télécharger le fichier JSON

**Given** je télécharge un fichier JSON exporté
**When** je clique sur "Télécharger"
**Then** le fichier JSON est téléchargé avec nom "[dialogue-title].json"
**And** le fichier contient le JSON Unity formaté (indenté, UTF-8)
**And** le téléchargement se fait sans erreur

**Given** j'ai exporté plusieurs dialogues en batch
**When** l'export batch est terminé
**Then** un bouton "Télécharger tous" s'affiche
**And** je peux télécharger tous les fichiers JSON en une archive ZIP
**And** l'archive contient tous les fichiers avec noms organisés

**Given** je configure les options de téléchargement
**When** j'ouvre "Options téléchargement"
**Then** je peux choisir : format (JSON individuel ou ZIP), nom fichiers, compression
**And** les options sont sauvegardées pour prochains téléchargements

**Given** un fichier JSON est très volumineux (>10MB)
**When** je télécharge le fichier
**Then** un indicateur de progression s'affiche "Téléchargement en cours..."
**And** le téléchargement se fait sans timeout (gestion fichiers volumineux)

**Technical Requirements:**

- Backend : Endpoint `/api/v1/dialogues/{id}/download` (GET) retourne fichier JSON avec headers download
- Batch : Endpoint `/api/v1/dialogues/batch-download` (POST) retourne archive ZIP avec tous les fichiers
- Frontend : Fonction `downloadJSON(filename, content)` avec création blob + trigger download
- ZIP : Bibliothèque JSZip pour création archive ZIP côté frontend (ou backend si préféré)
- Headers : `Content-Disposition: attachment; filename="..."` pour forcer téléchargement
- Tests : Unit (download logic), Integration (API download), E2E (workflow download)

**References:** FR52 (télécharger fichiers), Story 5.1 (export single), Story 5.2 (batch export)

---

### Story 5.5: Prévisualiser export avant téléchargement (structure JSON, taille) (FR53)

As a **utilisateur exportant des dialogues**,
I want **prévisualiser l'export avant téléchargement (structure JSON, taille)**,
So that **je peux vérifier le contenu et la taille avant de télécharger**.

**Acceptance Criteria:**

**Given** un dialogue est prêt à exporter
**When** je clique sur "Prévisualiser export"
**Then** un modal s'affiche avec : structure JSON (aperçu formaté), taille fichier estimée, nombre nœuds
**And** je peux voir les premiers nœuds du JSON (expand/collapse sections)

**Given** je consulte la prévisualisation
**When** le modal s'affiche
**Then** la structure JSON est formatée avec syntaxe highlight (code block coloré)
**And** je peux naviguer dans la structure (scroll, expand/collapse)
**And** je peux copier le JSON (bouton "Copier")

**Given** la taille du fichier est estimée
**When** la prévisualisation s'affiche
**Then** la taille estimée s'affiche (ex: "~45 KB")
**And** un warning s'affiche si taille >10MB "Fichier volumineux - téléchargement peut être lent"

**Given** je prévisualise un export batch
**When** la prévisualisation s'affiche
**Then** un résumé s'affiche : nombre dialogues, taille totale estimée, structure globale
**And** je peux voir la structure de chaque dialogue (expand/collapse par dialogue)

**Given** je valide la prévisualisation
**When** je clique sur "Exporter" depuis la prévisualisation
**Then** l'export est lancé directement (pas besoin de fermer modal)
**And** le modal se ferme après export réussi

**Technical Requirements:**

- Backend : Endpoint `/api/v1/dialogues/{id}/preview-export` (GET) retourne JSON + métadonnées (taille, nœuds)
- Format : JSON formaté avec indent 2 espaces pour prévisualisation
- Taille : Calcul taille fichier estimée (JSON stringifié) avant export réel
- Frontend : Composant `ExportPreviewModal.tsx` avec syntaxe highlight (react-syntax-highlighter) + métadonnées
- Navigation : Expand/collapse sections JSON pour navigation dans structure
- Tests : Unit (prévisualisation logique), Integration (API preview), E2E (workflow preview + export)

**References:** FR53 (preview export), Story 5.1 (export), Story 5.4 (télécharger)

---

### Story 5.6: Générer logs export avec métadonnées (date génération, coût, statut validation) (FR54)

As a **utilisateur exportant des dialogues**,
I want **voir les logs d'export avec métadonnées (date génération, coût, statut validation)**,
So that **je peux tracer l'historique des exports et identifier les problèmes**.

**Acceptance Criteria:**

**Given** un dialogue est exporté vers Unity
**When** l'export est terminé
**Then** un log d'export est généré avec : timestamp export, dialogue ID, nom fichier, statut validation, coût génération (si applicable)
**And** le log est sauvegardé dans `data/logs/exports/`

**Given** je consulte les logs d'export
**When** j'ouvre "Logs d'export"
**Then** une liste chronologique de tous les exports s'affiche (plus récent → plus ancien)
**And** chaque entrée affiche : date, dialogue, fichier, statut (succès/échec), taille fichier

**Given** je consulte les détails d'un log d'export
**When** je clique sur une entrée de log
**Then** les métadonnées détaillées s'affichent : timestamp, dialogue ID, coût génération, validation status, erreurs (si échec)
**And** je peux voir le JSON exporté (lien vers fichier ou preview)

**Given** je filtre les logs par période (aujourd'hui, cette semaine, ce mois)
**When** je sélectionne une période
**Then** seuls les logs de cette période sont affichés
**And** un résumé s'affiche "X exports, Y succès, Z échecs"

**Given** je filtre les logs par statut (succès vs échec)
**When** je sélectionne un statut
**Then** seuls les logs de ce statut sont affichés
**And** je peux identifier les patterns d'échec (ex: mêmes erreurs récurrentes)

**Given** j'exporte les logs d'export
**When** je clique sur "Exporter logs" (CSV ou JSON)
**Then** un fichier est téléchargé avec tous les logs (format structuré)
**And** les logs incluent : timestamp, dialogue, fichier, statut, coût, validation, erreurs

**Technical Requirements:**

- Backend : Service `ExportLogService` avec méthode `log_export(dialogue_id, filename, metadata)` pour stockage logs
- Stockage : Fichiers JSON `data/logs/exports/YYYY-MM-DD.json` avec logs journaliers
- Métadonnées : Timestamp, dialogue_id, filename, validation_status, cost, errors, file_size, warnings_gdd (seuils maintenabilité dépassés : nœuds/flags/compteurs)
- API : Endpoint `/api/v1/exports/logs` (GET) avec filtres période/statut retourne logs
- Frontend : Composant `ExportLogsPanel.tsx` avec liste chronologique + filtres + export
- Format : Logs formatés avec timestamps lisibles, statuts colorés (vert=succès, rouge=échec)
- Export : Fonction export CSV/JSON côté frontend (download blob)
- Tests : Unit (logging logique), Integration (API logs), E2E (affichage + export logs)

**References:** FR54 (export logs), Story 5.1 (export), Story 1.15 (generation logs), Story 4.13 (validation schéma)

---

