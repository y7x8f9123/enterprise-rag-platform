package com.enterprisemind.backend;

import java.time.Instant;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;

@Entity
@Table(name = "documents")
public class DocumentMetadata {

    @Id
    @Column(nullable = false, length = 50)
    private String documentId;

    @Column(nullable = false, length = 512)
    private String originalName;

    @Column(nullable = false)
    private long size;

    @Column(nullable = false, length = 512)
    private String storagePath;

    @Column(nullable = false, length = 32)
    private String indexingStatus;

    private Long characters;
    private Long words;
    private Integer chunkCount;
    private Integer indexedChunks;

    @Column(length = 64)
    private String indexingErrorCode;

    @Column(length = 500)
    private String indexingError;

    @Column(nullable = false, updatable = false)
    private Instant createdAt;

    protected DocumentMetadata() {
    }

    public DocumentMetadata(
            String documentId,
            String originalName,
            long size,
            String storagePath,
            String indexingStatus,
            Instant createdAt
    ) {
        this.documentId = documentId;
        this.originalName = originalName;
        this.size = size;
        this.storagePath = storagePath;
        this.indexingStatus = indexingStatus;
        this.createdAt = createdAt;
    }

    public String getDocumentId() { return documentId; }
    public String getOriginalName() { return originalName; }
    public long getSize() { return size; }
    public String getStoragePath() { return storagePath; }
    public String getIndexingStatus() { return indexingStatus; }
    public Long getCharacters() { return characters; }
    public Long getWords() { return words; }
    public Integer getChunkCount() { return chunkCount; }
    public Integer getIndexedChunks() { return indexedChunks; }
    public String getIndexingErrorCode() { return indexingErrorCode; }
    public String getIndexingError() { return indexingError; }
    public Instant getCreatedAt() { return createdAt; }

    public void markIndexed(DocumentIndexResult result) {
        indexingStatus = "INDEXED";
        characters = result.characters();
        words = result.words();
        chunkCount = result.chunkCount();
        indexedChunks = result.indexedChunks();
        indexingErrorCode = null;
        indexingError = null;
    }

    public void markIndexFailed() {
        markIndexFailed("INDEXING_FAILED", "Document indexing failed.");
    }

    public void markIndexFailed(String errorCode, String errorMessage) {
        indexingStatus = "INDEX_FAILED";
        characters = null;
        words = null;
        chunkCount = null;
        indexedChunks = null;
        indexingErrorCode = errorCode;
        indexingError = errorMessage;
    }
}
