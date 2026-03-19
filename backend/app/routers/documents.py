import logging
import os
from pathlib import Path

from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, BackgroundTasks, status
from fastapi.responses import Response
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from app.config import settings
from app.database import get_db, AsyncSessionLocal
from app.models import User, Document, ContextCard
from app.schemas import DocumentResponse, PageSelectionUpdate, GenerateCardsRequest
from app.services import pdf_service
from app.utils.auth import get_current_user
from app.utils.db_retry import with_retry

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/documents", tags=["documents"])

MAX_BYTES = settings.MAX_UPLOAD_SIZE_MB * 1024 * 1024


# ── Upload ───────────────────────────────────────────────────────────────────

@router.post("/upload", response_model=DocumentResponse, status_code=status.HTTP_201_CREATED)
async def upload_document(
    file: UploadFile = File(...),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    if not file.filename.lower().endswith(".pdf"):
        raise HTTPException(status_code=400, detail="Only PDF files are accepted")

    file_bytes = await file.read()
    if len(file_bytes) > MAX_BYTES:
        raise HTTPException(
            status_code=413,
            detail=f"File too large. Max size is {settings.MAX_UPLOAD_SIZE_MB} MB",
        )

    stored_name, file_path = await pdf_service.save_upload(file_bytes, file.filename)
    page_count = await pdf_service.get_page_count(file_path)

    doc = Document(
        user_id=current_user.id,
        filename=stored_name,
        original_name=file.filename,
        page_count=page_count,
        status="uploaded",
    )
    db.add(doc)
    await db.commit()
    await db.refresh(doc)
    return doc


# ── List / Get / Delete ──────────────────────────────────────────────────────

@router.get("/", response_model=list[DocumentResponse])
async def list_documents(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    result = await db.execute(
        select(Document)
        .where(Document.user_id == current_user.id)
        .order_by(Document.created_at.desc())
    )
    return result.scalars().all()


@router.get("/{doc_id}", response_model=DocumentResponse)
async def get_document(
    doc_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    doc = await _get_owned_doc(doc_id, current_user.id, db)
    return doc


@router.delete("/{doc_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_document(
    doc_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    doc = await _get_owned_doc(doc_id, current_user.id, db)

    # Remove file from disk
    file_path = Path(settings.UPLOAD_DIR) / doc.filename
    if file_path.exists():
        os.remove(file_path)

    await db.delete(doc)
    await db.commit()


# ── Page selection ───────────────────────────────────────────────────────────

@router.put("/{doc_id}/pages", response_model=DocumentResponse)
async def update_pages(
    doc_id: int,
    payload: PageSelectionUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    doc = await _get_owned_doc(doc_id, current_user.id, db)

    if payload.start_page < 1 or payload.end_page > doc.page_count:
        raise HTTPException(
            status_code=400,
            detail=f"Page range must be between 1 and {doc.page_count}",
        )
    if payload.start_page > payload.end_page:
        raise HTTPException(status_code=400, detail="start_page must be ≤ end_page")

    doc.selected_start = payload.start_page
    doc.selected_end = payload.end_page
    await db.commit()
    await db.refresh(doc)
    return doc


# ── Thumbnail ────────────────────────────────────────────────────────────────

@router.get("/{doc_id}/thumbnail/{page_num}")
async def get_thumbnail(
    doc_id: int,
    page_num: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    doc = await _get_owned_doc(doc_id, current_user.id, db)

    if page_num < 1 or page_num > doc.page_count:
        raise HTTPException(status_code=400, detail="Invalid page number")

    file_path = str(Path(settings.UPLOAD_DIR) / doc.filename)
    png_bytes = await pdf_service.get_page_thumbnail(file_path, page_num)
    return Response(content=png_bytes, media_type="image/png")


# ── Status ───────────────────────────────────────────────────────────────────

@router.get("/{doc_id}/status")
async def get_status(
    doc_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    doc = await _get_owned_doc(doc_id, current_user.id, db)
    return {"status": doc.status, "error_message": doc.error_message}


# ── Generate cards (Phase 5) — stub for now ──────────────────────────────────

@router.post("/generate-cards")
async def generate_cards(
    payload: GenerateCardsRequest,
    background_tasks: BackgroundTasks,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    doc = await _get_owned_doc(payload.document_id, current_user.id, db)

    if not doc.selected_start or not doc.selected_end:
        raise HTTPException(status_code=400, detail="Select a page range first")

    if doc.status == "processing":
        raise HTTPException(status_code=409, detail="Already processing")

    doc.status = "processing"
    doc.error_message = None
    await db.commit()

    background_tasks.add_task(
        _run_card_generation,
        doc.id,
        str(Path(settings.UPLOAD_DIR) / doc.filename),
        doc.selected_start,
        doc.selected_end,
    )
    return {"message": "Processing started", "document_id": doc.id}


# ── Background task ──────────────────────────────────────────────────────────

async def _run_card_generation(
    doc_id: int,
    file_path: str,
    start_page: int,
    end_page: int,
):
    """
    Runs as a FastAPI BackgroundTask.
    Fully wrapped in try/except — any failure sets status='failed' + error_message.
    """
    from app.services.summarizer import process_document_pages

    async with AsyncSessionLocal() as db:
        try:
            cards_data = await process_document_pages(file_path, start_page, end_page)

            async def _insert_cards():
                result = await db.execute(select(Document).where(Document.id == doc_id))
                doc = result.scalar_one()
                for card_dict in cards_data:
                    db.add(ContextCard(document_id=doc_id, **card_dict))
                doc.status = "done"
                await db.commit()

            await with_retry(_insert_cards)
            logger.info("Card generation complete for document %d (%d cards)", doc_id, len(cards_data))

        except Exception as exc:
            logger.exception("Card generation failed for document %d", doc_id)
            try:
                async def _mark_failed():
                    result = await db.execute(select(Document).where(Document.id == doc_id))
                    doc = result.scalar_one()
                    doc.status = "failed"
                    doc.error_message = str(exc)
                    await db.commit()

                await with_retry(_mark_failed)
            except Exception:
                logger.exception("Could not update failure status for document %d", doc_id)


# ── Helper ───────────────────────────────────────────────────────────────────

async def _get_owned_doc(doc_id: int, user_id: int, db: AsyncSession) -> Document:
    result = await db.execute(
        select(Document).where(Document.id == doc_id, Document.user_id == user_id)
    )
    doc = result.scalar_one_or_none()
    if not doc:
        raise HTTPException(status_code=404, detail="Document not found")
    return doc
