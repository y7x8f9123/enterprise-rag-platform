import os
from pathlib import Path
from threading import RLock
from uuid import NAMESPACE_URL, uuid4, uuid5

import portalocker
from qdrant_client import QdrantClient, models

from embeddings import embed_documents, embed_query

COLLECTION_NAME = "enterprise_documents"
VECTOR_SIZE = 384

DEFAULT_DATA_DIR = Path(__file__).resolve().parent / "data" / "qdrant"
DATA_DIR = Path(
    os.environ.get("ENTERPRISEMIND_QDRANT_PATH", DEFAULT_DATA_DIR)
).expanduser()


class VectorStore:
    """Thread-safe owner of one persistent Qdrant Local client.

    Qdrant Local permits only one client process per storage directory. The
    client is therefore intended to be created once during application startup
    and closed during application shutdown. Run the API with one worker only.
    """

    def __init__(self, path: Path | str = DATA_DIR):
        self.path = Path(path).resolve()
        self.path.mkdir(parents=True, exist_ok=True)
        self.collection = COLLECTION_NAME
        self._client_lock = RLock()
        self._write_lock = RLock()
        self._closed = False
        self._directory_lock_acquired = False
        self._directory_lock = open(
            self.path / ".enterprisemind.lock",
            "a+",
            encoding="utf-8",
        )

        try:
            # Acquire our lock before Qdrant loads collection SQLite files.
            # Qdrant's own lock is acquired later in its startup sequence,
            # which is too late to avoid transient Windows file handles when
            # a second process points at the same directory.
            portalocker.lock(
                self._directory_lock,
                portalocker.LockFlags.EXCLUSIVE
                | portalocker.LockFlags.NON_BLOCKING,
            )
            self._directory_lock_acquired = True
            # FastAPI executes synchronous work on worker threads. Every client
            # access is serialized by _client_lock, so disabling SQLite's
            # same-thread check is safe here.
            self.client = QdrantClient(
                path=str(self.path),
                force_disable_check_same_thread=True,
            )

            if not self.client.collection_exists(self.collection):
                self.client.create_collection(
                    collection_name=self.collection,
                    vectors_config=models.VectorParams(
                        size=VECTOR_SIZE,
                        distance=models.Distance.COSINE,
                    ),
                )
        except Exception as exception:
            client = getattr(self, "client", None)
            if client is not None:
                client.close()
            if self._directory_lock_acquired:
                portalocker.unlock(self._directory_lock)
            self._directory_lock.close()
            if isinstance(exception, portalocker.exceptions.LockException):
                raise RuntimeError(
                    f"Qdrant storage directory is already in use: {self.path}. "
                    "Run one local API worker or use Qdrant Server."
                ) from exception
            raise

    @staticmethod
    def _document_filter(
        document_id: str,
        generation: str | None = None,
        exclude_generation: bool = False,
        active: bool | None = None,
    ) -> models.Filter:
        must: list = [
            models.FieldCondition(
                key="document_id",
                match=models.MatchValue(value=document_id),
            )
        ]
        must_not: list = []

        if generation is not None:
            generation_condition = models.FieldCondition(
                key="index_generation",
                match=models.MatchValue(value=generation),
            )
            if exclude_generation:
                must_not.append(generation_condition)
            else:
                must.append(generation_condition)

        if active is not None:
            must.append(
                models.FieldCondition(
                    key="active",
                    match=models.MatchValue(value=active),
                )
            )

        return models.Filter(
            must=must,
            must_not=must_not or None,
        )

    @staticmethod
    def _searchable_filter() -> models.Filter:
        # Points created by older versions have no `active` field and remain
        # searchable until that document is re-indexed.
        return models.Filter(
            should=[
                models.FieldCondition(
                    key="active",
                    match=models.MatchValue(value=True),
                ),
                models.IsEmptyCondition(
                    is_empty=models.PayloadField(key="active")
                ),
            ]
        )

    def replace_document(
        self,
        document_id: str,
        filename: str,
        chunks: list[dict],
    ) -> int:
        """Replace all indexed chunks for a document as one guarded operation.

        New points are staged as inactive before the old generation is hidden.
        If a Qdrant operation fails, the method makes a best-effort rollback to
        the prior searchable generation and removes the staged generation.
        """

        document_id = document_id.strip()
        if not document_id:
            raise ValueError("Document ID cannot be empty")
        if not chunks:
            raise ValueError("chunks cannot be empty")

        with self._write_lock:
            vectors = embed_documents([
                chunk["content"] for chunk in chunks
            ])

            if vectors.ndim != 2 or vectors.shape != (
                len(chunks), VECTOR_SIZE
            ):
                raise ValueError(
                    f"Embedding model must return {VECTOR_SIZE}-dimensional "
                    "vectors"
                )

            generation = str(uuid4())
            new_filter = self._document_filter(
                document_id,
                generation=generation,
            )
            old_filter = self._document_filter(
                document_id,
                generation=generation,
                exclude_generation=True,
            )
            stale_filter = self._document_filter(
                document_id,
                active=False,
            )

            points = []
            for chunk, vector in zip(chunks, vectors):
                point_id = str(uuid5(
                    NAMESPACE_URL,
                    f"{document_id}:{generation}:{chunk['chunk_index']}",
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
                            "index_generation": generation,
                            "active": False,
                        },
                    )
                )

            with self._client_lock:
                staged = False
                old_hidden = False
                try:
                    # Remove debris from a previously interrupted replacement.
                    # These points are inactive and never returned by search.
                    self.client.delete(
                        collection_name=self.collection,
                        points_selector=models.FilterSelector(
                            filter=stale_filter
                        ),
                        wait=True,
                    )
                    # Mark as staged before the call so a partially applied
                    # client failure is also cleaned up.
                    staged = True
                    self.client.upsert(
                        collection_name=self.collection,
                        points=points,
                        wait=True,
                    )

                    # Activate the complete new generation first. Searches are
                    # blocked by _client_lock during the switch; if the process
                    # crashes here, restart may briefly see both generations,
                    # but it will not lose the prior searchable data.
                    self.client.set_payload(
                        collection_name=self.collection,
                        payload={"active": True},
                        points=new_filter,
                        wait=True,
                    )
                    # Mark before the call so a partially applied failure is
                    # included in the rollback path.
                    old_hidden = True
                    self.client.set_payload(
                        collection_name=self.collection,
                        payload={"active": False},
                        points=old_filter,
                        wait=True,
                    )
                    self.client.delete(
                        collection_name=self.collection,
                        points_selector=models.FilterSelector(
                            filter=old_filter
                        ),
                        wait=True,
                    )
                except Exception:
                    # Keep the original exception. Rollback is deliberately
                    # best-effort because storage failures can also affect it.
                    if old_hidden:
                        try:
                            self.client.set_payload(
                                collection_name=self.collection,
                                payload={"active": True},
                                points=old_filter,
                                wait=True,
                            )
                        except Exception:
                            pass
                    if staged:
                        try:
                            self.client.delete(
                                collection_name=self.collection,
                                points_selector=models.FilterSelector(
                                    filter=new_filter
                                ),
                                wait=True,
                            )
                        except Exception:
                            pass
                    raise

        return len(points)

    # Keep the old method name for local scripts and callers.
    def add_chunks(
        self,
        document_id: str,
        filename: str,
        chunks: list[dict],
    ) -> int:
        return self.replace_document(document_id, filename, chunks)

    def search(self, query: str, limit: int = 5) -> list[dict]:
        if not query.strip():
            raise ValueError("Query cannot be empty")
        if limit < 1 or limit > 100:
            raise ValueError("Limit must be between 1 and 100")

        query_vector = embed_query(query)
        if query_vector.ndim != 1 or query_vector.shape[0] != VECTOR_SIZE:
            raise ValueError(
                f"Embedding model must return a {VECTOR_SIZE}-dimensional vector"
            )

        with self._client_lock:
            response = self.client.query_points(
                collection_name=self.collection,
                query=query_vector.tolist(),
                query_filter=self._searchable_filter(),
                limit=limit,
                with_payload=True,
            )

        results = []
        for point in response.points:
            payload = point.payload or {}
            results.append({
                "score": float(point.score),
                "document_id": payload.get("document_id", ""),
                "filename": payload.get("filename", ""),
                "chunk_index": payload.get("chunk_index", 0),
                "content": payload.get("content", ""),
                "start_char": payload.get("start_char", 0),
                "end_char": payload.get("end_char", 0),
            })
        return results

    def delete_document(self, document_id: str) -> None:
        if not document_id.strip():
            raise ValueError("Document ID cannot be empty")
        with self._write_lock, self._client_lock:
            self.client.delete(
                collection_name=self.collection,
                points_selector=models.FilterSelector(
                    filter=self._document_filter(document_id)
                ),
                wait=True,
            )

    def count(self) -> int:
        with self._client_lock:
            return self.client.count(
                collection_name=self.collection,
                exact=True,
            ).count

    def close(self) -> None:
        with self._write_lock, self._client_lock:
            if not self._closed:
                self.client.close()
                if self._directory_lock_acquired:
                    portalocker.unlock(self._directory_lock)
                    self._directory_lock_acquired = False
                self._directory_lock.close()
                self._closed = True
