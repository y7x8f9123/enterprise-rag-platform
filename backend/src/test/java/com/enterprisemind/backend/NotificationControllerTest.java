package com.enterprisemind.backend;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.patch;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import java.nio.file.Path;
import java.time.Instant;
import java.util.UUID;

import jakarta.persistence.EntityManager;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.springframework.test.web.servlet.MockMvc;

@SpringBootTest
@AutoConfigureMockMvc
class NotificationControllerTest {

    private static final String DATABASE_NAME =
            "notifications-" + UUID.randomUUID();

    @TempDir
    static Path storageDirectory;

    @DynamicPropertySource
    static void properties(DynamicPropertyRegistry registry) {
        registry.add(
                "app.storage.location",
                () -> storageDirectory.toString()
        );
        registry.add(
                "spring.datasource.url",
                () -> "jdbc:h2:mem:" + DATABASE_NAME
                        + ";DB_CLOSE_DELAY=-1"
        );
    }

    @Autowired
    MockMvc mockMvc;

    @Autowired
    NotificationService service;

    @Autowired
    NotificationRepository notifications;

    @Autowired
    DocumentMetadataRepository documents;

    @Autowired
    EntityManager entityManager;

    @BeforeEach
    void resetState() {
        notifications.deleteAll();
        documents.deleteAll();
    }

    @Test
    void supportsPaginationUnreadCountAndReadOperations() throws Exception {
        record(NotificationType.DOCUMENT_UPLOADED, "one");
        record(NotificationType.INDEX_SUCCEEDED, "two");
        record(NotificationType.INDEX_FAILED, "three");

        mockMvc.perform(get("/api/notifications")
                        .param("page", "0")
                        .param("size", "2"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.notifications.length()").value(2))
                .andExpect(jsonPath("$.totalElements").value(3))
                .andExpect(jsonPath("$.totalPages").value(2));
        mockMvc.perform(get("/api/notifications/unread-count"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.unreadCount").value(3));

        String notificationId = notifications.findAll().getFirst().getId();
        mockMvc.perform(patch(
                        "/api/notifications/{id}/read",
                        notificationId
                ))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.read").value(true));
        mockMvc.perform(get("/api/notifications/unread-count"))
                .andExpect(jsonPath("$.unreadCount").value(2));

        mockMvc.perform(patch("/api/notifications/read-all"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.unreadCount").value(0));
        assertEquals(0, notifications.countByReadFalse());
    }

    @Test
    void duplicateBusinessEventsCreateOnlyOneNotification() {
        String documentId = UUID.randomUUID() + ".txt";
        service.recordSafely(
                NotificationType.DOCUMENT_UPLOADED,
                documentId,
                "duplicate.txt"
        );
        service.recordSafely(
                NotificationType.DOCUMENT_UPLOADED,
                documentId,
                "duplicate.txt"
        );

        assertEquals(1, notifications.count());
    }

    @Test
    void reportsWhetherAssociatedDocumentStillExists() throws Exception {
        String documentId = UUID.randomUUID() + ".txt";
        documents.saveAndFlush(new DocumentMetadata(
                documentId,
                "available.txt",
                1,
                documentId,
                "INDEXED",
                Instant.now()
        ));
        service.recordSafely(
                NotificationType.INDEX_SUCCEEDED,
                documentId,
                "available.txt"
        );

        mockMvc.perform(get("/api/notifications"))
                .andExpect(jsonPath(
                        "$.notifications[0].documentAvailable"
                ).value(true));

        documents.deleteById(documentId);
        mockMvc.perform(get("/api/notifications"))
                .andExpect(jsonPath(
                        "$.notifications[0].documentAvailable"
                ).value(false));
        assertEquals(1, notifications.count());
    }

    @Test
    void persistedNotificationCanBeReloadedFromDatabase() {
        record(NotificationType.DOCUMENT_UPLOADED, "persisted");
        String id = notifications.findAll().getFirst().getId();

        entityManager.clear();

        assertTrue(notifications.findById(id).isPresent());
    }

    @Test
    void rejectsInvalidPaginationAndMissingNotification() throws Exception {
        mockMvc.perform(get("/api/notifications").param("page", "-1"))
                .andExpect(status().isBadRequest());
        mockMvc.perform(get("/api/notifications").param("size", "101"))
                .andExpect(status().isBadRequest());
        mockMvc.perform(patch(
                        "/api/notifications/{id}/read",
                        UUID.randomUUID()
                ))
                .andExpect(status().isNotFound());
    }

    private void record(NotificationType type, String name) {
        service.recordSafely(
                type,
                UUID.randomUUID() + ".txt",
                name + ".txt"
        );
    }
}
