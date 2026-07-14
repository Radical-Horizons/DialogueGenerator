"""Middleware modules for the API."""
# Import depuis le fichier middleware.py (module parent, pas package)
# Utiliser importlib pour éviter les conflits de nom
import importlib.util
from pathlib import Path

# Charger le fichier middleware.py comme module
middleware_file = Path(__file__).parent.parent / "middleware.py"
spec = importlib.util.spec_from_file_location("_api_middleware_module", middleware_file)
_middleware_module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(_middleware_module)

# Exposer les classes
RequestIDMiddleware = _middleware_module.RequestIDMiddleware
DatabaseReadinessMiddleware = _middleware_module.DatabaseReadinessMiddleware
LoggingMiddleware = _middleware_module.LoggingMiddleware

__all__ = ["RequestIDMiddleware", "DatabaseReadinessMiddleware", "LoggingMiddleware"]
