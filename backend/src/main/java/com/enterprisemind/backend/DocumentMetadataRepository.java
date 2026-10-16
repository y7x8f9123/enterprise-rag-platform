package com.enterprisemind.backend;

import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;

public interface DocumentMetadataRepository
        extends JpaRepository<DocumentMetadata, String> {

    Page<DocumentMetadata> findByOriginalNameContainingIgnoreCase(
            String originalName,
            Pageable pageable
    );
}
