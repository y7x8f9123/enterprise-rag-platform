
from pathlib import Path

from chunking import split_text
from vector_store import VectorStore


def main():
    project_root = Path(__file__).resolve().parent.parent
    test_file = project_root / "backend" / "long-test.txt"

    if not test_file.exists():
        print(f"Test file not found: {test_file}")
        return

    text = test_file.read_text(encoding="utf-8-sig")

    document_id = "long-test-document"

    chunks = split_text(
        text=text,
        document_id=document_id,
        chunk_size=500,
        chunk_overlap=100,
    )

    print("Document chunks:", len(chunks))

    store = VectorStore()

    try:
        # Remove previous test data to avoid stale chunks.
        store.delete_document(document_id)

        inserted = store.add_chunks(
            document_id=document_id,
            filename="long-test.txt",
            chunks=chunks,
        )

        print("Inserted vectors:", inserted)
        print("Total stored vectors:", store.count())

        question = "What does EnterpriseMind provide?"

        print("\nQuestion:", question)

        results = store.search(question, limit=3)

        print("\nTop-3 search results:")

        for index, result in enumerate(results, start=1):
            print(f"\nResult {index}")
            print("Score:", round(result["score"], 4))
            print("Document:", result["filename"])
            print("Chunk:", result["chunk_index"])
            print("Content:", result["content"][:200])

    finally:
        store.close()


if __name__ == "__main__":
    main()
