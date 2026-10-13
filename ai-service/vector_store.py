
from pathlib import Path
from uuid import NAMESPACE_URL, uuid5

from qdrant_client import QdrantClient, models

from embeddings import embed_documents, embed_query

COLLECTION_NAME = "enterprise_documents"
VECTOR_SIZE = 384

DATA_DIR = Path(__file__).resolve().parent / "data" / "qdrant"


class VectorStore:
    def __init__(self, path: Path = DATA_DIR):
        path.mkdir(parents=True, exist_ok=True)

        self.client = QdrantClient(path=str(path))
        self.collection = COLLECTION_NAME

        if not self.client.collection_exists(self.collection):
            self.client.create_collection(
                collection_name=self.collection,
                vectors_config=models.VectorParams(
                    size=VECTOR_SIZE,
                    distance=models.Distance.COSINE,
                ),
            )

    def add_chunks(
        self,
        document_id: str,
        filename: str,
        chunks: list[dict],
    ) -> int:
        if not document_id.strip():
            raise ValueError("Document ID cannot be empty")

        if not chunks:
            return 0

        vectors = embed_documents([
            chunk["content"] for chunk in chunks
        ])

        points = []

        for chunk, vector in zip(chunks, vectors):
            point_id = str(uuid5(
                NAMESPACE_URL,
                f"{document_id}:{chunk['chunk_index']}",
            ))

            points.append(
                models.PointStruct(
                    id=point_id,
                    vector=vector.tolist(),
                    payload={
                        "document_id": document_id,
                        "filename": filename,
                        "chunk_index": chunk["chunk_index"],
                        "content": chunk["content"],
                        "start_char": chunk["start_char"],
                        "end_char": chunk["end_char"],
                    },
                )
            )

        self.client.upsert(
            collection_name=self.collection,
            points=points,
        )

        return len(points)

    def search(self, query: str, limit: int = 5) -> list[dict]:
        if not query.strip():
            raise ValueError("Query cannot be empty")

        if limit < 1:
            raise ValueError("Limit must be positive")

        query_vector = embed_query(query)

        response = self.client.query_points(
            collection_name=self.collection,
            query=query_vector.tolist(),
            limit=limit,
            with_payload=True,
        )

        return [
            {
                "score": point.score,
                "point_id": str(point.id),
                **(point.payload or {}),
            }
            for point in response.points
        ]

    def delete_document(self, document_id: str) -> None:
        self.client.delete(
            collection_name=self.collection,
            points_selector=models.FilterSelector(
                filter=models.Filter(
                    must=[
                        models.FieldCondition(
                            key="document_id",
                            match=models.MatchValue(
                                value=document_id
                            ),
                        )
                    ]
                )
            ),
        )

    def count(self) -> int:
        return self.client.count(
            collection_name=self.collection,
            exact=True,
        ).count

    def close(self) -> None:
        self.client.close()
