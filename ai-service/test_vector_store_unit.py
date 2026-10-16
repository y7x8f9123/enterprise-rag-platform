import tempfile
import unittest
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path
from unittest.mock import patch

import numpy as np
from qdrant_client import models

import vector_store
from chunking import split_text


def document_vectors(texts):
    vectors = np.zeros((len(texts), vector_store.VECTOR_SIZE), dtype=float)
    for index in range(len(texts)):
        vectors[index, index % vector_store.VECTOR_SIZE] = 1.0
    return vectors


def query_vector(_query):
    result = np.zeros(vector_store.VECTOR_SIZE, dtype=float)
    result[0] = 1.0
    return result


class VectorStoreTests(unittest.TestCase):
    def setUp(self):
        self.temp_dir = tempfile.TemporaryDirectory()
        self.documents_patch = patch.object(
            vector_store,
            "embed_documents",
            side_effect=document_vectors,
        )
        self.query_patch = patch.object(
            vector_store,
            "embed_query",
            side_effect=query_vector,
        )
        self.documents_patch.start()
        self.query_patch.start()
        self.store = vector_store.VectorStore(Path(self.temp_dir.name))

    def tearDown(self):
        self.store.close()
        self.documents_patch.stop()
        self.query_patch.stop()
        self.temp_dir.cleanup()

    def test_reindex_removes_all_old_chunks(self):
        old_chunks = split_text("old " * 400, "same-id", 120, 20)
        new_chunks = split_text("new short document", "same-id", 120, 20)

        self.store.replace_document("same-id", "old.txt", old_chunks)
        self.assertGreater(self.store.count(), 1)
        self.store.replace_document("same-id", "new.txt", new_chunks)

        self.assertEqual(self.store.count(), 1)
        results = self.store.search("new", 10)
        self.assertEqual(len(results), 1)
        self.assertEqual(results[0]["filename"], "new.txt")
        self.assertEqual(results[0]["content"], "new short document")

    def test_second_client_cannot_share_local_directory(self):
        with self.assertRaises(RuntimeError):
            vector_store.VectorStore(Path(self.temp_dir.name))

    def test_failed_replacement_restores_previous_generation(self):
        old_chunks = split_text("old searchable content", "same-id")
        new_chunks = split_text("new content", "same-id")
        self.store.replace_document("same-id", "old.txt", old_chunks)

        original_delete = self.store.client.delete
        delete_calls = 0
        failed_once = False

        def fail_old_delete(*args, **kwargs):
            nonlocal delete_calls, failed_once
            delete_calls += 1
            if delete_calls == 2 and not failed_once:
                failed_once = True
                raise RuntimeError("simulated old-generation delete failure")
            return original_delete(*args, **kwargs)

        with patch.object(
            self.store.client,
            "delete",
            side_effect=fail_old_delete,
        ):
            with self.assertRaises(RuntimeError):
                self.store.replace_document(
                    "same-id",
                    "new.txt",
                    new_chunks,
                )

        results = self.store.search("old", 10)
        self.assertEqual(len(results), 1)
        self.assertEqual(results[0]["filename"], "old.txt")
        self.assertEqual(self.store.count(), 1)

    def test_legacy_points_without_active_flag_remain_searchable(self):
        self.store.client.upsert(
            collection_name=self.store.collection,
            points=[
                models.PointStruct(
                    id=1,
                    vector=query_vector("legacy").tolist(),
                    payload={
                        "document_id": "legacy",
                        "filename": "legacy.txt",
                        "chunk_index": 0,
                        "content": "legacy content",
                        "start_char": 0,
                        "end_char": 14,
                    },
                )
            ],
            wait=True,
        )

        results = self.store.search("legacy", 10)
        self.assertEqual(len(results), 1)
        self.assertEqual(results[0]["document_id"], "legacy")

    def test_concurrent_reindex_leaves_one_complete_generation(self):
        first = split_text("first version", "same-id")
        second = split_text("second version", "same-id")

        with ThreadPoolExecutor(max_workers=2) as executor:
            futures = [
                executor.submit(
                    self.store.replace_document,
                    "same-id",
                    "first.txt",
                    first,
                ),
                executor.submit(
                    self.store.replace_document,
                    "same-id",
                    "second.txt",
                    second,
                ),
            ]
            for future in futures:
                self.assertEqual(future.result(), 1)

        self.assertEqual(self.store.count(), 1)
        results = self.store.search("version", 10)
        self.assertEqual(len(results), 1)
        self.assertIn(
            results[0]["filename"],
            {"first.txt", "second.txt"},
        )

    def test_embedding_dimension_is_enforced_before_mutation(self):
        with patch.object(
            vector_store,
            "embed_documents",
            return_value=np.zeros((1, 10)),
        ):
            with self.assertRaises(ValueError):
                self.store.replace_document(
                    "doc",
                    "bad.txt",
                    split_text("content", "doc"),
                )
        self.assertEqual(self.store.count(), 0)


if __name__ == "__main__":
    unittest.main()
