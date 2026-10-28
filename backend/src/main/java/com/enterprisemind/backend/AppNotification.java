package com.enterprisemind.backend;

import java.time.Instant;
import java.util.UUID;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import jakarta.persistence.UniqueConstraint;

@Entity
@Table(
        name = "app_notifications",
        uniqueConstraints = @UniqueConstraint(
                name = "uk_notification_event_key",
                columnNames = "event_key"
        )
)
public class AppNotification {

    @Id
    @Column(nullable = false, length = 36)
    private String id;

    @Column(nullable = false, length = 160)
    private String title;

    @Column(nullable = false, length = 1000)
    private String message;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 32)
    private NotificationType type;

    @Column(length = 50)
    private String documentId;

    @Column(name = "event_key", nullable = false, length = 96)
    private String eventKey;

    @Column(name = "is_read", nullable = false)
    private boolean read;

    @Column(nullable = false, updatable = false)
    private Instant createdAt;

    protected AppNotification() {
    }

    public AppNotification(
            String title,
            String message,
            NotificationType type,
            String documentId,
            String eventKey,
            Instant createdAt
    ) {
        this.id = UUID.randomUUID().toString();
        this.title = title;
        this.message = message;
        this.type = type;
        this.documentId = documentId;
        this.eventKey = eventKey;
        this.createdAt = createdAt;
        this.read = false;
    }

    public String getId() { return id; }
    public String getTitle() { return title; }
    public String getMessage() { return message; }
    public NotificationType getType() { return type; }
    public String getDocumentId() { return documentId; }
    public String getEventKey() { return eventKey; }
    public boolean isRead() { return read; }
    public Instant getCreatedAt() { return createdAt; }

    public void markRead() {
        read = true;
    }
}
