package com.enterprisemind.backend;

import java.util.List;

public record NotificationPageResponse(
        List<NotificationResponse> notifications,
        int page,
        int size,
        long totalElements,
        int totalPages
) {
}
