import logging

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from app.database import get_db
from app.models import User, Document, ContextCard, ChatMessage
from app.schemas import ContextCardResponse, DiagramRequest, ChatMessageResponse
from app.services import diagram_service
from app.utils.auth import get_current_user

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/cards", tags=["cards"])


# ── List cards for a document ────────────────────────────────────────────────

@router.get("/document/{doc_id}", response_model=list[ContextCardResponse])
async def list_cards(
    doc_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    await _assert_owns_document(doc_id, current_user.id, db)
    result = await db.execute(
        select(ContextCard)
        .where(ContextCard.document_id == doc_id)
        .order_by(ContextCard.order_index)
    )
    return result.scalars().all()


# ── Get single card ──────────────────────────────────────────────────────────

@router.get("/{card_id}", response_model=ContextCardResponse)
async def get_card(
    card_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    card = await _get_owned_card(card_id, current_user.id, db)
    return card


# ── Generate diagram ─────────────────────────────────────────────────────────

@router.post("/{card_id}/diagram")
async def generate_diagram(
    card_id: int,
    payload: DiagramRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    valid_types = ("concept_map", "flowchart", "sequence")
    if payload.diagram_type not in valid_types:
        raise HTTPException(
            status_code=400,
            detail=f"diagram_type must be one of: {', '.join(valid_types)}",
        )

    card = await _get_owned_card(card_id, current_user.id, db)

    try:
        mermaid_code = await diagram_service.generate_diagram(
            card.summary, payload.diagram_type
        )
    except ValueError as e:
        raise HTTPException(status_code=422, detail=str(e))

    return {"mermaid_code": mermaid_code}


# ── Chat history ─────────────────────────────────────────────────────────────

@router.get("/{card_id}/messages", response_model=list[ChatMessageResponse])
async def get_messages(
    card_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    await _get_owned_card(card_id, current_user.id, db)
    result = await db.execute(
        select(ChatMessage)
        .where(ChatMessage.card_id == card_id)
        .order_by(ChatMessage.created_at)
    )
    return result.scalars().all()


# ── Helpers ───────────────────────────────────────────────────────────────────

async def _assert_owns_document(doc_id: int, user_id: int, db: AsyncSession):
    result = await db.execute(
        select(Document).where(Document.id == doc_id, Document.user_id == user_id)
    )
    if not result.scalar_one_or_none():
        raise HTTPException(status_code=404, detail="Document not found")


async def _get_owned_card(card_id: int, user_id: int, db: AsyncSession) -> ContextCard:
    result = await db.execute(
        select(ContextCard)
        .join(Document, ContextCard.document_id == Document.id)
        .where(ContextCard.id == card_id, Document.user_id == user_id)
    )
    card = result.scalar_one_or_none()
    if not card:
        raise HTTPException(status_code=404, detail="Card not found")
    return card
