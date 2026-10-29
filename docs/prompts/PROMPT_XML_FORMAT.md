# Format XML du Prompt

## Vue d'ensemble

Le prompt envoyé au LLM utilise un format XML hiérarchique au lieu du format texte/Markdown précédent. Ce format est moins verbeux que JSON, tout en restant bien structuré et facilement parsable par le modèle.

**Important** : Le JSON reste la source de vérité interne. Le XML est généré à partir du JSON (`PromptStructure`) uniquement pour la transmission au LLM.

## Structure globale

Le prompt XML suit cette structure hiérarchique :

```xml
<?xml version="1.0" encoding="UTF-8"?>
<prompt>
  <contract>...</contract>
  <technical>...</technical>
  <context>...</context>
  <narrative_guides>...</narrative_guides>
  <vocabulary>...</vocabulary>
  <scene_instructions priority="high">...</scene_instructions>
</prompt>
```

## Sections principales

### `<contract>` - Contrat global (Section 0)

Contient les directives d'auteur, le ton narratif, les règles de priorité et le format de sortie.

```xml
<contract>
  <author_directives>Directives d'auteur globales...</author_directives>
  <narrative_tone>Ton : #tension, #dramatique...</narrative_tone>
  <priority_rules>
    En cas de conflit entre les instructions, l'ordre de priorité est :
    1. Instructions de scène (SECTION 3) - prévalent sur tout
    2. Directives d'auteur (SECTION 0) - modulent le style global
    3. System prompt - règles générales de base
  </priority_rules>
  <output_format>
    IMPORTANT : Génère UN SEUL nœud de dialogue...
  </output_format>
</contract>
```

### `<technical>` - Instructions techniques (Section 1)

Contient les instructions de génération, les compétences et traits disponibles.

```xml
<technical>
  <generation_instructions>
    Règles de contenu :
    - Speaker (qui parle) : PNJ_ID (PNJ interlocuteur)
    - Choix (choices) : Options du joueur (URESAIR)
    - Tests d'attributs : Format 'AttributeType+SkillId:DD'
  </generation_instructions>
  <available_skills>
    Compétences disponibles: Rhétorique, Combat, Furtivité...
  </available_skills>
  <available_traits>
    Traits disponibles: Courageux, Lâche, Intelligent...
  </available_traits>
</technical>
```

### `<context>` - Contexte GDD (Section 2A)

Contient le contexte du Game Design Document (personnages, lieux, objets, etc.).

Structure hiérarchique :

```xml
<context>
  <characters>
    <character name="Nom du personnage">
      <identity>Nom: ... Espèce: ...</identity>
      <characterization>Caractérisation du personnage...</characterization>
      <voice>Voix et style du personnage...</voice>
      <background>Histoire et relations...</background>
      <mechanics>Mécaniques de jeu...</mechanics>
      <summary>Résumé de la fiche...</summary>
    </character>
  </characters>
  <locations>
    <location name="Nom du lieu">
      <summary>Description du lieu...</summary>
    </location>
  </locations>
  <items>
    <item name="Nom de l'objet">
      <summary>Description de l'objet...</summary>
    </item>
  </items>
  <species>
    <species name="Nom de l'espèce">
      <summary>Description de l'espèce...</summary>
    </species>
  </species>
  <communities>
    <community name="Nom de la communauté">
      <summary>Description de la communauté...</summary>
    </community>
  </communities>
  <quests>
    <quest name="Nom de la quête">
      <summary>Description de la quête...</summary>
    </quest>
  </quests>
</context>
```

#### Tags sémantiques des sections d'items

Les sections d'un item (personnage, lieu, etc.) sont mappées vers des tags XML sémantiques :

- `identity` : Section IDENTITÉ
- `characterization` : Section CARACTÉRISATION
- `voice` : Section VOIX ET STYLE
- `background` : Section HISTOIRE ET RELATIONS
- `mechanics` : Section MÉCANIQUES
- `summary` : Section INTRODUCTION/RÉSUMÉ
- `<section title="...">` : Autres sections génériques

### `<narrative_guides>` - Guides narratifs (Section 2B)

Contient les guides narratifs (dialogue guide, narrative guide).

```xml
<narrative_guides>
  [GUIDE DE DIALOGUE]
  ...
  
  [GUIDE NARRATIF]
  ...
</narrative_guides>
```

### `<vocabulary>` - Vocabulaire Alteir (Section 2C)

Contient le vocabulaire spécifique au monde (termes, expressions).

```xml
<vocabulary>
  [VOCABULAIRE ALTEIR]
  Mondialement:
  - Terme 1: Définition
  - Terme 2: Définition
  ...
</vocabulary>
```

### `<scene_instructions>` - Instructions de scène (Section 3)

Contient les instructions spécifiques de la scène. **Priorité haute**.

```xml
<scene_instructions priority="high">
  Brief de scène local avec instructions spécifiques...
</scene_instructions>
```

#### Résolution dramatis (PJ / PNJ / lieu)

Avant injection dans `<scene_instructions>`, le pipeline de génération Unity résout les rôles narratifs et enrichit le contexte GDD :

| Concept | Rôle |
|---------|------|
| `scene_type` | Identifiant template (`first_meeting`, `conversation`, …) → fichier `config/scene_instructions/*.txt` via `load_scene_instructions_text()` |
| `SceneDramatis` | PJ jouable (`player_character_id`) + PNJ speaker (`npc_speaker_id`) |
| `resolve_scene_dramatis()` | Canonise les noms GDD (accents), valide PJ/PNJ (l'Éthérée interdite comme speaker) |
| `enrich_context_selections_for_scene()` | Infère le lieu parent depuis sous-lieu + fiche PNJ ; réordonne `characters_full` (speaker en tête) |

**Première rencontre (`scene_type == "first_meeting"`)** : les instructions template sont enrichies avec la section `rencontre_initiale` de la fiche PNJ (`augment_first_meeting_instructions`).

**Code :** `services/scene_dramatis.py`, `services/scene_instruction_loader.py`, orchestration dans `services/unity_dialogue_orchestrator.py`.

**Tests :** `tests/services/test_scene_dramatis.py`, `tests/services/test_scene_dramatis_canonical.py`.

## Attributs XML

Les attributs sont utilisés de manière minimale, uniquement quand ils changent vraiment le sens :

- `priority="high|medium|low"` : Priorité de la section (ex: `scene_instructions priority="high"`)
- `name="..."` : Nom de l'élément (ex: `<character name="Akthar-Neth">`)

## Échappement XML

Tous les contenus texte sont automatiquement échappés :

- `&` → `&amp;`
- `<` → `&lt;`
- `>` → `&gt;`

Les guillemets dans les attributs sont gérés automatiquement par la bibliothèque XML.

## Profondeur maximale

La structure XML respecte une profondeur maximale de 3-4 niveaux :

1. `<prompt>` (racine)
2. Sections principales (`<contract>`, `<context>`, etc.)
3. Sous-sections (`<characters>`, `<character>`, etc.)
4. Sections d'items (`<identity>`, `<characterization>`, etc.)

## Accès au JSON brut

Le JSON brut (`PromptStructure`) reste accessible pour le debug via l'endpoint API :

**POST** `/api/v1/dialogues/debug/raw-json`

Cet endpoint accepte les mêmes paramètres que `estimate-tokens` et retourne :

```json
{
  "structured_context": {
    "sections": [...],
    "metadata": {...}
  },
  "prompt_hash": "sha256_hash_du_prompt"
}
```

## Exemple complet

```xml
<?xml version="1.0" encoding="UTF-8"?>
<prompt>
  <contract>
    <author_directives>Style épique et immersif...</author_directives>
    <narrative_tone>Ton : #tension, #dramatique</narrative_tone>
    <priority_rules>...</priority_rules>
    <output_format>Génère UN SEUL nœud de dialogue...</output_format>
  </contract>
  <technical>
    <generation_instructions>Speaker: Akthar-Neth...</generation_instructions>
    <available_skills>Rhétorique, Combat...</available_skills>
  </technical>
  <context>
    <characters>
      <character name="Akthar-Neth Amatru, l'Exégète">
        <identity>Nom: Akthar-Neth Amatru...</identity>
        <characterization>Personnage érudit et mystérieux...</characterization>
        <voice>Registre de langage soutenu...</voice>
      </character>
    </characters>
  </context>
  <narrative_guides>...</narrative_guides>
  <vocabulary>...</vocabulary>
  <scene_instructions priority="high">
    Le joueur rencontre Akthar-Neth dans sa bibliothèque...
  </scene_instructions>
</prompt>
```

## Avantages du format XML

1. **Moins verbeux que JSON** : Pas de guillemets répétitifs, structure plus compacte
2. **Hiérarchie claire** : Les balises délimitent nettement les sections
3. **Parsable par le LLM** : Le modèle comprend mieux la structure hiérarchique
4. **Source de vérité JSON** : Le JSON reste disponible pour l'interface et le debug
5. **Échappement automatique** : Les caractères spéciaux sont gérés automatiquement

## Migration depuis le format texte

Le format XML remplace le format texte Markdown précédent. Les changements principaux :

- **Avant** : Sections avec `### SECTION X` et marqueurs `--- ... ---`
- **Après** : Structure XML hiérarchique avec balises sémantiques

Le `structured_prompt` (JSON) reste inchangé pour l'interface utilisateur.
