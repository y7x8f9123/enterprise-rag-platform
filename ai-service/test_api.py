import unittest
from unittest.mock import patch

from fastapi.testclient import TestClient

import main


class FakeVectorStore:
    instances = []

    def __init__(self):
        self.closed = False
        self.index_calls = []
        self.search_calls = []
        self.delete_calls = []
        self.__class__.instances.append(self)

    def replace_document(self, document_id, filename, chunks):
        self.index_calls.append((document_id, filename, chunks))
        return len(chunks)

    def search(self, query, limit):
        self.search_calls.append((query, limit))
        return [{
            "score": 0.91,
            "document_id": "external-42",
            "filename": "handbook.txt",
            "chunk_index": 0,
            "content": "Annual leave is requested in the HR portal.",
            "start_char": 0,
            "end_char": 47,
        }]

    def delete_document(self, document_id):
        self.delete_calls.append(document_id)

    def close(self):
        self.closed = True


class ApiTests(unittest.TestCase):
    def setUp(self):
        FakeVectorStore.instances.clear()
        self.store_patch = patch.object(main, "VectorStore", FakeVectorStore)
        self.store_patch.start()
        self.client_context = TestClient(main.app)
        self.client = self.client_context.__enter__()

    def tearDown(self):
        self.client_context.__exit__(None, None, None)
        self.store_patch.stop()

    def test_health_and_parse_are_preserved(self):
        health = self.client.get("/api/health")
        self.assertEqual(health.status_code, 200)
        self.assertEqual(health.json()["status"], "UP")

        parsed = self.client.post(
            "/api/documents/parse",
            files={"file": ("note.txt", b"hello world", "text/plain")},
        )
        self.assertEqual(parsed.status_code, 200)
        self.assertEqual(parsed.json()["status"], "PARSED")

    def test_index_accepts_external_document_id(self):
        response = self.client.post(
            "/api/documents/index",
            data={"document_id": "external-42"},
            files={
                "file": (
                    "handbook.txt",
                    b"Annual leave is requested in the HR portal.",
                    "text/plain",
                )
            },
        )

        self.assertEqual(response.status_code, 200)
        payload = response.json()
        self.assertEqual(payload["document_id"], "external-42")
        self.assertEqual(payload["status"], "INDEXED")
        self.assertEqual(payload["indexed_chunks"], 1)
        self.assertEqual(
            FakeVectorStore.instances[0].index_calls[0][0],
            "external-42",
        )

    def test_search_response_contract(self):
        response = self.client.post(
            "/api/search",
            json={"query": "vacation request", "limit": 3},
        )

        self.assertEqual(response.status_code, 200)
        result = response.json()["results"][0]
        self.assertEqual(
            set(result),
            {
                "score",
                "document_id",
                "filename",
                "chunk_index",
                "content",
                "start_char",
                "end_char",
            },
        )

    def test_blank_external_document_id_is_rejected(self):
        response = self.client.post(
            "/api/documents/index",
            data={"document_id": "   "},
            files={"file": ("note.txt", b"hello", "text/plain")},
        )
        self.assertEqual(response.status_code, 422)

    def test_blank_search_is_rejected(self):
        response = self.client.post(
            "/api/search",
            json={"query": "   "},
        )
        self.assertEqual(response.status_code, 422)

    def test_delete_document_index(self):
        document_id = "550e8400-e29b-41d4-a716-446655440000.txt"
        response = self.client.delete(
            f"/api/documents/{document_id}/index"
        )

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json(), {
            "status": "DELETED",
            "document_id": document_id,
        })
        self.assertEqual(
            FakeVectorStore.instances[0].delete_calls,
            [document_id],
        )

    def test_delete_rejects_path_like_document_id(self):
        response = self.client.delete(
            "/api/documents/not-a-valid-id.txt/index"
        )
        self.assertEqual(response.status_code, 422)

    def test_delete_reports_vector_store_failure(self):
        document_id = "550e8400-e29b-41d4-a716-446655440000.txt"
        store = FakeVectorStore.instances[0]
        with patch.object(
            store,
            "delete_document",
            side_effect=RuntimeError("simulated failure"),
        ):
            response = self.client.delete(
                f"/api/documents/{document_id}/index"
            )

        self.assertEqual(response.status_code, 503)
        self.assertEqual(
            response.json()["detail"],
            "Vector deletion was not completed",
        )

    def test_lifespan_closes_store(self):
        store = FakeVectorStore.instances[0]
        self.assertFalse(store.closed)
        self.client_context.__exit__(None, None, None)
        self.assertTrue(store.closed)
        self.client_context = TestClient(main.app)
        self.client = self.client_context.__enter__()


if __name__ == "__main__":
    unittest.main()
