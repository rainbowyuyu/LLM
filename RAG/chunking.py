# rainbow_yu LLM.chunking.py 🐋✨
# Date : 2025/12/25 13:17

import re
from typing import List

def split_paragraphs(text: str) -> List[str]:
    return [p.strip() for p in re.split(r"\n{2,}", text) if p.strip()]


def chunk_text(
    text: str,
    max_chars: int = 800,
    overlap: int = 150
) -> List[str]:
    paragraphs = split_paragraphs(text)
    chunks = []

    buf = ""
    for p in paragraphs:
        if len(buf) + len(p) <= max_chars:
            buf += p + "\n\n"
        else:
            chunks.append(buf.strip())
            buf = buf[-overlap:] + p + "\n\n"

    if buf.strip():
        chunks.append(buf.strip())

    return chunks
