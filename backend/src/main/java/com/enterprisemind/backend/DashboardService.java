package com.enterprisemind.backend;

import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class DashboardService {

    private final DocumentMetadataRepository documents;

    public DashboardService(DocumentMetadataRepository documents) {
        this.documents = documents;
    }

    @Transactional(readOnly = true)
    public DashboardSummaryResponse summary() {
        return new DashboardSummaryResponse(
                documents.count(),
                documents.countByIndexingStatus("INDEXED"),
                documents.countByIndexingStatus("INDEX_FAILED"),
                documents.sumIndexedChunks(),
                documents.findTop5ByOrderByCreatedAtDesc().stream()
                        .map(DocumentResponse::from)
                        .toList()
        );
    }
}
