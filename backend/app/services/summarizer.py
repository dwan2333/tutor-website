import asyncio
import logging

import anthropic

from app.config import settings

logger = logging.getLogger(__name__)

_client: anthropic.Anthropic | None = None


def _get_client() -> anthropic.Anthropic:
    global _client
    if _client is None:
        _client = anthropic.Anthropic(api_key=settings.ANTHROPIC_API_KEY)
    return _client


# ── Sync Claude calls (run via asyncio.to_thread) ───────────────────────────

def _generate_title(text: str) -> str:
    msg = _get_client().messages.create(
        model="claude-3-5-haiku-20241022",
        max_tokens=50,
        messages=[{
            "role": "user",
            "content": (
                "Give a concise 5-10 word title for this text. "
                "Reply with ONLY the title, no punctuation at the end:\n\n"
                + text[:600]
            ),
        }],
    )
    return msg.content[0].text.strip()


def _generate_summary(text: str) -> str:
    msg = _get_client().messages.create(
        model="claude-3-5-haiku-20241022",
        max_tokens=500,
        messages=[{
            "role": "user",
            "content": (
                "Summarize the following text as a clear, educational concept card. "
                "Use 3-5 bullet points. Be concise and informative:\n\n"
                + text
            ),
        }],
    )
    return msg.content[0].text.strip()


# ── Async wrappers ───────────────────────────────────────────────────────────

async def generate_title(text: str) -> str:
    return await asyncio.to_thread(_generate_title, text)


async def generate_summary(text: str) -> str:
    return await asyncio.to_thread(_generate_summary, text)


# ── Main processing pipeline ─────────────────────────────────────────────────

async def process_document_pages(
    file_path: str,
    start_page: int,
    end_page: int,
) -> list[dict]:
    """
    Extract pages, group into cards (~3 pages each), generate titles + summaries.
    Returns list of card dicts ready to insert into DB.
    """
    from app.services.pdf_service import extract_text_from_pages

    pages = await extract_text_from_pages(file_path, start_page, end_page)
    if not pages:
        raise ValueError("No extractable text found in the selected page range")

    GROUP_SIZE = 3
    groups = []
    for i in range(0, len(pages), GROUP_SIZE):
        group = pages[i:i + GROUP_SIZE]
        combined = "\n\n".join(p["text"] for p in group)
        groups.append({
            "text": combined[:4000],   # cap to keep tokens reasonable
            "page_start": group[0]["page_num"],
            "page_end": group[-1]["page_num"],
        })

    cards = []
    for idx, group in enumerate(groups):
        logger.info("Generating card %d/%d (pages %d-%d)...",
                    idx + 1, len(groups), group["page_start"], group["page_end"])

        title = await generate_title(group["text"])
        summary = await generate_summary(group["text"])

        cards.append({
            "title": title,
            "summary": summary,
            "page_range_start": group["page_start"],
            "page_range_end": group["page_end"],
            "order_index": idx,
            "model_used": "claude-3-5-haiku",
        })

    return cards
