"""Schémas pour les jobs de génération avec SSE streaming."""
from typing import Optional, Literal
from pydantic import BaseModel, Field


class GenerationJobCreate(BaseModel):
    """Paramètres pour créer un job de génération (identiques à GenerateUnityDialogueRequest)."""
    
    user_instructions: str = Field(min_length=1)
    context_selections: dict
    npc_speaker_id: Optional[str] = None
    max_context_tokens: int = Field(default=8000, ge=1000, le=128000)
    max_completion_tokens: Optional[int] = Field(default=None, ge=1000, le=128000)
    system_prompt_override: Optional[str] = None
    author_profile: Optional[str] = None
    llm_model_identifier: str = Field(default="gpt-4o")
    reasoning_effort: Optional[Literal["none", "low", "medium", "high", "xhigh"]] = None
    max_choices: Optional[int] = Field(default=None, ge=2, le=10)
    choices_mode: Literal["free", "capped"] = "free"
    narrative_tags: Optional[list[str]] = None
    vocabulary_config: Optional[dict[str, str]] = None
    include_narrative_guides: bool = False
    previous_dialogue_preview: Optional[str] = None
    in_game_flags: Optional[list[str]] = None


class GenerationJobResponse(BaseModel):
    """Réponse après création d'un job de génération."""
    
    job_id: str = Field(description="UUID du job créé")
    stream_url: str = Field(description="URL de l'EventSource SSE pour ce job")
    status: Literal["queued", "running"] = "queued"


class GenerationJobStatus(BaseModel):
    """Statut d'un job de génération."""
    
    job_id: str
    status: Literal["queued", "running", "completed", "error", "cancelled"]
    result: Optional[dict] = None
    error: Optional[str] = None
    created_at: str
    updated_at: str
