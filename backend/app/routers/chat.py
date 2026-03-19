import json
import logging

from fastapi import APIRouter, WebSocket, WebSocketDisconnect, Depends, Query
from jose import JWTError, jwt
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from app.config import settings
from app.database import AsyncSessionLocal
from app.models import ContextCard, Document, ChatMessage
from app.services.chat_service import stream_chat_response
from app.utils.db_retry import with_retry

logger = logging.getLogger(__name__)

router = APIRouter(tags=["chat"])


@router.websocket("/ws/cards/{card_id}/chat")
async def websocket_chat(
    websocket: WebSocket,
    card_id: int,
    token: str = Query(...),
):
    """
    WebSocket endpoint for per-card streaming chat.

    Protocol:
      Client → server: JSON  {"message": "user text"}
      Server → client: plain text chunks (tokens as they arrive)
      Server → client: JSON  {"done": true}  when complete
      Server → client: JSON  {"error": "msg"}  on failure
    """
    await websocket.accept()

    # ── Auth via query-param token ────────────────────────────────────────────
    user_id = await _authenticate(websocket, token)
    if user_id is None:
        return

    async with AsyncSessionLocal() as db:
        # ── Verify card ownership ─────────────────────────────────────────────
        card = await _get_owned_card(card_id, user_id, db)
        if card is None:
            await websocket.send_text(json.dumps({"error": "Card not found"}))
            await websocket.close()
            return

        try:
            while True:
                raw = await websocket.receive_text()
                data = json.loads(raw)
                user_message = data.get("message", "").strip()

                if not user_message:
                    await websocket.send_text(json.dumps({"error": "Empty message"}))
                    continue

                # Save user message
                await _save_message(db, card_id, "user", user_message)

                # Build history (last 10 exchanges to keep context manageable)
                history = await _get_history(db, card_id, limit=20)

                # Stream response
                full_response = ""
                async for chunk in stream_chat_response(card.summary, history, user_message):
                    full_response += chunk
                    await websocket.send_text(chunk)

                # Signal completion
                await websocket.send_text(json.dumps({"done": True}))

                # Save assistant message
                await _save_message(db, card_id, "assistant", full_response)

        except WebSocketDisconnect:
            logger.info("WebSocket disconnected for card %d", card_id)
        except Exception as exc:
            logger.exception("WebSocket error for card %d", card_id)
            try:
                await websocket.send_text(json.dumps({"error": str(exc)}))
            except Exception:
                pass


# ── Helpers ───────────────────────────────────────────────────────────────────

async def _authenticate(websocket: WebSocket, token: str) -> int | None:
    try:
        payload = jwt.decode(token, settings.SECRET_KEY, algorithms=[settings.ALGORITHM])
        username: str = payload.get("sub")
        if not username:
            raise ValueError("No subject in token")

        async with AsyncSessionLocal() as db:
            from app.models import User
            result = await db.execute(select(User).where(User.username == username))
            user = result.scalar_one_or_none()
            if not user:
                raise ValueError("User not found")
            return user.id

    except (JWTError, ValueError) as e:
        await websocket.send_text(json.dumps({"error": f"Unauthorized: {e}"}))
        await websocket.close(code=1008)
        return None


async def _get_owned_card(
    card_id: int, user_id: int, db: AsyncSession
) -> ContextCard | None:
    result = await db.execute(
        select(ContextCard)
        .join(Document, ContextCard.document_id == Document.id)
        .where(ContextCard.id == card_id, Document.user_id == user_id)
    )
    return result.scalar_one_or_none()


async def _save_message(db: AsyncSession, card_id: int, role: str, content: str):
    async def _insert():
        db.add(ChatMessage(card_id=card_id, role=role, content=content))
        await db.commit()

    await with_retry(_insert)


async def _get_history(db: AsyncSession, card_id: int, limit: int = 20) -> list[dict]:
    result = await db.execute(
        select(ChatMessage)
        .where(ChatMessage.card_id == card_id)
        .order_by(ChatMessage.created_at.desc())
        .limit(limit)
    )
    messages = list(reversed(result.scalars().all()))
    return [{"role": m.role, "content": m.content} for m in messages]
