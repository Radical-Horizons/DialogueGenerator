---
alwaysApply: false
description: Patterns de mock et fixtures pour tests pytest
globs: ["tests/**/*.py"]
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

### Monkeypatch pour dépendances FastAPI
```python
def test_endpoint(self, client, monkeypatch):
    """Test avec monkeypatch des dépendances."""
    from api.dependencies import get_<service>
    
    def mock_get_<service>():
        return mock_<service>
    
    monkeypatch.setattr("api.dependencies.get_<service>", mock_get_<service>)
    response = client.get("/api/v1/...")
```

## Références

- **Règle principale** : `.claude/rules/tests.md`
- **Fixtures communes** : `tests/conftest.py`
- **Exemples** : `tests/api/test_config_field_validation.py`, `tests/services/test_unity_dialogue_generation_service.py`
