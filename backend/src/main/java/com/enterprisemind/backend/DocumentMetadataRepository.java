package com.enterprisemind.backend;

import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;

import java.util.List;

public interface DocumentMetadataRepository
        extends JpaRepository<DocumentMetadata, String> {

    Page<DocumentMetadata> findByOriginalNameContainingIgnoreCase(
            String originalName,
            Pageable pageable
    );

    Page<DocumentMetadata> findByIndexingStatus(
            String indexingStatus,
            Pageable pageable
    );

    Page<DocumentMetadata>
            findByOriginalNameContainingIgnoreCaseAndIndexingStatus(
                    String originalName,
                    String indexingStatus,
                    Pageable pageable
            );

    long countByIndexingStatus(String indexingStatus);

    @Query("""
            select coalesce(sum(document.indexedChunks), 0)
            from DocumentMetadata document
            where document.indexingStatus = 'INDEXED'
            """)
    long sumIndexedChunks();

    List<DocumentMetadata> findTop5ByOrderByCreatedAtDesc();
}
