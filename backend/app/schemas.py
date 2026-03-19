from datetime import datetime
from typing import Optional
from pydantic import BaseModel, ConfigDict


# ── Auth ────────────────────────────────────────────────────────────────────

class UserCreate(BaseModel):
    username: str
    email: str
    password: str


class UserResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    username: str
    email: str
    created_at: datetime


class Token(BaseModel):
    access_token: str
    token_type: str


# ── Documents ───────────────────────────────────────────────────────────────

class DocumentResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    user_id: int
    filename: str
    original_name: str
    page_count: int
    selected_start: Optional[int]
    selected_end: Optional[int]
    status: str
    error_message: Optional[str]
    created_at: datetime


class PageSelectionUpdate(BaseModel):
    start_page: int
    end_page: int


class GenerateCardsRequest(BaseModel):
    document_id: int
    model: str = "claude"


# ── Context Cards ────────────────────────────────────────────────────────────

class ContextCardResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    document_id: int
    title: str
    summary: str
    page_range_start: int
    page_range_end: int
    model_used: str
    order_index: int
    created_at: datetime


class DiagramRequest(BaseModel):
    diagram_type: str   # concept_map | flowchart | sequence


# ── Chat ─────────────────────────────────────────────────────────────────────

class ChatMessageResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    card_id: int
    role: str
    content: str
    created_at: datetime


class ChatRequest(BaseModel):
    message: str
