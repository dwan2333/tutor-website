import asyncio
import logging

import anthropic

from app.config import settings

logger = logging.getLogger(__name__)

_client: anthropic.Anthropic | None = None

VALID_STARTS = (
    "graph ", "flowchart ", "sequenceDiagram", "mindmap",
    "classDiagram", "erDiagram", "gantt", "pie",
)

DIAGRAM_PROMPTS = {
    "concept_map": (
        "Create a Mermaid.js mindmap diagram showing the key concepts and their "
        "relationships from this text. Use mindmap syntax. "
        "Reply with ONLY the raw Mermaid code — no code fences, no explanation."
    ),
    "flowchart": (
        "Create a Mermaid.js flowchart (use 'flowchart TD') showing the main process "
        "or logical flow described in this text. "
        "Reply with ONLY the raw Mermaid code — no code fences, no explanation."
    ),
    "sequence": (
        "Create a Mermaid.js sequence diagram showing the key interactions or steps "
        "described in this text. Start with 'sequenceDiagram'. "
        "Reply with ONLY the raw Mermaid code — no code fences, no explanation."
    ),
}

STRICT_SUFFIX = (
    "\n\nIMPORTANT: Output ONLY valid Mermaid syntax. "
    "Do not use parentheses inside node labels. "
    "Do not include markdown code fences. "
    "Start directly with the diagram type keyword."
)


def _get_client() -> anthropic.Anthropic:
    global _client
    if _client is None:
        _client = anthropic.Anthropic(api_key=settings.ANTHROPIC_API_KEY)
    return _client


def _clean_mermaid(raw: str) -> str:
    """Strip code fences if Claude included them anyway."""
    raw = raw.strip()
    if raw.startswith("```"):
        lines = raw.splitlines()
        # drop first line (```mermaid or ```) and last line (```)
        inner = lines[1:-1] if lines[-1].strip() == "```" else lines[1:]
        raw = "\n".join(inner).strip()
    return raw


def _validate(code: str) -> bool:
    return any(code.strip().startswith(s) for s in VALID_STARTS)


def _call_claude(prompt: str, summary: str) -> str:
    msg = _get_client().messages.create(
        model="claude-3-5-haiku-20241022",
        max_tokens=700,
        messages=[{"role": "user", "content": f"{prompt}\n\nText:\n{summary}"}],
    )
    return msg.content[0].text.strip()


def _generate_diagram_sync(summary: str, diagram_type: str) -> str:
    """
    Try once with normal prompt; if validation fails retry with strict prompt.
    Raises ValueError if both attempts produce invalid Mermaid.
    """
    prompt = DIAGRAM_PROMPTS.get(diagram_type, DIAGRAM_PROMPTS["concept_map"])

    raw = _clean_mermaid(_call_claude(prompt, summary))
    if _validate(raw):
        return raw

    logger.warning("Mermaid validation failed on first attempt, retrying with strict prompt...")
    raw = _clean_mermaid(_call_claude(prompt + STRICT_SUFFIX, summary))
    if _validate(raw):
        return raw

    raise ValueError(
        f"Claude produced invalid Mermaid syntax after 2 attempts. "
        f"Preview: {raw[:120]}"
    )


async def generate_diagram(summary: str, diagram_type: str) -> str:
    """Async wrapper — offloads Claude call to thread pool."""
    return await asyncio.to_thread(_generate_diagram_sync, summary, diagram_type)
