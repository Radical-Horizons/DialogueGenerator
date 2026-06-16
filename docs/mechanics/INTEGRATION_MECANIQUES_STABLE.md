# Intégration mécaniques RPG - Analyse factuelle de ce qui peut être fait de manière stable

> **Périmètre : couche prompt LLM** — Ce document analyse l'injection de traits/compétences dans les **prompts de génération** (`PromptEngine`, catalogues CSV). Ce n'est **pas** la spécification de l'intégration runtime FR94 (skill checks, Effort, Réputation v3, preview scénario). Pour le comportement livré dans l'éditeur de graphe, voir [`docs/guides/game-systems-integration.md`](../guides/game-systems-integration.md) (référence = code + tests).

## Objectif

Déterminer factuellement ce qui peut être intégré dans le système de génération de dialogues sans risquer de gêner le LLM ou d'avoir un système instable.

## État actuel du code

### ✅ Déjà fait et stable

#### 1. Traits/Skills depuis CSV structuré
**Implémentation** : `services/trait_catalog_service.py`, `services/skill_catalog_service.py`  
**Injection** : `<technical><available_traits>` et `<available_skills>` dans `prompt_engine.py` (lignes 319-336)

**Stabilité** : ✅ **Haute**
- Format CSV structuré avec colonnes fixes
- Chargement robuste avec gestion d'erreurs
- Liste complète injectée dans le prompt

**Ce que ça fait** :
```
<technical>
  <available_traits>Traits disponibles: Courageux, Lâche, Intelligent, ... (30 premiers)
  Utilise ces traits dans traitRequirements des choix (format: [{'trait': 'NomTrait', 'minValue': 5}])
  Les traits peuvent être positifs (ex: 'Courageux') ou négatifs (ex: 'Lâche').</available_traits>
  <available_skills>Compétences disponibles: Force, Social, Raison, ... (50 premières)
  Utilise ces compétences dans les tests d'attributs (format: 'AttributeType+NomCompétence:DD').</available_skills>
</technical>
```

**Limitation actuelle** : Le LLM choisit librement parmi ces listes, sans suggestion basée sur le contexte du PJ.

---

### ⚠️ Partiellement fait (peut être amélioré)

#### 2. Qualités/Défauts depuis JSON GDD
**Implémentation** : `context_config.json` (lignes 8-9)  
**Format** : `{"path": "Qualités", "label": "Qualités", "is_list": true, "list_max_items": 3}`

**Stabilité** : ✅ **Haute** (extraction structurée depuis JSON)
**Utilisation actuelle** : ❌ Extraites mais injectées comme texte dans le contexte, pas utilisées pour suggérer des traits

**Ce qui existe** :
- Les "Qualités" et "Défauts" sont extraits comme listes depuis le JSON GDD
- Formaté et injecté dans le contexte narratif (niveau 1, max 3 items)
- **MAIS** : Pas de matching avec le catalogue de traits CSV
- **MAIS** : Pas d'injection explicite dans `<technical>` pour suggérer des traits du PJ

---

## Ce qui peut être fait de manière stable (recommandé)

### ✅ 1. Extraction et suggestion de traits du PJ depuis Qualités/Défauts

**Stabilité** : ✅ **Haute**
- Données déjà structurées (listes JSON)
- Format stable (`Qualités` et `Défauts` sont toujours des listes)
- Matching avec le catalogue CSV possible via recherche textuelle simple

**Implémentation proposée** :
1. **Extraction** : Lors de la construction du contexte, extraire "Qualités" et "Défauts" du PJ sélectionné
2. **Matching** : Comparer chaque qualité/défaut avec les traits du catalogue CSV (recherche textuelle insensible à la casse, similarité partielle)
3. **Injection** : Ajouter dans `<technical><player_character_traits>` :

```xml
<technical>
  ...
  <player_character_traits>Traits du PJ (Uresaïr) : Courageux, Intelligent, Prudent
  Ces traits peuvent être utilisés dans traitRequirements des choix PJ.
  Format : [{'trait': 'Courageux', 'minValue': 5}]</player_character_traits>
</technical>
```

**Avantages** :
- ✅ Stable : Données structurées, format prévisible
- ✅ Pertinent : Suggère des traits réels du PJ
- ✅ Non intrusif : Suggestion, pas obligation
- ✅ Robuste : Si matching échoue, on n'injecte rien (fallback gracieux)

**Limitations acceptables** :
- Matching approximatif (recherche textuelle, pas sémantique) : acceptable car catalogue de traits limité (~100 traits)
- Si pas de PJ sélectionné ou pas de Qualités/Défauts : pas d'injection (comportement normal)

---

### ✅ 2. Règles heuristiques simples pour suggérer des types de tests

**Stabilité** : ✅ **Moyenne-Haute** (si règles simples)
- Analyse basée sur mots-clés dans `user_instructions`
- Règles heuristiques simples et prévisibles
- Injection dans `<technical>` comme suggestion, pas obligation

**Implémentation proposée** :
1. **Analyse** : Parser `user_instructions` pour détecter des mots-clés :
   - Action physique : "forcer", "pousser", "casser", "sauter", "grimper", "combattre"
   - Action sociale : "persuader", "convaincre", "négocier", "charmer", "intimider"
   - Observation : "observer", "analyser", "déduire", "chercher", "examiner"
   - Furtivité : "se cacher", "s'infiltrer", "passer inaperçu", "voler"
2. **Suggestion** : Injecter dans `<technical><suggested_test_types>` :

```xml
<technical>
  ...
  <suggested_test_types>Contexte suggère des tests de type physique (forcer, pousser).
  Utilisez AttributeType+SkillId:DD avec AttributeType = Force, Agilité, ou Endurance.</suggested_test_types>
</technical>
```

**Avantages** :
- ✅ Stable : Règles simples, mots-clés prévisibles
- ✅ Pertinent : Suggère des tests adaptés au contexte de la scène
- ✅ Non intrusif : Suggestion, le LLM reste libre de choisir
- ✅ Robuste : Si aucun mot-clé détecté, pas d'injection (fallback gracieux)

**Limitations acceptables** :
- Faux positifs possibles (ex: "observer" dans "observer le décor" vs "observer un piège") : acceptable car c'est une suggestion, pas une obligation
- Ne couvre pas tous les cas : acceptable, le LLM peut générer d'autres tests
- Langue limitée (français) : acceptable pour ce projet

---

### ⚠️ 3. Extraction de compétences spécialisées du PJ (si champ structuré existe)

**Stabilité** : ⚠️ **Variable** (dépend de la structure GDD)

**Analyse** : Si le GDD contient un champ structuré comme :
- `"Compétences" : ["Rhétorique", "Diplomatie", "Escrime"]` (liste)
- `"Compétences martiales" : {...}` (objet structuré)
- `"Compétences sociales" : {...}` (objet structuré)

**Implémentation proposée** (si champ existe) :
1. **Détection** : Vérifier si le PJ a un champ "Compétences" structuré (liste ou objet)
2. **Matching** : Comparer avec le catalogue de compétences CSV
3. **Injection** : Ajouter dans `<technical><player_character_skills>` :

```xml
<technical>
  ...
  <player_character_skills>Compétences du PJ (Uresaïr) : Rhétorique, Diplomatie, Escrime
  Utilisez ces compétences dans les tests d'attributs (format: 'AttributeType+NomCompétence:DD').</player_character_skills>
</technical>
```

**Stabilité** : ✅ **Haute** si champ structuré existe, ❌ **Nulle** sinon

**Recommandation** : Ne pas implémenter tant que la structure réelle du GDD n'est pas vérifiée. Si ce champ n'existe pas, cette fonctionnalité est impossible sans restructuration du GDD.

---

## Ce qui ne peut PAS être fait de manière stable (à éviter)

### ❌ 1. Parsing automatique des relations complexes (texte libre)

**Pourquoi pas stable** :
- Format libre : "• L'Exégète : relation froide... • Vol Reitar : relation amoureuse..."
- Parsing fragile : Dépend de "•", ":", structure exacte
- Contexte complexe : Relations avec plusieurs personnages, nuances émotionnelles, ambivalence

**Alternative stable** : ✅ **Laisser le LLM comprendre** via contexte textuel
- Injecter le texte complet de "Background.Relations" dans le contexte (déjà fait dans `context_config.json` ligne 17)
- Le LLM comprend naturellement que seule la relation avec l'interlocuteur est pertinente
- Pas de parsing, pas de fragilité

**Recommandation** : ❌ **Ne pas implémenter de parsing de relations**. L'approche actuelle (texte libre au LLM) est plus robuste.

---

### ❌ 2. Extraction automatique de réputation/faction depuis données non structurées

**Pourquoi pas stable** :
- Pas de champ structuré dans `context_config.json` pour réputation/faction
- Si le champ existe dans le GDD mais n'est pas configuré dans `context_config.json`, impossible à extraire sans modification
- Si le champ n'existe pas dans le GDD, impossible sans restructuration

**Alternative stable** (si champ structuré existe) :
- Ajouter `{"path": "Faction", "label": "Faction", "truncate": -1}` dans `context_config.json` (location)
- Extraire et injecter dans le contexte : "Faction du lieu : [Nom]"
- Le LLM peut alors suggérer des conditions de réputation basées sur ce contexte

**Recommandation** : ⚠️ **Vérifier d'abord si le champ "Faction" existe dans le GDD réel**. Si oui, ajouter dans `context_config.json` et laisser le LLM suggérer. Si non, ne pas implémenter.

---

### ❌ 3. Tests basés sur compétences du PJ (si structure inconnue)

**Pourquoi pas stable** :
- Structure des compétences du PJ inconnue (peut être liste, objet, ou inexistant)
- Impossible de suggérer des tests sans connaître la structure réelle

**Recommandation** : ❌ **Ne pas implémenter tant que la structure réelle du GDD n'est pas vérifiée**.

---

## Recommandations factuelles

### À implémenter (stable et pertinent)

1. **✅ Extraction et suggestion de traits du PJ depuis Qualités/Défauts**
   - Stabilité : ✅ Haute
   - Pertinence : ✅ Haute
   - Effort : ⚠️ Moyen (matching avec catalogue CSV)
   - Impact : ✅ Bon (suggère des traits réels du PJ)

2. **✅ Règles heuristiques simples pour suggérer des types de tests**
   - Stabilité : ✅ Moyenne-Haute
   - Pertinence : ✅ Moyenne-Haute
   - Effort : ⚠️ Faible (règles simples, mots-clés)
   - Impact : ✅ Bon (suggère des tests adaptés au contexte)

### À vérifier avant d'implémenter

3. **⚠️ Extraction de compétences spécialisées du PJ**
   - Vérifier si champ "Compétences" existe dans le GDD réel
   - Si oui : Implémenter (stable)
   - Si non : Ne pas implémenter

4. **⚠️ Extraction de réputation/faction depuis lieu**
   - Vérifier si champ "Faction" existe dans le GDD réel (locations)
   - Si oui : Ajouter dans `context_config.json` et laisser le LLM suggérer (stable)
   - Si non : Ne pas implémenter

### À ne PAS implémenter (instable)

5. **❌ Parsing automatique des relations complexes**
   - Approche actuelle (texte libre au LLM) est plus robuste

6. **❌ Tests basés sur compétences du PJ (si structure inconnue)**
   - Impossible sans connaître la structure réelle

---

## Conclusion

**Ce qui peut être fait de manière stable et pertinente** :

1. ✅ **Traits du PJ depuis Qualités/Défauts** : Matching avec catalogue CSV, injection dans `<technical>`
2. ✅ **Types de tests suggérés** : Règles heuristiques basées sur mots-clés dans `user_instructions`

**Ce qui nécessite vérification** :

3. ⚠️ **Compétences spécialisées du PJ** : Vérifier si champ structuré existe
4. ⚠️ **Réputation/Faction** : Vérifier si champ structuré existe

**Ce qui ne doit PAS être fait** :

5. ❌ **Parsing de relations complexes** : Laisser le LLM comprendre (approche actuelle)
6. ❌ **Tests basés sur compétences (si structure inconnue)** : Impossible sans restructuration

**Principe général** : Privilégier les données structurées (JSON avec champs fixes, CSV) et les règles heuristiques simples (mots-clés) plutôt que le parsing de texte libre. Laisser le LLM comprendre les relations complexes via contexte textuel.
