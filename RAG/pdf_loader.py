# rainbow_yu LLM.pdf_loader.py 🐋✨
# Date : 2025/12/25 13:15

import fitz  # pymupdf
import re

def load_pdf_text(pdf_path: str) -> str:
    doc = fitz.open(pdf_path)
    pages = []

    for page in doc:
        text = page.get_text("text")
        text = clean_text(text)
        pages.append(text)

    return "\n".join(pages)


def clean_text(text: str) -> str:
    """简单清洗：去多余空行、页码"""
    text = re.sub(r"\n{3,}", "\n\n", text)
    text = re.sub(r"^\s*\d+\s*$", "", text, flags=re.MULTILINE)
    return text.strip()
