# rainbow_yu LLM.retriever.py 🐋✨
# Date : 2025/12/25 13:18
import faiss
import pickle
from embedding import Embedder

class Retriever:
    def __init__(self, index_path="index.faiss", meta_path="chunks.pkl"):
        self.index = faiss.read_index(index_path)
        with open(meta_path, "rb") as f:
            self.chunks = pickle.load(f)
        self.embedder = Embedder()

    def search(self, query: str, top_k=5):
        q_vec = self.embedder.encode([query])
        scores, ids = self.index.search(q_vec, top_k)

        results = []
        for score, idx in zip(scores[0], ids[0]):
            results.append({
                "score": float(score),
                "text": self.chunks[idx]
            })
        return results
