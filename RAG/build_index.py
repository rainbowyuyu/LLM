# rainbow_yu LLM.build_index.py 🐋✨
# Date : 2025/12/25 13:17
import faiss
import pickle
from embedding import Embedder

def build_index(chunks, index_path="index.faiss", meta_path="chunks.pkl"):
    embedder = Embedder()
    vectors = embedder.encode(chunks)

    dim = vectors.shape[1]
    index = faiss.IndexFlatIP(dim)
    index.add(vectors)

    faiss.write_index(index, index_path)
    with open(meta_path, "wb") as f:
        pickle.dump(chunks, f)

    print(f"✅ 索引完成，共 {len(chunks)} 个 chunk")
