"""Domain layer: business logic, DTOs, and domain exceptions.

This module contains:
- exceptions: Domain-level exceptions (API-agnostic)
- dtos: Data Transfer Objects for generation requests/responses
"""

from domain.exceptions import (
    DomainException,
    ValidationError,
    GenerationError,
    ResourceNotFoundError,
    ConfigurationError,
    LLMError,
)
from domain.dtos import (
    ContextSelectionDTO,
    UnityDialogueGenerationInput,
    UnityDialogueGenerationResult,
    GenerationEvent,
)

__all__ = [
    # Exceptions
    "DomainException",
    "ValidationError",
    "GenerationError",
    "ResourceNotFoundError",
    "ConfigurationError",
    "LLMError",
    # DTOs
    "ContextSelectionDTO",
    "UnityDialogueGenerationInput",
    "UnityDialogueGenerationResult",
    "GenerationEvent",
]
