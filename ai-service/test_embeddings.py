
from embeddings import (
    embed_documents,
    embed_query,
    cosine_similarity,
)


def main():
    documents = [
        "Employees can request annual leave through the HR portal.",
        "The company provides cloud computing and AI services.",
        "The cafeteria serves coffee and sandwiches.",
    ]

    query = "How can employees apply for vacation?"

    print("Loading embedding model...")

    document_vectors = embed_documents(documents)
    query_vector = embed_query(query)

    print("\nEmbedding results")
    print("-------------------------")
    print("Number of documents:", len(documents))
    print("Vector dimensions:", document_vectors.shape[1])
    print("Query dimensions:", query_vector.shape[0])

    results = []

    for index, vector in enumerate(document_vectors):
        score = cosine_similarity(query_vector, vector)
        results.append((score, documents[index]))

    results.sort(reverse=True)

    print("\nSemantic search results")
    print("-------------------------")

    for score, content in results:
        print(f"Similarity: {score:.4f}")
        print(f"Document: {content}\n")


if __name__ == "__main__":
    main()
