import asyncio
import logging
from collections.abc import AsyncIterator

import anthropic

from app.config import settings

logger = logging.getLogger(__name__)

_client: anthropic.Anthropic | None = None


def _get_client() -> anthropic.Anthropic:
    global _client
    if _client is None:
        _client = anthropic.Anthropic(api_key=settings.ANTHROPIC_API_KEY)
    return _client


def _build_system_prompt(card_summary: str) -> str:
    return (
        "You are a helpful tutor assistant. Answer the user's question based on "
        "the following concept card content. Be clear, educational, and concise.\n\n"
        f"Concept Card:\n{card_summary}"
    )


async def stream_chat_response(
    card_summary: str,
    history: list[dict],
    user_message: str,
) -> AsyncIterator[str]:
    """
    Async generator — yields text delta strings as Claude produces them.
    Runs the blocking Anthropic stream in a thread so the event loop stays free.
    """
    messages = history + [{"role": "user", "content": user_message}]
    system = _build_system_prompt(card_summary)

    # Queue bridges the sync stream thread → async generator
    queue: asyncio.Queue[str | None] = asyncio.Queue()
    loop = asyncio.get_event_loop()

    def _stream_in_thread():
        try:
            with _get_client().messages.stream(
                model="claude-3-5-haiku-20241022",
                max_tokens=800,
                system=system,
                messages=messages,
            ) as stream:
                for text in stream.text_stream:
                    loop.call_soon_threadsafe(queue.put_nowait, text)
        except Exception as exc:
            logger.exception("Streaming error")
            loop.call_soon_threadsafe(queue.put_nowait, f"\n\n[Error: {exc}]")
        finally:
            loop.call_soon_threadsafe(queue.put_nowait, None)  # sentinel

    asyncio.get_event_loop().run_in_executor(None, _stream_in_thread)

    while True:
        chunk = await queue.get()
        if chunk is None:
            break
        yield chunk
