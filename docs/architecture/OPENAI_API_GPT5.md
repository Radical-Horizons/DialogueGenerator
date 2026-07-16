# OpenAI API pour GPT-5.6 (Sol / Terra / Luna)

Documentation de l'utilisation de l'API OpenAI Responses pour la famille GPT-5.6 dans DialogueGenerator.

## Vue d'ensemble

Les modèles GPT-5.6 (`gpt-5.6-sol`, `gpt-5.6-terra`, `gpt-5.6-luna`) utilisent **la Responses API**, avec reasoning et structured outputs.

**Modèles concernés**: `gpt-5.6-sol` (alias `gpt-5.6`), `gpt-5.6-terra`, `gpt-5.6-luna`

**Note importante**: Chat Completions API est **dépréciée** pour GPT-5.x. Le code utilise Responses API quand le nom contient `gpt-5`.

## API utilisée

### Responses API (GPT-5.6)

Utilisée pour Sol / Terra / Luna :
- `client.responses.create(**params)`
- Endpoint: `/v1/responses`

**Note**: Le code utilise automatiquement Responses API pour tous les modèles contenant `gpt-5` dans leur nom.

## Format de requête

### Paramètres principaux

| Paramètre | Responses API |
|-----------|---------------|
| Messages | `input` (liste) |
| Tokens max | `max_output_tokens` |
| Tools | `{"type": "function", "name": "...", "parameters": {...}}` |
| Tool choice | `{"type": "allowed_tools", "mode": "required", "tools": [...]}` |
| Temperature | **Jamais** pour GPT-5.6 (400 si envoyé) |
| Top_p | **Jamais** pour GPT-5.6 (même gate) |
| Reasoning | `reasoning.effort` et `reasoning.summary` |

### Exemple de requête Responses API

```python
responses_params = {
    "model": "gpt-5.6-terra",
    "input": [
        {"role": "system", "content": "Tu es un assistant expert..."},
        {"role": "user", "content": "Génère un dialogue..."}
    ],
    "tools": [
        {
            "type": "function",
            "name": "generate_interaction",
            "description": "Génère une interaction de dialogue structurée.",
            "parameters": {
                "type": "object",
                "properties": {...},
                "required": [...]
            }
        }
    ],
    "tool_choice": {
        "type": "allowed_tools",
        "mode": "required",
        "tools": [{"type": "function", "name": "generate_interaction"}]
    },
    "max_output_tokens": 1500,
    "reasoning": {
        "effort": "medium",
        "summary": "auto"
    }
}

response = await client.responses.create(**responses_params)
```

## Schéma complet de la requête

Cette section documente tous les paramètres possibles envoyés à l'API OpenAI Responses, avec leurs types, valeurs par défaut, et exemples concrets.

### Schéma JSON de la requête

```json
{
  "model": "string (requis)",
  "input": "array[object] (requis)",
  "instructions": "string (optionnel)",
  "tools": "array[object] (optionnel, pour structured output)",
  "tool_choice": "object (optionnel, requis si tools présent)",
  "max_output_tokens": "integer (requis)",
  "reasoning": "object (optionnel)",
  "temperature": "float (optionnel, conditionnel)",
  "top_p": "float (optionnel)",
  "stream": "boolean (optionnel, défaut: false)"
}
```

### Détail des paramètres

#### `model` (requis)
- **Type**: `string`
- **Description**: Identifiant du modèle GPT-5 à utiliser
- **Valeurs possibles**:
  - `"gpt-5.6-terra"` - Modèle principal (recommandé)
  - `"gpt-5.6-sol"` - Version avec plus de compute
  - `"gpt-5.6-luna"` - Version économique
  - `"gpt-5.6-luna"` - Version compacte
- **Exemple**: `"gpt-5.6-terra"`

#### `input` (requis)
- **Type**: `array[object]`
- **Description**: Liste des messages de conversation (sans system message si `instructions` est fourni)
- **Structure de chaque message**:
  ```json
  {
    "role": "user" | "assistant" | "system",
    "content": "string"
  }
  ```
- **Valeurs courantes**:
  - Si `instructions` est fourni: `[{"role": "user", "content": "..."}]`
  - Si `instructions` n'est pas fourni: `[{"role": "system", "content": "..."}, {"role": "user", "content": "..."}]`
- **Exemple**:
  ```json
  [
    {
      "role": "user",
      "content": "<?xml version=\"1.0\" encoding=\"UTF-8\"?><prompt>...</prompt>"
    }
  ]
  ```

#### `instructions` (optionnel)
- **Type**: `string`
- **Description**: Instructions système séparées du champ `input`. Utilisé pour les modèles GPT-5.2+ qui supportent ce paramètre dédié.
- **Valeurs courantes**: Instructions système complètes (profil d'auteur, règles de style, etc.)
- **Exemple**: `"Tu es un assistant expert en écriture de dialogues pour jeux de rôle (RPG). Tu DOIS utiliser la fonction 'generate_interaction' pour formater ta réponse."`
- **Note**: Si fourni, le system message ne doit **pas** être dans `input`

#### `tools` (optionnel, requis pour structured output)
- **Type**: `array[object]`
- **Description**: Définition des fonctions disponibles pour structured output
- **Structure**:
  ```json
  [
    {
      "type": "function",
      "name": "generate_interaction",
      "description": "Génère une interaction de dialogue structurée.",
      "parameters": {
        "type": "object",
        "properties": {
          "title": {
            "type": "string",
            "description": "Titre descriptif du dialogue"
          },
          "node": {
            "type": "object",
            "properties": {
              "speaker": {"type": "string"},
              "line": {"type": "string"},
              "choices": {
                "type": "array",
                "items": {
                  "type": "object",
                  "properties": {
                    "text": {"type": "string"},
                    "test": {"type": "string"},
                    "condition": {"type": "string"}
                  }
                }
              }
            }
          }
        },
        "required": ["title", "node"],
        "additionalProperties": false
      }
    }
  ]
  ```
- **Valeurs courantes**: Toujours présent pour structured output, contient la définition de `generate_interaction`
- **Note**: Si absent, l'API retournera du texte libre (non structuré)

#### `tool_choice` (optionnel, requis si `tools` présent)
- **Type**: `object`
- **Description**: Force l'utilisation d'un tool spécifique
- **Structure**:
  ```json
  {
    "type": "allowed_tools",
    "mode": "required",
    "tools": [
      {
        "type": "function",
        "name": "generate_interaction"
      }
    ]
  }
  ```
- **Valeurs courantes**: Toujours `{"type": "allowed_tools", "mode": "required", "tools": [{"type": "function", "name": "generate_interaction"}]}` pour forcer structured output

#### `max_output_tokens` (requis)
- **Type**: `integer`
- **Description**: Nombre maximum de tokens pour la génération
- **Valeurs courantes**:
  - Par défaut: `32000` (recommandation OpenAI pour reasoning summary)
  - Minimum: `500`
  - Maximum: `50000`
- **Exemple**: `32000`
- **Note**: Recommandation OpenAI: 25000+ tokens pour reasoning summary

#### `reasoning` (optionnel)
- **Type**: `object`
- **Description**: Configuration de la phase réflexive (thinking)
- **Structure**:
  ```json
  {
    "effort": "none" | "minimal" | "low" | "medium" | "high" | "xhigh",
    "summary": "auto"
  }
  ```
- **Valeurs courantes**:
  - `effort`: `"medium"` (recommandé), `"low"`, `"high"`, `"xhigh"` (GPT-5.2 uniquement), `"none"` (GPT-5.2 uniquement), `"minimal"` (mini/nano uniquement)
  - `summary`: `"auto"` (recommandé, seule valeur supportée actuellement)
- **Exemple**:
  ```json
  {
    "effort": "medium",
    "summary": "auto"
  }
  ```
- **Note**: `"detailed"` pour `summary` nécessite une organisation OpenAI vérifiée (Tier 2/3), non disponible actuellement

#### `temperature` (optionnel, conditionnel)
- **Type**: `float`
- **Description**: Contrôle la créativité (0.0-2.0). Plus élevé = plus créatif
- **Valeurs courantes**: `0.7` (par défaut)
- **Contraintes**:
  - Uniquement disponible si `reasoning.effort == "none"` (ou non spécifié)
  - **Non disponible** pour GPT-5 mini/nano (car ils ne supportent pas `reasoning.effort="none"`)
- **Exemple**: `0.7`
- **Note**: Ignoré par l'API si `reasoning.effort` est défini avec une valeur autre que `"none"`

#### `top_p` (optionnel)
- **Type**: `float`
- **Description**: Nucleus sampling (0.0-1.0). Alternative/complément à `temperature`. 0.0=focalisé, 1.0=diversifié
- **Valeurs courantes**: `null` (non défini par défaut), `0.0` à `1.0`
- **Exemple**: `0.9`
- **Note**: Peut coexister avec `temperature` (contrairement à Chat Completions)

#### `stream` (optionnel)
- **Type**: `boolean`
- **Description**: Active le streaming natif (tokens en temps réel)
- **Valeurs courantes**: `true` (activé pour feedback temps réel), `false` (désactivé)
- **Exemple**: `true`
- **Note**: Responses API n'utilise pas `stream_options` (c'est pour Chat Completions API uniquement). Le streaming fonctionne simplement avec `stream=true`.

### Exemple complet de requête (avec tous les paramètres)

```json
{
  "model": "gpt-5.6-terra",
  "instructions": "Tu es un assistant expert en écriture de dialogues pour jeux de rôle (RPG). Tu DOIS utiliser la fonction 'generate_interaction' pour formater ta réponse.",
  "input": [
    {
      "role": "user",
      "content": "<?xml version=\"1.0\" encoding=\"UTF-8\"?><prompt>...</prompt>"
    }
  ],
  "tools": [
    {
      "type": "function",
      "name": "generate_interaction",
      "description": "Génère une interaction de dialogue structurée.",
      "parameters": {
        "type": "object",
        "properties": {
          "title": {
            "type": "string",
            "description": "Titre descriptif du dialogue"
          },
          "node": {
            "type": "object",
            "properties": {
              "speaker": {"type": "string"},
              "line": {"type": "string"},
              "choices": {
                "type": "array",
                "items": {
                  "type": "object",
                  "properties": {
                    "text": {"type": "string"},
                    "test": {"type": "string"},
                    "condition": {"type": "string"}
                  }
                }
              }
            }
          }
        },
        "required": ["title", "node"],
        "additionalProperties": false
      }
    }
  ],
  "tool_choice": {
    "type": "allowed_tools",
    "mode": "required",
    "tools": [
      {
        "type": "function",
        "name": "generate_interaction"
      }
    ]
  },
  "max_output_tokens": 32000,
  "reasoning": {
    "effort": "medium",
    "summary": "auto"
  },
  "top_p": 0.9,
  "stream": true
}
```

### Exemple minimal (sans reasoning, sans streaming)

```json
{
  "model": "gpt-5.6-terra",
  "input": [
    {
      "role": "system",
      "content": "Tu es un assistant expert..."
    },
    {
      "role": "user",
      "content": "Génère un dialogue..."
    }
  ],
  "tools": [...],
  "tool_choice": {...},
  "max_output_tokens": 1500,
  "temperature": 0.7
}
```

### Matrice de compatibilité des paramètres

| Modèle | `reasoning.effort` | `temperature` | `top_p` | `stream` |
|--------|-------------------|---------------|---------|----------|
| GPT-5.2 | `none`, `minimal`, `low`, `medium`, `high`, `xhigh` | ✅ (si `effort=none`) | ✅ | ✅ |
| GPT-5.2-pro | `none`, `minimal`, `low`, `medium`, `high`, `xhigh` | ✅ (si `effort=none`) | ✅ | ✅ |
| GPT-5-mini | `minimal`, `low`, `medium`, `high` | ❌ | ✅ | ✅ |
| GPT-5-nano | `minimal`, `low`, `medium`, `high` | ❌ | ✅ | ✅ |

### Notes importantes

1. **`instructions` vs `input` avec system**: Pour GPT-5.2+, préférer `instructions` séparé plutôt qu'un message system dans `input`
2. **`reasoning.summary`**: Uniquement `"auto"` supporté actuellement (les résumés `"detailed"` nécessitent une organisation OpenAI vérifiée Tier 2/3)
3. **`temperature`**: Ignoré si `reasoning.effort` est défini (sauf si `effort="none"`)
4. **`top_p`**: Peut coexister avec `temperature` (contrairement à Chat Completions)
5. **`stream`**: Active le streaming natif (pas de simulation côté client)

### Référence du code

- Construction des paramètres: `core/llm/openai/parameter_builder.py::build_responses_params()`
- Appel API: `core/llm/openai/client.py::generate_variants()` ou `generate_variants_streaming()`
- Schéma structured output: `models/dialogue_structure/unity_dialogue_node.py::UnityDialogueGenerationResponse`


## Reasoning (Phase réflexive)

La phase réflexive (reasoning) est disponible pour **tous les modèles GPT-5** via Responses API. Elle permet au modèle de "réfléchir" avant de générer sa réponse.

### Paramètres

- **`reasoning.effort`**: Niveau d'effort de raisonnement
  - `"none"`: Pas de phase réflexive (rapide) - **Uniquement GPT-5.2/5.2-pro**
  - `"minimal"`: Raisonnement minimal (réduit mais présent) - **GPT-5 mini/nano uniquement**
  - `"low"`: Raisonnement léger - **Tous modèles GPT-5**
  - `"medium"`: Raisonnement modéré (recommandé) - **Tous modèles GPT-5**
  - `"high"`: Raisonnement approfondi - **Tous modèles GPT-5**
  - `"xhigh"`: Raisonnement très approfondi (plus lent, plus coûteux) - **GPT-5.2/5.2-pro uniquement**

### Restrictions par modèle

- **GPT-5.2 / GPT-5.2-pro** : Supportent toutes les valeurs (`none`, `minimal`, `low`, `medium`, `high`, `xhigh`)
- **GPT-5 mini / GPT-5 nano** : Supportent uniquement `minimal`, `low`, `medium`, `high` (pas `none` ni `xhigh`)

- **`reasoning.summary`**: Format du résumé de la phase réflexive
  - `None`: Pas de résumé
  - `"auto"`: Résumé automatique (recommandé)
  - `"detailed"`: Résumé détaillé

### Comportement automatique

Si `reasoning.effort` est défini mais `reasoning.summary` est `None`, alors `summary="auto"` est activé automatiquement.

### Extraction du reasoning trace

Le reasoning trace est extrait depuis deux sources dans la réponse:

1. **`response.reasoning`**: Métadonnées (effort, summary configuré)
2. **`response.output`**: Contenu réel (chercher l'item avec `type="reasoning"`)

**Structure du reasoning trace**:
```python
reasoning_trace = {
    "effort": "medium",  # Effort configuré
    "summary": "Résumé textuel de la phase réflexive...",  # Texte extrait
    "items": [...],  # Items structurés du raisonnement (si disponibles)
    "items_count": 5  # Nombre d'items
}
```

**Code d'extraction**:
```python
# Depuis response.reasoning (métadonnées)
reasoning_data = getattr(response, "reasoning", None)
if reasoning_data:
    reasoning_effort = getattr(reasoning_data, "effort", None)
    reasoning_summary = getattr(reasoning_data, "summary", None)

# Depuis response.output (contenu réel)
output_items = getattr(response, "output", None) or []
for item in output_items:
    if getattr(item, "type", None) == "reasoning":
        reasoning_content_item = item
        summary_raw = getattr(reasoning_content_item, "summary", None)
        # Traitement du summary (peut être liste, string, etc.)
        break
```

## Temperature / top_p

**GPT-5.6 (Sol / Terra / Luna)** : ne **jamais** envoyer `temperature` ni `top_p` — l'API répond `400 Unsupported parameter: 'temperature' is not supported with this model` (preuve runtime 2026-07-17). Contrôler via `reasoning.effort` (défaut si omis : `medium`).

Implémentation : `OpenAIParameterBuilder.should_include_temperature` / `should_include_top_p` + `ModelNames.MODELS_WITHOUT_CUSTOM_TEMPERATURE`. Voir `.cursor/rules/llm.mdc`.

## Parsing de réponse

### Responses API

La réponse utilise un format structuré avec une liste d'items dans `response.output`:

```python
output_items = getattr(response, "output", None) or []

# Chercher l'appel de fonction (structured output)
for item in output_items:
    item_type = getattr(item, "type", None)
    if item_type in ("function_call", "tool_call", "function"):
        name = getattr(item, "name", None)
        args = getattr(item, "arguments", None)
        
        # Gestion de l'encapsulation sous item.function
        if name is None and getattr(item, "function", None) is not None:
            name = getattr(item.function, "name", None)
            args = getattr(item.function, "arguments", None)
        
        if name == "generate_interaction" and args:
            function_args_raw = args
            # Parser avec Pydantic
            parsed_output = response_model.model_validate_json(function_args_raw)
            break
```

**Types d'items dans `output`**:
- `"reasoning"`: Phase réflexive (contenu)
- `"function_call"` / `"tool_call"` / `"function"`: Appel de fonction (structured output)
- `"text"`: Réponse texte simple


## Gestion des tokens

### Responses API

- **Input tokens**: `response.usage.input_tokens`
- **Output tokens**: `response.usage.output_tokens`
- **Total**: `input_tokens + output_tokens` (pas de champ séparé)
- **Paramètre**: `max_output_tokens` (au lieu de `max_tokens`)

**Code d'extraction**:
```python
# Responses API uniquement
prompt_tokens = getattr(response.usage, "input_tokens", 0) or 0
completion_tokens = getattr(response.usage, "output_tokens", 0) or 0
total_tokens = prompt_tokens + completion_tokens
```

## Structured Output

Responses API supporte le structured output via function calling.

**Format tool**:
```python
tool_definition = {
    "type": "function",
    "name": "generate_interaction",
    "description": "Génère une interaction de dialogue structurée.",
    "parameters": {
        "type": "object",
        "properties": {...},
        "required": [...],
        "$defs": {...}  # Si références
    }
}
```

**Tool choice**:
```python
tool_choice = {
    "type": "allowed_tools",
    "mode": "required",
    "tools": [{"type": "function", "name": "generate_interaction"}]
}
```

## Modèles concernés

### Tous les modèles GPT-5 (Responses API uniquement)

Tous les modèles GPT-5 utilisent **uniquement** Responses API. Chat Completions est dépréciée et supprimée.

#### GPT-5.2 / GPT-5.2-pro

- **`gpt-5.6-terra`**: Modèle principal, bon équilibre performance/coût
- **`gpt-5.6-sol`**: Version avec plus de compute pour raisonnement approfondi

**Caractéristiques**:
- ✅ Utilisent Responses API uniquement
- ✅ Supportent reasoning avec toutes les valeurs (`none`, `minimal`, `low`, `medium`, `high`, `xhigh`)
- ✅ Supportent structured output
- ✅ Temperature disponible si `reasoning.effort == "none"` (ou non spécifié)
- ✅ Utilisent `max_output_tokens`

#### GPT-5 mini / GPT-5 nano

- **`gpt-5.6-luna`**: Version économique et rapide
- **`gpt-5.6-luna`**: Version compacte

**Caractéristiques**:
- ✅ Utilisent Responses API uniquement
- ✅ Supportent reasoning avec valeurs limitées (`minimal`, `low`, `medium`, `high` - **pas `none` ni `xhigh`**)
- ✅ Supportent structured output
- ❌ Temperature **non disponible** (car pas de `reasoning.effort="none"`)
- ✅ Utilisent `max_output_tokens`

**Note importante** : GPT-5 mini/nano génèrent **toujours des tokens de reasoning** (même avec `minimal`), ce qui augmente les coûts. Pour éviter complètement le reasoning, utilisez un modèle GPT-5.2 avec `reasoning.effort="none"`.

## Exemple complet

```python
from openai import AsyncOpenAI
from typing import Optional
import os

client = AsyncOpenAI(api_key=os.getenv("OPENAI_API_KEY"))

# Configuration pour n'importe quel modèle GPT-5 avec reasoning
model_name = "gpt-5.6-terra"  # ou "gpt-5.6-luna", "gpt-5.6-luna", etc.

# Responses API (uniquement pour GPT-5)
response = await client.responses.create(
        model=model_name,
        input=[
            {"role": "system", "content": "Tu es un assistant expert..."},
            {"role": "user", "content": "Génère un dialogue..."}
        ],
        tools=[{
            "type": "function",
            "name": "generate_interaction",
            "description": "Génère une interaction de dialogue structurée.",
            "parameters": {
                "type": "object",
                "properties": {
                    "title": {"type": "string"},
                    "node": {
                        "type": "object",
                        "properties": {
                            "line": {"type": "string"},
                            "choices": {
                                "type": "array",
                                "items": {
                                    "type": "object",
                                    "properties": {
                                        "text": {"type": "string"}
                                    }
                                }
                            }
                        }
                    }
                },
                "required": ["title", "node"]
            }
        }],
        tool_choice={
            "type": "allowed_tools",
            "mode": "required",
            "tools": [{"type": "function", "name": "generate_interaction"}]
        },
        max_output_tokens=1500,
        reasoning={
            "effort": "medium",
            "summary": "auto"
        }
    )
    
    # Extraction du reasoning trace
    reasoning_trace = None
    if hasattr(response, "reasoning"):
        reasoning_data = response.reasoning
        reasoning_trace = {
            "effort": getattr(reasoning_data, "effort", None),
            "summary": getattr(reasoning_data, "summary", None),
            "items": [],
            "items_count": 0
        }
    
    # Extraction depuis output
    output_items = getattr(response, "output", None) or []
    for item in output_items:
        if getattr(item, "type", None) == "reasoning":
            summary_raw = getattr(item, "summary", None)
            if isinstance(summary_raw, list):
                reasoning_trace["summary"] = "\n".join(str(p) for p in summary_raw)
            elif isinstance(summary_raw, str):
                reasoning_trace["summary"] = summary_raw
            break
        elif getattr(item, "type", None) in ("function_call", "tool_call", "function"):
            name = getattr(item, "name", None)
            args = getattr(item, "arguments", None)
            if name == "generate_interaction" and args:
                # Parser avec Pydantic
                parsed_output = response_model.model_validate_json(args)
                break
    
    # Métriques
    input_tokens = getattr(response.usage, "input_tokens", 0) or 0
    output_tokens = getattr(response.usage, "output_tokens", 0) or 0
    total_tokens = input_tokens + output_tokens
```

## Architecture du code

Le code a été refactorisé en classes séparées pour améliorer la maintenabilité :

- **`core/llm/openai/client.py`** : `OpenAIClient` (classe orchestratrice)
- **`core/llm/openai/parameter_builder.py`** : `OpenAIParameterBuilder` (construction des paramètres)
- **`core/llm/openai/response_parser.py`** : `OpenAIResponseParser` (parsing des réponses)
- **`core/llm/openai/reasoning_extractor.py`** : `OpenAIReasoningExtractor` (extraction du reasoning)
- **`core/llm/openai/usage_tracker.py`** : `OpenAIUsageTracker` (extraction des métriques)

## Références

- Code d'implémentation: `core/llm/openai/client.py::OpenAIClient.generate_variants()`
- Configuration des modèles: `llm_config.json`, `constants.py::ModelNames`
- Schémas API: `api/schemas/dialogue.py::GenerateUnityDialogueRequest`
- Interface frontend: `frontend/src/components/generation/ReasoningTraceViewer.tsx`
