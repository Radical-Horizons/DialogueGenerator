---
description: Patterns de mock et fixtures pour tests pytest
paths:
  - "tests/**/*.py"
---
# Tests — Patterns de mock et fixtures

## Fixtures globales disponibles

- `client` (dans `conftest.py`) : TestClient FastAPI
- `disable_rate_limiting` (auto) : Désactive rate limiting pour tous les tests
- `tmp_path` : Fixture pytest pour fichiers temporaires (auto-nettoyage)

## Patterns de mock courants

### Fichiers temporaires (tmp_path)
```python
def test_with_files(tmp_path):
    """Test utilisant des fichiers temporaires."""
    file_path = tmp_path / "test.json"
    file_path.write_text('{"data": "test"}')
    # tmp_path est automatiquement nettoyé après le test
```

### ContextBuilder
```python
@pytest.fixture
def mock_context_builder():
    """Mock du ContextBuilder avec des données de test."""
    from context_builder import ContextBuilder
    builder = ContextBuilder()
    builder.characters = [{"Nom": "Test", ...}]
    builder.locations = [...]
    return builder
```

### LLM Client
```python
@pytest.fixture
def mock_llm_client():
    """Mock du LLM client."""
    from unittest.mock import MagicMock, AsyncMock
    client = MagicMock()
    client.generate_variants = AsyncMock(return_value=[...])
    return client
```

### Configuration Service
```python
@pytest.fixture
def mock_config_service():
    """Mock du ConfigurationService."""
    from unittest.mock import MagicMock
    service = MagicMock()
    service.context_config = {...}
    service.get_llm_config = MagicMock(return_value={...})
    return service
```

### Remplacer une dépendance FastAPI : `app.dependency_overrides`
```python
@pytest.fixture
def fake_service() -> Iterator[None]:
    from api.dependencies import get_<service>

    app.dependency_overrides[get_<service>] = lambda: mock_<service>
    yield
    app.dependency_overrides.pop(get_<service>, None)
```

⚠️ **Ne pas** réassigner l'attribut du module (`monkeypatch.setattr("api.dependencies.get_x", …)`
ou `module.get_x = …`) pour une fonction utilisée en `Depends(get_x)` : `Depends` a capturé
la fonction à la déclaration de la route, le remplacement n'a **aucun effet** et le test
tourne sur la vraie dépendance. Vécu en septembre 2026 : `tests/api/test_logs.py` lisait
les vrais `data/logs/` au lieu de ses fichiers d'exemple, et ne passait en CI que parce que
pytest y écrivait lui-même ses logs. `monkeypatch.setattr` ne vaut que pour une fonction
appelée par son module **au moment de la requête**.

## Références

- **Règle principale** : `.claude/rules/tests.md`
- **Fixtures communes** : `tests/conftest.py`
- **Exemples** : `tests/api/test_config_field_validation.py`, `tests/services/test_unity_dialogue_generation_service.py`
