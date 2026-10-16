
from functools import lru_cache
from typing import TYPE_CHECKING

import numpy as np

if TYPE_CHECKING:
    from sentence_transformers import SentenceTransformer

MODEL_NAME = "BAAI/bge-small-en-v1.5"


@lru_cache(maxsize=1)
def get_model() -> "SentenceTransformer":
    from sentence_transformers import SentenceTransformer

    print(f"Loading embedding model: {MODEL_NAME}")

    return SentenceTransformer(
        MODEL_NAME,
        device="cpu",
    )


def embed_documents(texts: list[str]) -> np.ndarray:
    if not texts:
        raise ValueError("texts cannot be empty")

    model = get_model()

    return model.encode(
        texts,
        batch_size=16,
        normalize_embeddings=True,
        convert_to_numpy=True,
        show_progress_bar=False,
    )


def embed_query(query: str) -> np.ndarray:
    if not query.strip():
        raise ValueError("query cannot be empty")

    model = get_model()

    # BGE recommends a retrieval instruction for queries.
    instruction = (
        "Represent this sentence for searching relevant passages: "
    )

    return model.encode(
        instruction + query,
        normalize_embeddings=True,
        convert_to_numpy=True,
        show_progress_bar=False,
    )


def cosine_similarity(
    vector_a: np.ndarray,
    vector_b: np.ndarray,
) -> float:
    return float(
        np.dot(vector_a, vector_b)
        / (
            np.linalg.norm(vector_a)
            * np.linalg.norm(vector_b)
        )
    )
