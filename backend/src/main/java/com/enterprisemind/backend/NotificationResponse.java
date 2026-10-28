package com.enterprisemind.backend;

import java.time.Instant;

public record NotificationResponse(
        String id,
        String title,
        String message,
        NotificationType type,
        String documentId,
        Instant createdAt,
        boolean read,
        boolean documentAvailable
) {
    public static NotificationResponse from(
            AppNotification notification,
            boolean documentAvailable
    ) {
        return new NotificationResponse(
                notification.getId(),
                notification.getTitle(),
                notification.getMessage(),
                notification.getType(),
                notification.getDocumentId(),
                notification.getCreatedAt(),
                notification.isRead(),
                documentAvailable
        );
    }
}
