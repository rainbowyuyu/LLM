# rainbow_yu LLM.rag.py 🐋✨
# Date : 2025/12/25 13:18
from retriever import Retriever

def build_prompt(query, contexts):
    context_text = "\n\n".join(
        [f"[资料{i+1}]\n{c['text']}" for i, c in enumerate(contexts)]
    )

    return f"""
你是一个严谨的助手。
请严格基于以下资料回答问题，不要编造。

{context_text}

问题：{query}
""".strip()


def rag_answer(query):
    retriever = Retriever()
    contexts = retriever.search(query, top_k=4)
    prompt = build_prompt(query, contexts)

    # 这里接你自己的大模型（如 Ollama / Qwen / DeepSeek）
    print("=== RAG Prompt ===")
    print(prompt)
