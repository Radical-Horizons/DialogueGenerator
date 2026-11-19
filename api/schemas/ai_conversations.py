"""Schémas Pydantic des conversations IA (sujets enfichables)."""

from __future__ import annotations

from typing import Annotated, Literal, Optional, Union

from pydantic import BaseModel, Field, field_validator

MAX_MESSAGE_LENGTH = 4000


class DialogueNodeSubject(BaseModel):
    """Sujet ``dialogue_node`` : le nœud qu'une génération IA a produit."""

    kind: Literal["dialogue_node"] = "dialogue_node"
    dialogue_id: str = Field(..., min_length=1, max_length=205)
    node_id: str = Field(..., min_length=1, max_length=200)

    @field_validator("dialogue_id", "node_id")
    @classmethod
    def _trim(cls, value: str) -> str:
        """Refuse un identifiant composé uniquement d'espaces."""
        trimmed = value.strip()
        if not trimmed:
            raise ValueError("Identifiant vide")
        return trimmed


# Union discriminée sur ``kind`` : chaque nouveau sujet y ajoute son modèle.
AIConversationSubject = Annotated[
    Union[DialogueNodeSubject],
    Field(discriminator="kind"),
]


class AIConversationCreateRequest(BaseModel):
    """Ouverture d'une conversation sur un sujet."""

    subject: AIConversationSubject
    llm_model_identifier: Optional[str] = Field(
        default=None,
        max_length=200,
        description="Modèle à utiliser ; défaut : celui de la génération, sinon le modèle par défaut.",
    )


class AIConversationMessageCreateRequest(BaseModel):
    """Question posée à l'IA."""

    content: str = Field(..., min_length=1, max_length=MAX_MESSAGE_LENGTH)

    @field_validator("content")
    @classmethod
    def _non_blank(cls, value: str) -> str:
        """Refuse une question vide (espaces seuls)."""
        if not value.strip():
            raise ValueError("La question est vide")
        return value


class AIConversationGenerationResponse(BaseModel):
    """Instantané de la génération sur laquelle porte la conversation."""

    output_text: Optional[str] = None
    reasoning_summary: Optional[str] = None
    model_name: Optional[str] = None
    generated_at: Optional[str] = None
    request_id: Optional[str] = None
    call_id: Optional[str] = None


class AIConversationMessageResponse(BaseModel):
    """Message d'une conversation."""

    id: str
    position: int
    role: Literal["user", "assistant"]
    content: str
    reasoning_summary: Optional[str] = None
    llm_call_id: Optional[str] = None
    model_name: Optional[str] = None
    cost_usd: Optional[float] = None
    created_at: str


class AIConversationResponse(BaseModel):
    """Conversation complète."""

    id: str
    subject: AIConversationSubject
    title: str
    model_name: str
    generation: AIConversationGenerationResponse
    messages: list[AIConversationMessageResponse] = Field(default_factory=list)
    created_at: str
    updated_at: str


class AIConversationSummaryResponse(BaseModel):
    """Conversation dans une liste (sans messages)."""

    id: str
    subject: AIConversationSubject
    title: str
    model_name: str
    message_count: int
    created_at: str
    updated_at: str


class AIConversationExchangeResponse(BaseModel):
    """Question persistée et réponse de l'IA."""

    user_message: AIConversationMessageResponse
    assistant_message: AIConversationMessageResponse
