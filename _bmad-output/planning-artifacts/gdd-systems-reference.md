# Référence GDD — Systèmes de jeu Alteir

> **Source** : Table Notion "Systèmes de jeu" (`2be6e4d2-1b45-807c-bb2b-ee22e7209042`) + DB `Flags` + DB `Valeurs de Flag`  
> **Mise à jour** : 17/04/2026 — lecture directe API Notion  
> **Usage** : document de référence transversal pour tous les epics. Ne pas dupliquer son contenu dans chaque epic — le citer.

---

## Vue d'ensemble : les 11 systèmes validés (+ sous-systèmes)

| Système | ID Notion | Statut | Épics impactés |
|---------|-----------|--------|----------------|
| Caractéristiques et Compétences | `2be6e4d2-1b45-8007` | Validé | 1, 4, 5, 9 |
| Gestion de l'Effort | `2be6e4d2-1b45-8002` | Validé | 1, 4, 5, 9 |
| Dialogues | `2ef6e4d2-1b45-8073` | Validé | 1, 2, 4, 5, 9 |
| Réputation | `2be6e4d2-1b45-800d` | Validé | 1, 5, 9 |
| Campement & Recrutement | *(non accessible API)* | Validé | 1 |
| Déplacements | `2ef6e4d2-1b45-8016` | Validé | 2, 5 |
| Cut-scenes | `2c16e4d2-1b45-8047` | Validé | 1, 2, 5 |
| Exploration | `7d4905b5-1967-4488` | Validé | 2, 5 |
| Progression (Expérience) | `2bf6e4d2-1b45-80dd` | Validé | 5, 9 |
| Influence & Respect | `9ad386e6-c74d-4f8d` | Validé | 1, 2, 5, 9 |
| Exploration des souvenirs | `2cc6e4d2-1b45-8071` | Validé | 1, 2, 5 |
| Alliés secondaires (Compagnons) | `2bf6e4d2-1b45-80b3` | **Non validé** (proposition) | 1 |

---

## 1. Caractéristiques et Compétences

**But** : moteur de résolution universel, déterministe et transparent.

**Formule** : `Score = Caractéristique + Compétence + Modificateurs Contextuels`  
L'association Caractéristique ↔ Compétence est définie par le designer de quête (hardcodée dans le dialogue pour First Playable).  
Une même compétence peut utiliser différentes caractéristiques selon le contexte (ex: Intimidation → Puissance OU Sociabilité).

**Les 8 caractéristiques** : Puissance · Agilité · Perception · Intelligence · Créativité · Sociabilité · Technique · Volonté

**Règles de résolution** :
- `Score ≥ DD` → Succès
- `Score ≥ DD + 5` → Succès critique
- `Score ≤ DD - 5` → Échec critique
- Seuil DD : 5–150 selon le contexte
- Test impossible (Score max théorique < DD) : action bloquée
- Test automatique (Score min ≥ DD) : succès garanti
- Compétence absente (valeur 0) : test sur Caractéristique seule, DD inchangé

**Modificateurs contextuels** :
- Équipement et statuts temporaires : modifient le score (`-4 à +4` typiquement)
- Environnement (obscurité, terrain) : modifient le DD (`-4 à +4` typiquement)
- Soutien d'alliés : `+1/allié`, max `+3`

**Impacts DialogueGenerator** :
- Dans les nœuds de dialogue, un test s'écrit `[Sociabilité + Tromperie vs DD 7]`
- Score affiché au joueur avant le choix (vert = succès garanti, rouge = échec risqué)
- Tests toujours tentables — ils ne grisent pas l'option, ils ont une issue succès/échec

---

## 2. Gestion de l'Effort

**But** : économie de la réussite — le joueur gère le hasard plutôt que de le subir.

**Règles** :
- Pool : **10 points d'Effort** (PE) par défaut (peut être ajusté à 15 en mode histoire)
- Dépense : `N PE` convertit un Score inférieur au DD en succès (`+1 Score par PE dépensé`)
- Échec volontaire : si le joueur accepte de rater alors qu'il pourrait réussir → `+4 ou +6 PE` récupérés + conséquence narrative négative
- Soutien d'alliés : les alliés peuvent dépenser des PE à la place du joueur
- Récupération hors-dépense : échec naturel peut rapporter `1-3 PE` selon sévérité des conséquences

**Zones d'écart** (calibration DD) :
- Réussite libre : Score >> DD → succès sans investissement
- Effort léger : écart `1-2` → quelques PE suffisent
- Zone de tension : écart `3-4` → dilemme réel
- Sacrifice : Score << DD → coût prohibitif ou impossibilité

**Piste de design ouverte** : L'échec volontaire en présence de témoins pourrait déclencher une baisse de Réputation (Admiration/Prestige) — à formaliser.

**Accessibilité déterministe** : zéro aléatoire. Leviers : pool PE ajustable, DD réduits par Connaissances acquises, modificateurs d'équipement.

**Impacts DialogueGenerator** :
- Un choix peut indiquer un coût en Effort : `[Dépenser 2 PE pour forcer]`
- Choix grisé si pool Effort insuffisant (Story 9.6 V3.0+)
- Le slider d'allocation PE s'affiche quand Score < DD

---

## 3. Dialogues

**But** : vecteur principal de narration — conversations riches avec branchements, conditions, effets.

**Structure d'un nœud** :
- ID unique (string)
- Texte réplique ≤ 300 mots
- Locuteur (PNJ ou Uresaïr)
- 2–10 choix/options
- Conditions (flags, compteurs, stats, réputation)
- Actions/effets (modifier flags, compteurs, relations, réputation)
- Nœud suivant (ID)

**Repères de maintenabilité** (non hardcodés, alertes uniquement) :
- ~1 000 nœuds/arbre au-delà duquel la maintenabilité dégrade
- ~10 flags conversationnels par PNJ
- ~3 compteurs par PNJ (valeurs 0–3)

**Options grisées vs tentables** :
- Grisées = condition narrative non remplie (flag manquant, réputation insuffisante, progression) — le joueur ne peut pas les sélectionner
- Tests de caractéristiques = toujours tentables, affichés avec indicateur de score, issue succès/échec

**Tooltip condition** : `« Requiert : Réputation Prestige ≥ 30 (actuel : 15) »`

**Exemple de flag posé** : `voknir_demande_aide = true` (bool posé après sélection d'un choix)

**Intégrations** :
- Consomme : Caractéristiques & Compétences (Score social), Effort (1–3 PE), Réputation (seuils Admiration/Prestige/Crainte), Influence & Respect (seuils)
- Produit vers : Réputation (`±5–20` selon choix), Quêtes (flags déclenchement/complétion), Progression (XP narrative), Recrutement (état "allié recruté"), Exploration des souvenirs (flags de mémoire)

**Cut-scenes** (sous-système de Dialogues) : nœuds spéciaux en mode plein écran illustré. `EnterCutsceneMode("image_id")` / `ExitCutsceneMode()` — 2–4 choix, tests maintenus. Voir §7.

---

## 4. Réputation

**But** : monde socialement réactif aux actions du joueur — remplace l'alignement binaire.

**3 axes indépendants par faction/communauté** :
- **Admiration** (Cœur) : affection, émerveillement → Aide spontanée, cadeaux, confidences
- **Prestige** (Tête) : reconnaissance compétence → Missions exclusives, informations stratégiques, Titres
- **Crainte** (Tripes) : peur/intimidation (positif) ou mépris/ridicule (négatif) → Obéissance/Fuite (positif) ou Moqueries/Sabotage (négatif)

**Paliers** : Sympathie → Faveur → Dévotion (la jauge peut retomber entre paliers)

**Calcul** : agrégat pondéré des jauges individuelles des PNJ témoins présents → réputation communautaire recalculée à chaque action.

**Propagation** : actions auprès d'une faction se propagent vers les factions alliées/rivales.

**Flags produits** (uniquement les états non-recalculables) :
- `Palier max historique` — Enum, one-way, portée Faction — le palier le plus élevé jamais atteint, ne peut pas redescendre. À créer uniquement si un déblocage permanent en dépend.
- `Titre officiel` — Enum, one-way, portée Faction — décerné par moment narratif (quête majeure), pas par accumulation de jauge.

**⚠️ Règle critique** : **La valeur agrégée est la Source of Truth. Le palier courant n'est PAS un flag** — il se calcule à la volée. Ne jamais stocker le palier courant dans un flag.

**Plages typiques des effets dialogue** : Admiration `±5–20` · Prestige `±5–15` · Crainte variable

---

## 5. Déplacements

**But** : locomotion 2D dans Escelion, vecteur de l'exploration.

**États** : Inactif → En déplacement → Bloqué | Transition → Désactivé (pendant dialogue/cutscene)

**Règles clés** :
- 8 directions, vitesse ~5 unités Unity/seconde
- Désactivé automatiquement pendant les dialogues et cut-scenes
- Proximité PNJ pour déclencher dialogue : < 1.5 unités

**Impacts DialogueGenerator** : le système Dialogues requiert la proximité physique du PNJ (< 1.5 unités) pour déclencher l'interaction. Cet état "Désactivé" pendant dialogue est géré par l'export Unity — pas par le générateur.

---

## 6. Exploration (sous-système de Déplacements)

**But** : transformer chaque panneau en espace de micro-découvertes récompensées.

**Philosophie** :
- Panneaux compacts (2-3 écrans max, style Legend of Mana)
- **Zéro tour Ubisoft** : pas de révélation systématique de POI, pas de checklist, pas de pourcentage de zone
- **Progression par la connaissance** : explorer produit de la compréhension (entrées Connaissances, nouvelles options de Dialogue), pas de l'XP abstraite
- **Guidage silencieux** : design environnemental (lumière, son directionnel, anomalies visuelles, comportements PNJ) — jamais d'icône HUD explicite

**Règle des 2 canaux** : chaque POI doit être signalé par au moins 2 canaux distincts (visuel + sonore, visuel + PNJ, sonore + phénomène).

**Effets sur flags** : exploration produit des flags (ex: `Flag_lieu_nexus_decouverte → REPERE` puis `VISITE`) et des entrées "Connaissances" qui modifient les options de dialogue.

**Impacts DialogueGenerator** : les nœuds de dialogue peuvent être débloqués par des flags d'exploration. Le générateur doit être capable de référencer ces flags comme conditions.

---

## 7. Cut-scenes (sous-système de Dialogues)

**But** : traitement visuel et narratif fort pour moments à haute charge émotionnelle — plein écran illustré.

**Système parent** : Dialogues (Cut-scenes n'est pas autonome)

**Fonctionnement** :
- Un nœud JSON déclenche `EnterCutsceneMode("image_id")`
- Panneau 2D plein écran haute résolution remplace l'interface de dialogue standard
- 2–4 choix (minimum 2, maximum 4)
- Tests de caractéristiques maintenus (UI Effort adaptée au mode cinématique)
- `ExitCutsceneMode()` → retour à la map

**Exemple de déclencheur** : `"requiredTest": {"skill": "Presence", "dd": 12}`

**Impacts DialogueGenerator** : les nœuds de type Cut-scene sont un type spécial de nœud dialogue dans l'export Unity. Le générateur doit supporter ce type et l'inclure dans le schéma de validation (Epic 4) et d'export (Epic 5).

---

## 8. Progression (Expérience)

**But** : transformer l'exploration et les relations en spécialisation mécanique.

**Structure** :
- Arbres de nœuds par **lieu** (arbre central thématique) et par **faction** (branches colorées)
- Points gagnés par quêtes accomplies auprès des membres d'une faction
- Points dépensables dans les branches du lieu actuel (flexibilité inter-lieux)

**Paliers de réputation débloquants** :
- Seuil **Faveur** → nœuds spéciaux débloqués (plus puissants)
- Seuil **Icône** → proposition de **Rôle social** par la faction (reconfigure les bonus de l'arbre central du lieu)

**Rôles sociaux** : un rôle adopté reconfigure les bonus de l'arbre central du lieu (ex: Théomaque Consacrée → `+1 Perception` devient `+1 Volonté`). Les rôles donnent une identité mécanique alignée avec la faction.

**Impacts DialogueGenerator** : la Progression produit des flags narratifs (XP narrative à complétion de dialogues importants). Le générateur doit pouvoir marquer certains nœuds comme "importants pour la progression".

---

## 9. Influence & Respect (PJ possédés)

**But** : mesurer la dynamique de possession entre l'Éthérée (joueur) et les PJ possédés (Uresaïr, Vethraak, Eonundé).

**Deux jauges par PJ possédé** :
- **Influence** : capacité de pression de l'Éthérée sur le PJ → **seuil de gating** (débloque ou force certaines options/issues)
- **Respect** : confiance et consentement du PJ → **déclencheur proactif** (aides automatiques, dialogues internes, interventions contextuelles quand seuils atteints)

**Règles** :
- Jauges non consommées : elles servent de seuils, pas de monnaie à dépenser
- Influence = gating de choix uniquement
- Respect = réactions automatiques (ne grise/déverrouille pas des choix)
- Modifiées par choix de dialogue et événements narratifs

**Exemples** :
- Option "pression" visible seulement si `Influence ≥ seuil`
- Forcer une action : `influenceDelta -N` + `respectDelta -M` → micro-jauge pulse rouge
- Coopérer : `respectDelta +2` → indicateur pulse vert → aides proactives futures

**Impacts DialogueGenerator** :
- Les nœuds peuvent avoir des conditions sur `Influence ≥ seuil` ou `Respect ≥ seuil` (Story 9.2)
- Les effets peuvent modifier `Influence` et `Respect` (Story 9.3)
- Ce système est distinct de Réputation (qui concerne les factions, pas la relation Éthérée↔PJ)

---

## 10. Exploration des souvenirs

**But** : matérialiser l'introspection des PJ en gameplay exploratoire — psyché fragmentée, souvenirs jouables.

**Principe narratif clé** : chaque nœud de mémoire exploré avant un événement scénario lié **doit** modifier cet événement. Le savoir acquis ne peut pas être ignoré par le jeu.

**Flags produits** : non des booléens simples — ils encodent le **choix d'interprétation** (ex: `Vethraak_Ysellor_Interpretation = SANG_FROID | ACCIDENT | INCONNU`). Ce sont des flags **enum** avec valeurs sémantiques.

**Règle de non-redondance** : si un souvenir révèle une info, le scénario principal propose une version différente (perspective autre, version publique vs vérité intime).

**Boucle** :
1. Menu Psyché → sélection PJ → carte stylisée des nœuds (certains grisés, certains accessibles avec coût PE)
2. Navigation vers nœud → phase exploration libre (90 sec, hotspots cachés)
3. Activation nœud → cutscene (2 min) → choix d'interprétation
4. Flag enum posé → impact sur scénario principal

**Impacts DialogueGenerator** : les flags produits par l'exploration des souvenirs sont de type **enum** avec valeurs sémantiques. Le générateur doit les supporter comme conditions dans les nœuds de dialogue (ex: `Flag_souvenir_vethraak_ysellor = SANG_FROID` → option de dialogue exclusive).

---

## 11. Alliés secondaires (Compagnons)

> ⚠️ **Statut : proposition non validée** — à prendre avec précaution.

**But** : permettre aux alliés recrutés d'accompagner le groupe des 3 PJ (Uresaïr, Vethraak, Eonundé) et d'avoir un impact narratif et mécanique.

**Règles** :
- 0 à 1–2 alliés sélectionnables (nombre selon choix de design)
- En exploration : présence UI uniquement (portrait), pas de sprite visible
- En combat : spawn aux côtés des PJ, IA autonome simple
- Dialogue contextuel : la présence d'un allié peut déclencher des dialogues exclusifs avec des PNJ

**Impacts DialogueGenerator** : les nœuds de dialogue peuvent avoir des conditions sur la présence d'un allié spécifique (ex: `flag_allié_varis_présent = true` → option de dialogue exclusive avec marchand Van'Doei).

---

## Catalogue de Flags (DB `Flags`)

**343 flags** · ID FLAG001–FLAG389 · 283 Défini · 29 À définir

| Type | Nb | Règles |
|------|----|--------|
| `bool` | 22 | `true` / `false` |
| `compteur` | 30 | Champs `Min` et `Max` (définis dans le catalogue, lecture seule) |
| `enum` | 270 | Valeurs ordonnées (`Ordre`), valeur par défaut marquée, dans table `Valeurs de Flag` |

**Convention de nommage** : `Flag_[portée]_[entité]_[description]`

**Portées** : `Personnage` (185) · `Lieu` (74) · `Faction` (33) · `Système` (14) · `Quête` (13) · `Objet` (9)

**Valeurs de Flag** (table liée) : 616 valeurs · chaque entrée : `Nom`, `Ordre` (int), `Par défaut (oui/non)`, `Description narrative`, `Flag parent`

**Exemples concrets** :
- bool : `Flag_perso_voknir_rencontre_initiale`, `Flag_tutoriel_complete`
- compteur : `Flag_lieu_miroirs_forcage_compteur [Min:0, Max:4]`, `Flag_perso_ensevelie_echanges [Min:0, Max:4]`
- enum : `Flag_lieu_nexus_decouverte` (INCONNU → REPERE → VISITE → EXPLORE) · `Flag_souvenir_vethraak_ysellor` (SANG_FROID | ACCIDENT | INCONNU)

**Alertes de maintenabilité** (non bloquantes) : ~10 flags conversationnels/PNJ · ~3 compteurs/PNJ

---

## Matrice d'impact par Epic

> Seuls les epics en **backlog** sont listés — les epics 0, 1, 2, 3, 4, 16 sont `done`.

| Epic | Statut | Systèmes concernés | Impact principal |
|------|--------|--------------------|-----------------|
| **Epic 5** — Export Unity | backlog | Dialogues, Cut-scenes, Flags, Réputation, Influence/Respect, Progression, Exploration des souvenirs | **Fort** — le schéma JSON Unity doit inclure : conditions par type (bool/compteur/enum), effets par type, triggers Cut-scene (`EnterCutsceneMode`), champs Influence/Respect, marqueurs de Progression, flags enum sémantiques des souvenirs |
| **Epic 9** — Variables/Flags | backlog | Dialogues, Flags, Réputation, Caractéristiques, Effort, Influence, Progression | **Déjà mis à jour** — voir `epic-09.md` |
| **Epic 6** — Templates | backlog | Dialogues, Cut-scenes | Moyen — les templates pré-built devraient couvrir les types de nœuds : standard, cut-scene, nœuds avec conditions/effets. Les templates "confrontation" peuvent inclure des patterns de flags |
| **Epic 15** — Context selector | backlog | Tous (GDD comme source de contexte) | Faible — les fiches système sont un type de contenu GDD à potentiellement inclure dans la sélection de contexte |
| **Epic 17** — Mobile/responsive | backlog | Aucun | Non impacté |
| **Epics 7, 8, 10, 11, 12, 13, 14** | backlog | Aucun | Non impactés — tooling/infra |
