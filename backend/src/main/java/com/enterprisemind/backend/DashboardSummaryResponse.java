package com.enterprisemind.backend;

import java.util.List;

public record DashboardSummaryResponse(
        long totalDocuments,
        long indexedDocuments,
        long failedDocuments,
        long totalChunks,
        List<DocumentResponse> recentDocuments
) {
}
