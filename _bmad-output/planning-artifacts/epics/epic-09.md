## Epic 9: Variables et intégration systèmes de jeu

Les utilisateurs peuvent définir des variables et flags dans les dialogues pour créer des branches conditionnelles dynamiques. Le système permet conditions de visibilité, effets déclenchés par choix joueur, preview de scénarios, validation références, et intégration stats de jeu (V3.0+).

**FRs covered:** FR89-94 (variables/flags, conditions, effets, preview, validation, intégration stats)

**NFRs covered:** NFR-P3 (API Response <200ms), NFR-I3 (Game System Integration V3.0+)

**Valeur utilisateur:** Créer des dialogues réactifs qui s'adaptent aux choix et état du joueur, permettant des expériences narratives dynamiques et personnalisées.

**Dépendances:** Epic 1 (dialogues), Epic 2 (éditeur graphe), Epic 4 (validation)

---

## 📖 Contexte GDD Alteir (source Notion — à jour au 17/04/2026)

> Référence complète de tous les systèmes de jeu : `[gdd-systems-reference.md](../gdd-systems-reference.md)`

> **Obligatoire** : toute story de cet epic doit respecter ces contraintes extraites du GDD de référence.

### Catalogue de flags (DB Notion `Flags`)

- **343 flags** définis dans la base Notion `Flags` (ID unique FLAG001–FLAG389, 283 `Défini`, 29 `À définir`).
- **3 types de valeur** (champ `Type de valeur`) :
  - `bool` — 22 flags · Valeurs : `true` / `false` · ex: `Flag_perso_raki_recrutement`, `Flag_tutoriel_complete`
  - `compteur` — 30 flags · Champs `Min` et `Max` (ex: Min=0, Max=4) · ex: `Flag_lieu_miroirs_forcage_compteur [0–4]`, `Flag_perso_ensevelie_echanges [0–4]`
  - `enum` — 270 flags · Valeurs prédéfinies ordonnées dans la table `Valeurs de Flag` (chaque valeur a un `Ordre` et un flag `Par défaut`) · ex: `INTACT (défaut, ordre 0) → CONSULTE_SURFACE (ordre 2) → IMMERSION_PROFONDE (ordre 3)`
- **Convention de nommage** : `Flag_[portée]_[entité]_[description]` (ex: `Flag_perso_akthar_neth_confiance`, `Flag_lieu_nexus_decouverte`, `Flag_faction_rep_synaptic_prestige_max`)
- **Portées** (champ `Portée`) : `Personnage` (185), `Lieu` (74), `Faction` (33), `Système` (14), `Quête` (13), `Objet` (9)
- **Relations** : chaque flag liste ses `Systèmes consommateurs` et `Systèmes producteurs` (relations vers les fiches système)
- **Valeurs de Flag** (table liée) : 616 valeurs · chaque entrée a `Nom`, `Ordre`, `Par défaut (oui/non)`, `Description narrative`, `Flag parent`

### Système Dialogues (GDD validé)

Extrait de la fiche système **Dialogues** (Notion page `2ef6e4d2`) :

- Chaque nœud contient : ID unique, texte (≤ 300 mots), locuteur, 2–10 choix, **conditions** (flags, compteurs, stats), **actions** (modifier flags/compteurs/relations), nœud suivant
- **Repères de design** (non hardcodés — alertes uniquement) : au-delà de ~1 000 nœuds/arbre, ~10 flags conversationnels/PNJ ou ~3 compteurs/PNJ, la maintenabilité humaine dégrade. Ces seuils servent d'alertes UX, pas de blocages.
- **Options grisées** = verrouillées par conditions narratives (flag manquant, réputation insuffisante, progression) — distincts des tests de caractéristiques qui restent toujours tentables
- **Tests de caractéristiques** : `[Sociabilité + Tromperie vs DD 7]` — Score personnage ≥ seuil (5–150) → succès ; séparés des conditions de flag
- **Formule flag concret** : `voknir_demande_aide = true` (flag bool posé après sélection d'un choix)
- **Tooltip condition** : `« Requiert : Réputation Prestige ≥ 30 (actuel : 15) »`
- **Intégrations** : consomme Caractéristiques & Compétences (Score social), Gestion de l'Effort (1–3 pts), Réputation (niveaux Admiration/Prestige/Crainte) ; produit vers Réputation, Quêtes, Progression, Recrutement

### Système Réputation (GDD validé — pour Story 9.6)

- **3 axes indépendants** : Admiration (cœur/affection), Prestige (hiérarchie sociale), Crainte
- **Modèle de stockage** : jauges par héroïne possédée × PNJ × axe ; la réputation communautaire est une résultante calculée par agrégat pondéré des PNJ membres (`Croupion ×1`, `Membre ×2`, `Notable ×3`, `Chef ×5`).
- **Paliers complets** : Hostilité, Rejet, Méfiance, Distance, Neutre, Sympathie, Faveur, Dévotion, Icône — calculés depuis la valeur numérique, jamais persistés comme état courant.
- **Flags one-way produits** : `Palier max historique` (Enum, portée Faction — ne peut pas redescendre) + `Titre officiel` (Enum, portée Faction — décerné par moment narratif, pas par accumulation).
- **Sous-systèmes enfants** : `Paliers de Réputation` (seuils et maintien) + `Titres de faction` (statuts narratifs persistants).

### Système Core (no-dice, GDD validé)

- 8 caractéristiques : Puissance, Agilité, Perception, Intelligence, Créativité, Sociabilité, Technique, Volonté
- Pool Effort : 10 pts · dépense pour forcer réussite · échec critique volontaire = +5 pts
- Succès critique : Score dépasse DD de ≥ 5 · Échec critique : Score inférieur DD de ≥ 5

---

## ⚠️ GARDE-FOUS - Vérification de l'Existant (Scrum Master)

**OBLIGATOIRE avant création de chaque story de cet epic :**

### Checklist de Vérification

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

### Story 9.1: Définir variables et flags dans dialogues (V1.0+) (FR89)

As a **utilisateur créant des dialogues**,
I want **définir des variables et flags dans mes dialogues**,
So that **je peux créer des branches conditionnelles qui réagissent à l'état du jeu et aux choix du joueur**.

> **Contraintes GDD** : 3 types de flags (`bool`, `compteur` avec Min/Max, `enum` avec valeurs prédéfinies ordonnées). Pas de type `string` libre — les textes dynamiques passent par des flags `enum`. Convention de nommage : `Flag_[portée]_[entité]_[description]`. Les seuils GDD (~10 flags conversationnels, ~3 compteurs/PNJ) sont des repères de maintenabilité — à signaler par alerte, jamais à bloquer.

**Acceptance Criteria:**

**Given** j'ai un dialogue ouvert dans l'éditeur
**When** j'ouvre "Variables et flags" dans le panneau de configuration
**Then** je peux voir la liste des flags disponibles depuis le catalogue Notion (343 flags, `InGameFlagsModal` existant)
**And** je peux filtrer par type (`bool`, `compteur`, `enum`) et par portée (`Personnage`, `Lieu`, `Faction`, `Système`, `Quête`, `Objet`)
**And** les flags sélectionnés sont associés au dialogue

**Given** je sélectionne un flag `bool` (ex: `Flag_perso_voknir_rencontre_initiale`)
**When** le flag est sélectionné
**Then** le flag apparaît dans la liste "Flags utilisés dans ce dialogue"
**And** je peux définir sa valeur initiale (`true` / `false`)
**And** le flag est sauvegardé avec le dialogue

**Given** je sélectionne un flag `compteur` (ex: `Flag_lieu_miroirs_forcage_compteur [Min:0, Max:4]`)
**When** le flag est sélectionné
**Then** je peux voir les bornes Min/Max issues du catalogue (lecture seule — définies dans le GDD)
**And** je peux définir la valeur initiale dans les bornes
**And** le flag et sa valeur initiale sont sauvegardés avec le dialogue

**Given** je sélectionne un flag `enum` (ex: `Flag_lieu_nexus_decouverte` avec valeurs `INCONNU → REPERE → VISITE → EXPLORE`)
**When** le flag est sélectionné
**Then** je vois la liste des valeurs ordonnées avec leur valeur par défaut mise en évidence (ex: `INCONNU (défaut)`)
**And** je peux choisir la valeur initiale parmi les valeurs prédéfinies
**And** le flag est sauvegardé avec le dialogue

**Given** je définis plusieurs flags pour un dialogue
**When** je sauvegarde le dialogue
**Then** tous les flags sont persistés dans les métadonnées du dialogue
**And** une alerte non-bloquante s'affiche si le nombre de compteurs dépasse ~3 ou les flags conversationnels ~10 (repères de maintenabilité GDD — le dialogue reste sauvegardable)
**And** les flags sont disponibles pour conditions et effets (voir Stories 9.2-9.3)

**Given** je consulte un dialogue existant
**When** j'ouvre "Variables et flags"
**Then** les flags déjà définis sont affichés avec type, portée, et valeur initiale
**And** je peux modifier la valeur initiale ou supprimer des flags

**Technical Requirements:**

- Backend : Endpoint `/api/v1/dialogues/{id}/flags` (GET liste, POST ajouter, PUT modifier, DELETE supprimer)
- Service : `DialogueFlagsService` avec méthodes CRUD flags pour dialogues
- Catalogue : Réutiliser `FlagCatalogService` (existant) — source de vérité : DB Notion `Flags` (343 entrées, ID FLAG001–FLAG389)
- Types supportés : `bool`, `compteur` (avec `min`/`max` issus du catalogue), `enum` (valeurs depuis table `Valeurs de Flag` ordonnées par `Ordre`)
- Alerte UX non-bloquante : si le dialogue dépasse ~10 flags conversationnels ou ~3 compteurs, afficher un avertissement de maintenabilité (ne pas bloquer la sauvegarde)
- Base de données : JSON dans métadonnées dialogue (`dialogue_flags: [{flag_id, initial_value, type}]`)
- Frontend : Composant `DialogueFlagsPanel.tsx` avec intégration `InGameFlagsModal` (existant) pour sélection flags ; affichage groupé par type
- Tests : Unit (gestion flags, validation limites), Integration (API flags), E2E (workflow flags)

**References:** FR89 (variables/flags V1.0+), Story 9.2 (conditions), Story 9.3 (effets), Epic 1 (dialogues), [GDD Dialogues système — repères de maintenabilité: ~~10 flags/~~3 compteurs par PNJ, alertes non-bloquantes]

---

### Story 9.2: Définir conditions de visibilité sur nœuds (si variable X = Y, afficher nœud) (FR90)

As a **utilisateur créant des dialogues**,
I want **définir des conditions de visibilité sur les nœuds (si variable X = Y, afficher nœud)**,
So that **je peux créer des branches de dialogue qui ne s'affichent que si certaines conditions sont remplies**.

> **Contraintes GDD** : 3 catégories de conditions dans le système Dialogues d'Alteir : (1) conditions sur **flags** (bool/compteur/enum), (2) conditions sur **Réputation** (Prestige/Admiration/Crainte par faction avec seuil numérique), (3) **tests de caractéristiques** (`[Sociabilité + Tromperie vs DD 7]`) — les tests ne grisent pas l'option, ils ont une issue succès/échec. Seules les conditions (1) et (2) grisent ou masquent des options. L'UI affiche un tooltip formaté : `« Requiert : Réputation Prestige ≥ 30 (actuel : 15) »`.

**Acceptance Criteria:**

**Given** j'ai un nœud dans le graphe
**When** je sélectionne le nœud et ouvre "Conditions"
**Then** un panneau s'affiche permettant d'ajouter des conditions par type : Flag / Réputation

**Given** j'ajoute une condition sur un flag `bool` (ex: `Flag_perso_voknir_rencontre_initiale = true`)
**When** la condition est sauvegardée
**Then** le nœud n'est visible que si le flag a la valeur attendue
**And** la condition est affichée visuellement sur le nœud (badge "Condition: Flag_perso_voknir...")

**Given** j'ajoute une condition sur un flag `compteur` (ex: `Flag_lieu_miroirs_forcage_compteur >= 2`)
**When** la condition est sauvegardée
**Then** le nœud n'est visible que si le compteur atteint le seuil
**And** les opérateurs disponibles sont : `=`, `!=`, `>=`, `<=`, `>`, `<`

**Given** j'ajoute une condition sur un flag `enum` (ex: `Flag_lieu_nexus_decouverte = VISITE`)
**When** la condition est sauvegardée
**Then** le nœud n'est visible que si le flag a exactement la valeur enum sélectionnée
**And** le sélecteur affiche les valeurs enum dans leur ordre défini (depuis le catalogue)

**Given** j'ajoute une condition sur la Réputation d'une faction (ex: `Réputation Prestige [Culte de l'Anentropie] ≥ 30`)
**When** la condition est sauvegardée
**Then** le nœud n'est visible que si ce seuil de réputation est atteint
**And** le tooltip en jeu affiche le format standard : `« Requiert : Réputation Prestige ≥ 30 (actuel : X) »`

**Given** je définis plusieurs conditions sur un même nœud
**When** je les combine
**Then** je peux choisir l'opérateur logique AND ou OR entre conditions
**And** la combinaison est affichée lisiblement sur le nœud

**Given** un nœud a une condition non remplie dans le preview (voir Story 9.4)
**When** le preview est actif
**Then** le nœud est grisé avec indication de la condition non remplie (ex: `Flag_perso_voknir_rencontre_initiale = false`)

**Given** je consulte un dialogue avec conditions
**When** j'ouvre le graphe
**Then** les nœuds avec conditions sont marqués visuellement (icône condition, couleur différente)
**And** je peux survoler pour voir le détail complet de la condition

**Technical Requirements:**

- Backend : Champ `condition` dans `UnityDialogueNode` (existant) pour conditions nœuds ; champ `condition` dans `UnityDialogueChoice` (existant) pour conditions choix
- Service : `ConditionParserService` — grammaire : `{FLAG_ID} {op} {valeur}` (bool: `= true/false` ; compteur: `>= N` ; enum: `= VALEUR_ENUM`) + conditions Réputation : `reputation.{axe}.{faction_id} {op} {seuil}`
- Frontend : Composant `ConditionEditor.tsx` — sélecteur flag depuis catalogue (auto-complete), sélecteur valeur typé (bool toggle / compteur slider / enum dropdown), sélecteur Réputation par axe et faction
- Validation : Vérifier références flags existent dans catalogue (voir Story 9.5)
- Preview : Intégration avec preview scénarios (voir Story 9.4) pour tester conditions
- Tests : Unit (parsing conditions, chaque type), Integration (API conditions), E2E (workflow conditions)

**References:** FR90 (conditions visibilité), Story 9.1 (variables/flags), Story 9.4 (preview), Story 9.5 (validation), Epic 2 (éditeur graphe), [GDD Dialogues système — options grisées, tooltip Réputation]

---

### Story 9.3: Définir effets déclenchés par choix joueur (set variable, unlock flag) (FR91)

As a **utilisateur créant des dialogues**,
I want **définir des effets déclenchés quand le joueur sélectionne un choix**,
So that **je peux modifier l'état du jeu (variables, flags) en fonction des choix du joueur**.

> **Contraintes GDD** : les effets du système Dialogues d'Alteir produisent vers Réputation (axes `Admiration`, `Prestige`, `Crainte` — impacts typiques mineur `1-3`, majeur `4-9`, critique `10+`), Quêtes (flags de déclenchement/complétion), Progression (XP narrative), Recrutement (état "allié recruté"). Les effets sur compteur sont bornés (Min/Max définis dans le catalogue). Les flags `enum` progressent vers une valeur cible — pas d'opérateur arithmétique sur enum. `Respect` relève du système séparé `Influence & Respect (PJ possédés)`.

**Acceptance Criteria:**

**Given** j'ai un choix joueur dans un nœud
**When** je sélectionne le choix et ouvre "Effets"
**Then** un panneau s'affiche avec liste "Effets déclenchés"
**And** je peux ajouter des effets par catégorie : "Modifier flag" / "Modifier Réputation"

**Given** j'ajoute un effet sur un flag `bool` (ex: `Flag_perso_voknir_rencontre_initiale = true`)
**When** l'effet est sauvegardé
**Then** quand le joueur sélectionne ce choix, le flag booléen est positionné à la valeur définie
**And** l'effet est affiché sur le choix (ex: `[→ Flag_perso_voknir_rencontre_initiale = true]`)

**Given** j'ajoute un effet sur un flag `compteur` (ex: `Flag_lieu_miroirs_forcage_compteur += 1`)
**When** l'effet est sauvegardé
**Then** quand le joueur sélectionne ce choix, le compteur est incrémenté de 1 (clamped entre Min et Max)
**And** les opérateurs disponibles pour compteur sont : `= N`, `+= N`, `-= N` (N entier)

**Given** j'ajoute un effet sur un flag `enum` (ex: `Flag_lieu_nexus_decouverte → VISITE`)
**When** l'effet est sauvegardé
**Then** quand le joueur sélectionne ce choix, le flag enum prend la valeur cible sélectionnée
**And** le sélecteur affiche uniquement les valeurs valides dans leur ordre défini (depuis le catalogue)

**Given** j'ajoute un effet sur la Réputation (ex: `Réputation Prestige [Culte de l'Anentropie] += 10`)
**When** l'effet est sauvegardé
**Then** cet effet est enregistré comme modification de réputation (distinct d'un flag — géré par le Système Réputation)
**And** les valeurs d'impact respectent les repères GDD : mineur `1-3`, majeur `4-9`, critique `10+`, sur un axe `Admiration`, `Prestige` ou `Crainte`

**Given** je définis plusieurs effets sur un même choix
**When** le choix est sélectionné dans le preview
**Then** tous les effets sont exécutés dans l'ordre défini
**And** un résumé s'affiche : `Effets appliqués: Flag_perso_voknir... = true, Prestige Culte +10`

**Given** je consulte un dialogue avec effets
**When** j'ouvre le graphe
**Then** les choix avec effets sont marqués visuellement (icône effet, couleur différente)
**And** je peux survoler pour voir le résumé de tous les effets du choix

**Technical Requirements:**

- Backend : Champ `consequences` dans `UnityDialogueNode` (existant) ; champ `actions` dans `UnityDialogueChoice` (existant partiellement)
- Service : `EffectParserService` — grammaire par type : bool (`{FLAG_ID} = true/false`), compteur (`{FLAG_ID} += N | -= N | = N`), enum (`{FLAG_ID} -> {ENUM_VALUE}`), réputation (`reputation.{axe}.{faction_id} += N`)
- Validation : bornes Min/Max respectées pour compteurs (issues du catalogue) ; valeurs enum valides uniquement
- Frontend : Composant `EffectEditor.tsx` avec liste effets ordonnée + ajout/suppression/réorganisation (drag) ; sélecteur d'opérateur typé selon le type de flag
- Preview : Intégration avec preview scénarios (voir Story 9.4) pour simuler effets et voir état flags mis à jour
- Tests : Unit (parsing effets, validation bornes), Integration (API effets), E2E (workflow effets)

**References:** FR91 (effets choix joueur), Story 9.1 (variables/flags), Story 9.4 (preview), Epic 1 (génération dialogues), [GDD Dialogues système — production vers Réputation/Quêtes/Progression/Recrutement]

---

### Story 9.4: Preview scénarios avec différents états de variables (FR92)

As a **utilisateur créant des dialogues**,
I want **preview des scénarios avec différents états de variables**,
So that **je peux tester comment le dialogue se comporte selon les valeurs des flags et variables**.

**Acceptance Criteria:**

**Given** j'ai un dialogue avec conditions et effets sur les flags
**When** j'ouvre "Preview scénario"
**Then** un panneau s'affiche avec liste des flags du dialogue
**And** je peux définir les valeurs initiales des flags pour le preview

**Given** je définis les valeurs des flags (ex: hasMetAkthar=true, reputationAkthar=50)
**When** je lance le preview
**Then** le graphe s'affiche avec les nœuds visibles selon les conditions
**And** les nœuds avec conditions non remplies sont grisés ou masqués
**And** un indicateur affiche "Preview mode - État: hasMetAkthar=true, reputationAkthar=50"

**Given** je navigue dans le preview en sélectionnant des choix
**When** je sélectionne un choix avec effets
**Then** les effets sont appliqués (flags mis à jour)
**And** les nœuds suivants sont mis à jour selon les nouvelles valeurs de flags
**And** un historique s'affiche "Effets appliqués: reputationAkthar += 10 (50 → 60)"

**Given** je change les valeurs initiales des flags dans le preview
**When** je modifie "reputationAkthar" de 50 à 30
**Then** le graphe se met à jour immédiatement
**And** les nœuds avec condition "reputationAkthar >= 50" deviennent invisibles

**Given** je compare deux scénarios
**When** j'ouvre "Comparer scénarios"
**Then** je peux définir deux états de flags différents (scénario A et B)
**And** les deux graphes sont affichés côte à côte
**And** les différences sont surlignées (nœuds visibles dans A mais pas B, etc.)

**Given** je preview un dialogue complexe avec plusieurs branches conditionnelles
**When** le preview est lancé
**Then** un rapport s'affiche "X nœuds accessibles, Y nœuds masqués par conditions"
**And** je peux voir quels nœuds sont inaccessibles et pourquoi (condition non remplie)

**Given** je quitte le preview
**When** je ferme le panneau preview
**Then** le graphe revient à l'état normal (tous nœuds visibles)
**And** les modifications de flags dans le preview ne sont pas sauvegardées

**Technical Requirements:**

- Backend : Endpoint `/api/v1/dialogues/{id}/preview` (POST) avec état flags initial retourne graphe avec visibilité nœuds
- Service : `DialoguePreviewService` avec méthode `preview_dialogue(dialogue_id, flag_states)` pour simulation
- Évaluation conditions : `ConditionEvaluatorService` pour évaluer conditions selon état flags
- Exécution effets : `EffectExecutionService` pour appliquer effets et mettre à jour état flags
- Frontend : Composant `DialoguePreviewPanel.tsx` avec sélecteur flags + graphe preview + historique effets
- Comparaison : Mode side-by-side pour comparer deux scénarios (optionnel, V1.5+)
- Performance : Preview <200ms pour dialogues <100 nœuds, <1s pour 500+ nœuds
- Tests : Unit (évaluation conditions), Integration (API preview), E2E (workflow preview)

**References:** FR92 (preview scénarios), Story 9.2 (conditions), Story 9.3 (effets), Story 9.1 (variables/flags), NFR-P3 (API Response <200ms)

---

### Story 9.5: Valider références variables (détecter variables non définies) (FR93)

As a **utilisateur créant des dialogues**,
I want **valider que toutes les références de variables dans les conditions et effets sont définies**,
So that **je peux détecter les erreurs avant export et éviter des bugs runtime dans Unity**.

**Acceptance Criteria:**

**Given** j'ai un dialogue avec conditions et effets utilisant des flags
**When** je lance une validation
**Then** toutes les références de flags dans conditions et effets sont vérifiées
**And** les flags non définis sont détectés et listés

**Given** un nœud a une condition "hasMetAkthar" mais le flag n'est pas défini dans le dialogue
**When** la validation est lancée
**Then** une erreur s'affiche "Nœud [stableID] : Condition référence flag non défini 'hasMetAkthar'"
**And** le nœud est surligné dans le graphe (couleur orange)
**And** je peux cliquer sur l'erreur pour éditer le nœud

**Given** un choix a un effet "reputationAkthar += 10" mais le flag n'est pas défini
**When** la validation est lancée
**Then** une erreur s'affiche "Choix [text] : Effet référence flag non défini 'reputationAkthar'"
**And** le choix est surligné dans le graphe

**Given** un flag est défini mais jamais utilisé (ni condition ni effet)
**When** la validation est lancée
**Then** un warning (non-bloquant) s'affiche "Flag 'unusedFlag' défini mais jamais utilisé"
**And** je peux décider de le supprimer ou le garder pour usage futur

**Given** un flag est référencé avec une typo (ex: "hasMetAkthar" vs "hasMetAkhtar")
**When** la validation est lancée
**Then** une erreur s'affiche "Flag 'hasMetAkhtar' non défini - suggestion: 'hasMetAkthar'?"
**And** je peux corriger automatiquement avec la suggestion

**Given** tous les flags référencés sont définis
**When** la validation est lancée
**Then** un message de succès s'affiche "Validation flags : 0 erreurs, X flags utilisés"
**And** la validation se termine en <200ms (NFR-P3)

**Given** je corrige une référence de flag invalide
**When** je modifie la condition/effet pour utiliser un flag valide
**Then** la validation est automatiquement relancée
**And** l'erreur disparaît si la référence est maintenant valide

**Technical Requirements:**

- Backend : Service `FlagValidationService` avec méthode `validate_flag_references(dialogue)` pour détection références invalides
- Parsing : Extraire toutes les références flags depuis conditions et effets (regex ou parser)
- Catalogue : Vérifier références contre flags définis dans dialogue + flags disponibles dans catalogue global
- Suggestions : Algorithme de distance (Levenshtein) pour suggestions typo
- API : Endpoint `/api/v1/dialogues/{id}/validate-flags` (POST) retourne erreurs références flags
- Frontend : Composant `FlagValidationPanel.tsx` affiche erreurs avec navigation vers nœuds/choix concernés
- Auto-fix : Option correction automatique pour suggestions typo (bouton "Corriger")
- Tests : Unit (détection références), Integration (API validation), E2E (workflow validation)

**References:** FR93 (validation références), Story 9.1 (variables/flags), Story 9.2 (conditions), Story 9.3 (effets), Epic 4 (validation), NFR-P3 (API Response <200ms)

---

### Story 9.6: Intégrer stats systèmes de jeu (caractéristiques, effort, réputation) (V3.0+) (FR94)

As a **utilisateur créant des dialogues**,
I want **référencer les caractéristiques, l'effort et la réputation réelle du jeu dans les conditions, tests et effets de dialogue**,
So that **les dialogues réagissent aux capacités du personnage possédé et à son état social calculé sans dupliquer les règles des systèmes de jeu**.

> **Contexte GDD / Notion (V3.0+)** : cette story connecte DialogueGenerator aux systèmes validés **Caractéristiques & Compétences**, **Gestion de l'Effort** et **Réputation**. La Réputation n'est pas une simple jauge par faction : elle est stockée **par héroïne possédée × PNJ × axe** (`Admiration`, `Prestige`, `Crainte`), puis la réputation communautaire est calculée par agrégat pondéré des PNJ membres (`Croupion ×1`, `Membre ×2`, `Notable ×3`, `Chef ×5`). Les sous-systèmes enfants de Réputation sont **Paliers de Réputation** et **Titres de faction**.
> **Garde-fous critiques** : le palier courant (`RepPalier`) est toujours calculé à la volée depuis la valeur numérique ; il n'est jamais stocké en flag. Les titres sont des événements narratifs persistés via flags one-way, distincts des paliers. `Influence & Respect (PJ possédés)` est un système séparé : ne pas mélanger ses jauges avec la Réputation faction/communauté.

**Acceptance Criteria:**

1. **Catalogue systèmes disponible**
  - **Given** le système d'intégration stats est disponible
  - **When** j'ouvre "Intégration systèmes de jeu"
  - **Then** le panneau affiche les familles utilisables dans les dialogues : Caractéristiques & Compétences, Gestion de l'Effort, Réputation
  - **And** l'état de connexion runtime Unity/API/fichier config est visible sans bloquer l'édition locale
2. **Caractéristiques et tests tentables**
  - **Given** je définis un test de caractéristique sur un choix (ex: `[Sociabilité + Tromperie vs DD 7]`)
  - **When** le choix est affiché en jeu ou en preview
  - **Then** le choix reste visible et tentable, avec le score et le DD lisibles
  - **And** l'issue `succès`, `succès_critique`, `échec` ou `échec_critique` détermine la branche suivante
  - **And** le test ne doit pas être traité comme une condition de visibilité qui masque l'option
3. **Effort intégré aux choix**
  - **Given** un choix peut consommer de l'Effort
  - **When** je configure un coût (ex: `Dépenser 2 PE`)
  - **Then** le choix est grisé si le pool disponible est insuffisant
  - **And** le pool par défaut utilisé en preview est `10 PE`, configurable pour refléter les variantes runtime
4. **Réputation : référence au modèle réel**
  - **Given** je configure une condition ou un effet de Réputation
  - **When** je sélectionne la cible
  - **Then** je choisis une héroïne possédée, une cible PNJ ou communauté, et un axe parmi `Admiration`, `Prestige`, `Crainte`
  - **And** l'UI indique clairement si la valeur utilisée est une jauge PNJ brute, une réputation PNJ finale ou une réputation communautaire calculée
  - **And** aucune donnée de Réputation n'est stockée dans `dialogueFlags`
5. **Conditions de réputation et paliers**
  - **Given** j'ajoute une condition de Réputation (ex: `Prestige Culte >= 30`)
  - **When** la condition est évaluée
  - **Then** elle utilise la valeur numérique appropriée et calcule le `RepPalier` à la volée si le design référence un palier
  - **And** les paliers disponibles sont complets : `Hostilité`, `Rejet`, `Méfiance`, `Distance`, `Neutre`, `Sympathie`, `Faveur`, `Dévotion`, `Icône`
  - **And** les seuils proviennent du sous-système **Paliers de Réputation** (`<= -100`, `-99..-60`, `-59..-30`, `-29..-10`, `-9..+9`, `+10..+29`, `+30..+59`, `+60..+99`, `>= +100`)
6. **Effets de réputation**
  - **Given** un choix modifie la Réputation
  - **When** je configure l'effet
  - **Then** l'effet cible un axe (`Admiration`, `Prestige`, `Crainte`) et une cible sociale explicite
  - **And** les valeurs d'impact suivent les repères Notion : mineur `1-3`, majeur `4-9`, critique `10+`
  - **And** la présence de témoins, la propagation alliés/rivaux et l'agrégat communautaire sont signalés comme responsabilité runtime Unity si DialogueGenerator ne possède pas ces données
7. **Titres de faction séparés des paliers**
  - **Given** une option de dialogue dépend d'un titre de faction
  - **When** je configure cette condition
  - **Then** elle référence un flag one-way de titre (`Flag_faction_titre_{faction}`) ou une valeur issue du catalogue Titres
  - **And** l'UI distingue explicitement "Titre acquis" de "Palier courant"
  - **And** aucun titre n'est accordé automatiquement par simple franchissement de jauge sans événement narratif
8. **Preview avec stats**
  - **Given** je preview un dialogue avec stats
  - **When** je lance la simulation
  - **Then** je peux définir des valeurs simulées pour caractéristiques, compétences, Effort, Réputation PNJ/communauté et titres
  - **And** le preview explique les limites si les données runtime (témoins, poids PNJ, propagation communautaire) ne sont pas disponibles localement
9. **Déconnexion runtime**
  - **Given** Unity ou la source runtime n'est pas connectée
  - **When** un dialogue utilise caractéristiques, effort ou réputation
  - **Then** un warning non bloquant indique que l'évaluation runtime dépendra de l'intégration externe
  - **And** la validation syntaxique et la preview simulée restent disponibles
10. **Séparation stricte des systèmes sociaux**
  - **Given** un dialogue référence `Influence` ou `Respect`
  - **When** la validation système s'exécute
  - **Then** ces jauges sont traitées comme `Influence & Respect (PJ possédés)`, pas comme Réputation
  - **And** les messages d'erreur préviennent toute confusion entre `Respect` et `Admiration/Prestige/Crainte`

**Technical Requirements:**

- Backend : `GameSystemIntegrationService` ou service équivalent injecté via `api/container.py` pour lire l'état disponible depuis Unity/API/fichier config sans coupler les règles métier au router.
- Réputation : modèles dédiés pour `reputation.axis`, cible (`heroineId`, `npcId`, `communityId`), mode de lecture (`raw_npc`, `final_npc`, `community_aggregate`) et conditions par seuil/palier.
- Paliers : helper pur `RepPalier` calculé depuis une valeur numérique, avec seuils alignés sur le sous-système Notion **Paliers de Réputation** ; ne jamais persister le palier courant.
- Titres : conditions de titre basées sur flags one-way ou catalogue titres, séparées des conditions de jauge/palier.
- Caractéristiques : `SkillCheckService` — formule `Score(caractéristique + compétence + modificateurs) vs DD`, résultats `succès_critique`, `succès`, `échec`, `échec_critique`.
- Effort : support d'un pool simulé par défaut `10 PE`, coûts par choix, et état grisé si insuffisant.
- Frontend : `GameSystemIntegrationPanel.tsx` ou panneaux dédiés sous `components/graph/` ; ne pas gonfler `NodeEditorPanel.tsx`.
- Preview : extension de `DialoguePreviewService` pour état simulé stats/réputation/titres, avec avertissements explicites quand l'agrégat communautaire complet n'est pas calculable localement.
- Validation : erreurs typées pour confusion `Respect` vs Réputation, palier stocké en flag, titre confondu avec palier, ou cible de réputation ambiguë.
- Tests : unitaires backend pour calcul `RepPalier`, conditions réputation, titres et skill checks ; Vitest pour UI/preview ; E2E ciblé pour un dialogue combinant test de caractéristique, Effort, condition Réputation et titre.

**References:** FR94 (intégration stats V3.0+), Story 9.2 (conditions Réputation V1), Story 9.3 (effets Réputation V1), Story 9.4 (preview), Story 9.5 (références flags vs `dialogueFlags`), NFR-I3 (Game System Integration V3.0+), Notion `Réputation`, Notion `Paliers de Réputation`, Notion `Titres de faction`, Notion `Influence & Respect (PJ possédés)`, Notion `Caractéristiques et Compétences`, Notion `Gestion de l'Effort`.