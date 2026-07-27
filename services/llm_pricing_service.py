"""Service de calcul des prix pour les appels LLM."""
import json
import logging
import os
from datetime import date
from pathlib import Path
from typing import Any, Dict, Optional

logger = logging.getLogger(__name__)

# Chemin vers le fichier de configuration des prix
PRICING_CONFIG_PATH = Path(__file__).resolve().parent.parent / "config" / "llm_pricing.json"


class LLMPricingService:
    """Service pour calculer les coûts des appels LLM basés sur les modèles.
    
    Charge les tarifs depuis config/llm_pricing.json et calcule les coûts
    en fonction du nombre de tokens (input/output).
    """
    
    def __init__(self, config_path: Optional[Path] = None):
        """Initialise le service de pricing.
        
        Args:
            config_path: Chemin vers le fichier de configuration des prix.
                        Si None, utilise le chemin par défaut.
        """
        self.config_path = config_path or PRICING_CONFIG_PATH
        self._pricing_config: Optional[Dict] = None
        self._load_config()
    
    def _load_config(self) -> None:
        """Charge la configuration des prix depuis le fichier JSON.
        
        Raises:
            FileNotFoundError: Si le fichier de configuration n'existe pas.
            json.JSONDecodeError: Si le fichier JSON est invalide.
        """
        try:
            with open(self.config_path, 'r', encoding='utf-8') as f:
                self._pricing_config = json.load(f)
            logger.info(f"Configuration des prix LLM chargée depuis {self.config_path}")
        except FileNotFoundError:
            logger.error(f"Fichier de configuration des prix introuvable: {self.config_path}")
            self._pricing_config = {}
        except json.JSONDecodeError as e:
            logger.error(f"Erreur de décodage JSON dans {self.config_path}: {e}")
            self._pricing_config = {}
    
    def max_reference_cost(self, prompt_tokens: int, completion_tokens: int) -> float:
        """Coût maximal parmi tous les modèles connus (pré-check conservateur).

        Args:
            prompt_tokens: Tokens prompt.
            completion_tokens: Tokens complétion.

        Returns:
            Coût USD maximal théorique sur la grille chargée, ou 0.0 si grille vide.
        """
        if not self._pricing_config:
            return 0.0
        models = self._pricing_config.get("models", {})
        if not isinstance(models, dict) or not models:
            return 0.0
        best = 0.0
        for _name, pricing in models.items():
            if not isinstance(pricing, dict):
                continue
            inp = float(pricing.get("input_price_per_1M", 0.0) or 0.0)
            out = float(pricing.get("output_price_per_1M", 0.0) or 0.0)
            c = (prompt_tokens / 1_000_000) * inp + (completion_tokens / 1_000_000) * out
            best = max(best, c)
        return best

    def get_model_pricing(self, model_name: str) -> Optional[Dict[str, float]]:
        """Récupère les tarifs pour un modèle donné.
        
        Args:
            model_name: Nom du modèle (ex: gpt-4o, gpt-4-turbo).
            
        Returns:
            Dictionnaire avec 'input_price_per_1M' et 'output_price_per_1M',
            ou None si le modèle n'est pas trouvé.
        """
        if not self._pricing_config:
            return None
        
        models = self._pricing_config.get("models", {})
        return models.get(model_name)
    
    def calculate_cost(
        self,
        model_name: str,
        prompt_tokens: int,
        completion_tokens: int
    ) -> float:
        """Calcule le coût estimé d'un appel LLM.
        
        Args:
            model_name: Nom du modèle utilisé.
            prompt_tokens: Nombre de tokens dans le prompt (input).
            completion_tokens: Nombre de tokens dans la réponse (output).
            
        Returns:
            Coût estimé en USD. Retourne 0.0 si le modèle n'est pas trouvé.
        """
        pricing = self.get_model_pricing(model_name)

        if not pricing:
            logger.warning(
                "Modèle %r non trouvé dans la configuration des prix.",
                model_name,
            )
            if os.getenv("ENVIRONMENT", "development").lower() == "production":
                conservative = self.max_reference_cost(prompt_tokens, completion_tokens)
                logger.warning(
                    "Production: utilisation du coût de référence maximal (conservateur): %.6f USD",
                    conservative,
                )
                return conservative
            return 0.0
        
        input_price_per_1M = pricing.get("input_price_per_1M", 0.0)
        output_price_per_1M = pricing.get("output_price_per_1M", 0.0)
        
        # Calcul: (tokens / 1_000_000) * prix_par_1M
        input_cost = (prompt_tokens / 1_000_000) * input_price_per_1M
        output_cost = (completion_tokens / 1_000_000) * output_price_per_1M
        
        total_cost = input_cost + output_cost
        
        logger.debug(
            f"Calcul coût pour {model_name}: "
            f"{prompt_tokens} input tokens + {completion_tokens} output tokens = "
            f"${total_cost:.6f}"
        )
        
        return total_cost
    
    def reload_config(self) -> None:
        """Recharge la configuration des prix depuis le fichier.
        
        Utile pour mettre à jour les prix sans redémarrer l'application.
        """
        self._load_config()
        logger.info("Configuration des prix LLM rechargée")

    def upsert_model_pricing(
        self,
        model_name: str,
        input_price_per_1M: float,
        output_price_per_1M: float,
        description: Optional[str] = None,
    ) -> None:
        """Crée ou met à jour le tarif d'un modèle dans ``llm_pricing.json``.

        Args:
            model_name: Identifiant API du modèle.
            input_price_per_1M: Prix USD / million tokens input.
            output_price_per_1M: Prix USD / million tokens output.
            description: Description optionnelle.

        Raises:
            ValueError: Si ``model_name`` est vide.
            OSError: Si l'écriture du fichier échoue.
        """
        if not model_name or not str(model_name).strip():
            raise ValueError("model_name requis pour upsert_model_pricing")

        if self._pricing_config is None:
            self._pricing_config = {"models": {}}

        models = self._pricing_config.setdefault("models", {})
        if not isinstance(models, dict):
            models = {}
            self._pricing_config["models"] = models

        entry: Dict[str, Any] = {
            "input_price_per_1M": float(input_price_per_1M),
            "output_price_per_1M": float(output_price_per_1M),
        }
        if description is not None:
            entry["description"] = description
        elif isinstance(models.get(model_name), dict) and "description" in models[model_name]:
            entry["description"] = models[model_name]["description"]

        models[model_name] = entry
        self._pricing_config["last_updated"] = date.today().isoformat()

        with open(self.config_path, "w", encoding="utf-8") as handle:
            json.dump(self._pricing_config, handle, indent=2, ensure_ascii=False)
            handle.write("\n")
        self.reload_config()
        logger.info("Tarif LLM upsert pour %s", model_name)

    def remove_model_pricing(self, model_name: str) -> bool:
        """Supprime le tarif d'un modèle s'il existe.

        Args:
            model_name: Identifiant API du modèle.

        Returns:
            True si une entrée a été supprimée.
        """
        if not self._pricing_config:
            return False
        models = self._pricing_config.get("models", {})
        if not isinstance(models, dict) or model_name not in models:
            return False
        del models[model_name]
        with open(self.config_path, "w", encoding="utf-8") as handle:
            json.dump(self._pricing_config, handle, indent=2, ensure_ascii=False)
            handle.write("\n")
        self.reload_config()
        return True

