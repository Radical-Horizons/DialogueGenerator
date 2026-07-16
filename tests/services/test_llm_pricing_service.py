"""Tests pour le service de pricing LLM."""
import pytest
from pathlib import Path
from services.llm_pricing_service import LLMPricingService


@pytest.fixture
def pricing_config_path(tmp_path):
    """Crée un fichier de configuration de pricing temporaire."""
    config_file = tmp_path / "llm_pricing.json"
    config_file.write_text("""{
  "models": {
    "gpt-5.6-terra": {
      "input_price_per_1M": 2.50,
      "output_price_per_1M": 10.00
    },
    "gpt-3.5-turbo": {
      "input_price_per_1M": 0.50,
      "output_price_per_1M": 1.50
    }
  }
}""")
    return config_file


@pytest.fixture
def pricing_service(pricing_config_path):
    """Crée un service de pricing avec configuration temporaire."""
    return LLMPricingService(config_path=pricing_config_path)


def test_calculate_cost_gpt4o(pricing_service):
    """Teste le calcul de coût pour gpt-5.6-terra."""
    cost = pricing_service.calculate_cost(
        model_name="gpt-5.6-terra",
        prompt_tokens=1000000,
        completion_tokens=500000
    )
    # 1M input tokens * $2.50 + 0.5M output tokens * $10.00
    expected = 2.50 + 5.00
    assert cost == pytest.approx(expected, rel=1e-6)


def test_calculate_cost_gpt35(pricing_service):
    """Teste le calcul de coût pour gpt-3.5-turbo."""
    cost = pricing_service.calculate_cost(
        model_name="gpt-3.5-turbo",
        prompt_tokens=2000000,
        completion_tokens=1000000
    )
    # 2M input tokens * $0.50 + 1M output tokens * $1.50
    expected = 1.00 + 1.50
    assert cost == pytest.approx(expected, rel=1e-6)


def test_calculate_cost_unknown_model_development_returns_zero(pricing_service, monkeypatch):
    """Hors production, modèle inconnu → 0 (comportement historique)."""
    monkeypatch.setenv("ENVIRONMENT", "development")
    cost = pricing_service.calculate_cost(
        model_name="unknown-model",
        prompt_tokens=1000,
        completion_tokens=500,
    )
    assert cost == 0.0


def test_calculate_cost_unknown_model_production_uses_conservative_max(pricing_service, monkeypatch):
    """En production, modèle inconnu → coût de référence maximal sur la grille."""
    monkeypatch.setenv("ENVIRONMENT", "production")
    pt, ct = 1_000_000, 500_000
    cost = pricing_service.calculate_cost(
        model_name="unknown-model",
        prompt_tokens=pt,
        completion_tokens=ct,
    )
    assert cost == pytest.approx(pricing_service.max_reference_cost(pt, ct), rel=1e-6)


def test_get_model_pricing(pricing_service):
    """Teste la récupération des tarifs d'un modèle."""
    pricing = pricing_service.get_model_pricing("gpt-5.6-terra")
    assert pricing is not None
    assert pricing["input_price_per_1M"] == 2.50
    assert pricing["output_price_per_1M"] == 10.00


def test_get_model_pricing_unknown(pricing_service):
    """Teste la récupération des tarifs d'un modèle inconnu."""
    pricing = pricing_service.get_model_pricing("unknown-model")
    assert pricing is None



