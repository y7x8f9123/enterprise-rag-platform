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
        String indexingErrorCode,
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
                failedValue(
                        document,
                        document.getIndexingErrorCode(),
                        "INDEXING_FAILED"
                ),
                failedValue(
                        document,
                        document.getIndexingError(),
                        "Document was stored but indexing failed."
                )
        );
    }

    private static String failedValue(
            DocumentMetadata document,
            String value,
            String fallback
    ) {
        if (!"INDEX_FAILED".equals(document.getIndexingStatus())) {
            return null;
        }
        return value == null || value.isBlank() ? fallback : value;
    }
}
