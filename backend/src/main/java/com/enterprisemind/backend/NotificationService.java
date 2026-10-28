package com.enterprisemind.backend;

import java.time.Instant;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Sort;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.TransactionDefinition;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.transaction.support.TransactionSynchronization;
import org.springframework.transaction.support.TransactionSynchronizationManager;
import org.springframework.transaction.support.TransactionTemplate;
import org.springframework.web.server.ResponseStatusException;

@Service
public class NotificationService {

    private static final Logger LOGGER =
            LoggerFactory.getLogger(NotificationService.class);

    private final NotificationRepository notifications;
    private final DocumentMetadataRepository documents;
    private final TransactionTemplate writer;

    public NotificationService(
            NotificationRepository notifications,
            DocumentMetadataRepository documents,
            PlatformTransactionManager transactionManager
    ) {
        this.notifications = notifications;
        this.documents = documents;
        writer = new TransactionTemplate(transactionManager);
        writer.setPropagationBehavior(
                TransactionDefinition.PROPAGATION_REQUIRES_NEW
        );
    }

    public void recordSafely(
            NotificationType type,
            String documentId,
            String originalName
    ) {
        recordSafely(
                type,
                documentId,
                originalName,
                type.name() + ":" + documentId
        );
    }

    public void recordSafely(
            NotificationType type,
            String documentId,
            String originalName,
            String eventKey
    ) {
        recordSafely(type, documentId, originalName, eventKey, null);
    }

    public void recordIndexFailureSafely(
            String documentId,
            String originalName,
            String eventKey,
            String failureReason
    ) {
        recordSafely(
                NotificationType.INDEX_FAILED,
                documentId,
                originalName,
                eventKey,
                failureReason
        );
    }

    private void recordSafely(
            NotificationType type,
            String documentId,
            String originalName,
            String eventKey,
            String failureReason
    ) {
        try {
            writer.executeWithoutResult(status -> {
                if (notifications.existsByEventKey(eventKey)) {
                    return;
                }
                notifications.saveAndFlush(createNotification(
                        type,
                        documentId,
                        originalName,
                        eventKey,
                        failureReason
                ));
            });
        } catch (DataIntegrityViolationException exception) {
            LOGGER.debug("Notification already exists for eventKey={}", eventKey);
        } catch (RuntimeException exception) {
            LOGGER.warn(
                    "Notification persistence failed for eventKey={} cause={}",
                    eventKey,
                    exception.getClass().getSimpleName()
            );
        }
    }

    public void recordAfterCommit(
            NotificationType type,
            String documentId,
            String originalName
    ) {
        if (!TransactionSynchronizationManager.isActualTransactionActive()) {
            recordSafely(type, documentId, originalName);
            return;
        }
        TransactionSynchronizationManager.registerSynchronization(
                new TransactionSynchronization() {
                    @Override
                    public void afterCommit() {
                        recordSafely(type, documentId, originalName);
                    }
                }
        );
    }

    @Transactional(readOnly = true)
    public NotificationPageResponse list(int page, int size) {
        validatePage(page, size);
        var result = notifications.findAll(PageRequest.of(
                page,
                size,
                Sort.by(Sort.Direction.DESC, "createdAt")
                        .and(Sort.by(Sort.Direction.DESC, "id"))
        ));
        return new NotificationPageResponse(
                result.getContent().stream()
                        .map(notification -> NotificationResponse.from(
                                notification,
                                notification.getDocumentId() != null
                                        && documents.existsById(
                                                notification.getDocumentId()
                                        )
                        ))
                        .toList(),
                result.getNumber(),
                result.getSize(),
                result.getTotalElements(),
                result.getTotalPages()
        );
    }

    @Transactional(readOnly = true)
    public UnreadCountResponse unreadCount() {
        return new UnreadCountResponse(notifications.countByReadFalse());
    }

    @Transactional
    public NotificationResponse markRead(String id) {
        AppNotification notification = notifications.findById(id)
                .orElseThrow(() -> new ResponseStatusException(
                        HttpStatus.NOT_FOUND,
                        "Notification not found"
                ));
        notification.markRead();
        return NotificationResponse.from(
                notification,
                notification.getDocumentId() != null
                        && documents.existsById(notification.getDocumentId())
        );
    }

    @Transactional
    public UnreadCountResponse markAllRead() {
        notifications.markAllRead();
        return new UnreadCountResponse(0);
    }

    private static AppNotification createNotification(
            NotificationType type,
            String documentId,
            String originalName,
            String eventKey,
            String failureReason
    ) {
        String title;
        String message;
        switch (type) {
            case DOCUMENT_UPLOADED -> {
                title = "Document uploaded";
                message = originalName + " was saved successfully.";
            }
            case INDEX_SUCCEEDED -> {
                title = "Indexing complete";
                message = originalName + " is ready for semantic search.";
            }
            case INDEX_FAILED -> {
                title = "Indexing failed";
                message = originalName + " was saved, but indexing failed."
                        + conciseFailureReason(failureReason);
            }
            case DOCUMENT_DELETED -> {
                title = "Document deleted";
                message = originalName + " was deleted successfully.";
            }
            default -> throw new IllegalArgumentException(
                    "Unsupported notification type"
            );
        }
        return new AppNotification(
                title,
                message,
                type,
                documentId,
                eventKey,
                Instant.now()
        );
    }

    private static String conciseFailureReason(String failureReason) {
        if (failureReason == null || failureReason.isBlank()) {
            return "";
        }
        String bounded = failureReason.length() > 400
                ? failureReason.substring(0, 400)
                : failureReason;
        return " " + bounded;
    }

    private static void validatePage(int page, int size) {
        if (page < 0) {
            throw new ResponseStatusException(
                    HttpStatus.BAD_REQUEST,
                    "page cannot be negative"
            );
        }
        if (size < 1 || size > 100) {
            throw new ResponseStatusException(
                    HttpStatus.BAD_REQUEST,
                    "size must be between 1 and 100"
            );
        }
    }
}
