import asyncio
import uuid
from pathlib import Path

import fitz  # PyMuPDF

from app.config import settings


def _get_page_count(file_path: str) -> int:
    doc = fitz.open(file_path)
    count = doc.page_count
    doc.close()
    return count


def _extract_text_from_pages(file_path: str, start_page: int, end_page: int) -> list[dict]:
    """Sync — returns [{page_num, text}, ...]. Called via asyncio.to_thread."""
    doc = fitz.open(file_path)
    pages = []
    for i in range(start_page - 1, min(end_page, doc.page_count)):
        page = doc[i]
        text = page.get_text("text")
        if text.strip():
            pages.append({"page_num": i + 1, "text": text.strip()})
    doc.close()
    return pages


def _get_page_thumbnail(file_path: str, page_num: int, width: int = 200) -> bytes:
    """Sync — returns PNG bytes. Called via asyncio.to_thread."""
    doc = fitz.open(file_path)
    page = doc[page_num - 1]
    mat = fitz.Matrix(width / page.rect.width, width / page.rect.width)
    pix = page.get_pixmap(matrix=mat)
    png_bytes = pix.tobytes("png")
    doc.close()
    return png_bytes


def _save_upload(file_bytes: bytes, original_name: str) -> tuple[str, str]:
    """Sync — saves file, returns (stored_filename, full_path)."""
    upload_dir = Path(settings.UPLOAD_DIR)
    upload_dir.mkdir(parents=True, exist_ok=True)
    ext = Path(original_name).suffix or ".pdf"
    stored_name = f"{uuid.uuid4().hex}{ext}"
    file_path = upload_dir / stored_name
    with open(file_path, "wb") as f:
        f.write(file_bytes)
    return stored_name, str(file_path)


# ── Async wrappers (offload CPU work to thread pool) ────────────────────────

async def get_page_count(file_path: str) -> int:
    return await asyncio.to_thread(_get_page_count, file_path)


async def extract_text_from_pages(file_path: str, start_page: int, end_page: int) -> list[dict]:
    return await asyncio.to_thread(_extract_text_from_pages, file_path, start_page, end_page)


async def get_page_thumbnail(file_path: str, page_num: int, width: int = 200) -> bytes:
    return await asyncio.to_thread(_get_page_thumbnail, file_path, page_num, width)


async def save_upload(file_bytes: bytes, original_name: str) -> tuple[str, str]:
    return await asyncio.to_thread(_save_upload, file_bytes, original_name)
