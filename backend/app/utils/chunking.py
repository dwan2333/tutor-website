def estimate_tokens(text: str) -> int:
    return len(text) // 4


def chunk_text(text: str, max_tokens: int = 800) -> list[dict]:
    """Split text into chunks, breaking on paragraph boundaries where possible."""
    chunks = []
    paragraphs = text.split("\n\n")
    current = ""
    index = 0

    for para in paragraphs:
        if estimate_tokens(current + para) > max_tokens and current:
            chunks.append({"text": current.strip(), "chunk_index": index})
            index += 1
            current = para
        else:
            current = current + "\n\n" + para if current else para

    if current.strip():
        chunks.append({"text": current.strip(), "chunk_index": index})

    return chunks
