# rainbow_yu LLM.embedding.py 🐋✨
# Date : 2025/12/25 13:17

from sentence_transformers import SentenceTransformer

class Embedder:
    def __init__(self):
        self.model = SentenceTransformer("moka-ai/m3e-base")

    def encode(self, texts):
        return self.model.encode(
            texts,
            normalize_embeddings=True,
            show_progress_bar=True
        )
