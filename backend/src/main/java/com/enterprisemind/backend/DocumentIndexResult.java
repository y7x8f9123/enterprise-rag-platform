package com.enterprisemind.backend;

import com.fasterxml.jackson.annotation.JsonProperty;

public record DocumentIndexResult(
        String status,
        @JsonProperty("document_id") String documentId,
        long characters,
        long words,
        @JsonProperty("chunk_count") int chunkCount,
        @JsonProperty("indexed_chunks") int indexedChunks
) {
}
