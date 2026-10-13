
from dataclasses import dataclass, asdict


@dataclass
class TextChunk:
    chunk_id: str
    chunk_index: int
    content: str
    start_char: int
    end_char: int


def split_text(
    text: str,
    document_id: str,
    chunk_size: int = 500,
    chunk_overlap: int = 100,
) -> list[dict]:
    """
    Split text into overlapping chunks.

    Offsets refer to character positions in the extracted text.
    """

    if chunk_size <= 0:
        raise ValueError("chunk_size must be positive")

    if chunk_overlap < 0 or chunk_overlap >= chunk_size:
        raise ValueError(
            "chunk_overlap must be >= 0 and smaller than chunk_size"
        )

    if not text or not text.strip():
        return []

    chunks = []
    text_length = len(text)
    start = 0
    index = 0

    while start < text_length:
        end = min(start + chunk_size, text_length)

        # Prefer ending at a whitespace boundary when possible.
        if end < text_length:
            segment = text[start:end]
            boundary = max(
                segment.rfind("\n"),
                segment.rfind(" "),
            )

            if boundary >= chunk_size // 2:
                end = start + boundary + 1

        content = text[start:end]

        if content.strip():
            chunk = TextChunk(
                chunk_id=f"{document_id}-{index}",
                chunk_index=index,
                content=content,
                start_char=start,
                end_char=end,
            )
            chunks.append(asdict(chunk))
            index += 1

        if end >= text_length:
            break

        start = max(start + 1, end - chunk_overlap)

    return chunks
