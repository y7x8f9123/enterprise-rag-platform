package com.enterprisemind.backend;

import java.time.Instant;

public record DocumentResponse(
        String id,
        String documentId,
        String originalName,
        long size,
        String status,
        String indexingStatus,
        Long characters,
        Long words,
        Integer chunkCount,
        Integer indexedChunks,
        Instant createdAt,
        String indexingError
) {
    public static DocumentResponse from(DocumentMetadata document) {
        return new DocumentResponse(
                document.getDocumentId(),
                document.getDocumentId(),
                document.getOriginalName(),
                document.getSize(),
                "STORED",
                document.getIndexingStatus(),
                document.getCharacters(),
                document.getWords(),
                document.getChunkCount(),
                document.getIndexedChunks(),
                document.getCreatedAt(),
                "INDEX_FAILED".equals(document.getIndexingStatus())
                        ? "Document was stored but indexing failed"
                        : null
        );
    }
}
