package com.enterprisemind.backend;

import static org.junit.jupiter.api.Assertions.assertEquals;

import java.nio.file.Path;
import java.util.Arrays;
import java.util.UUID;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;
import org.springframework.boot.WebApplicationType;
import org.springframework.boot.builder.SpringApplicationBuilder;

class NotificationPersistenceRestartTest {

    @TempDir
    Path temporaryDirectory;

    @Test
    void notificationHistorySurvivesApplicationContextRestart() {
        String databasePath = temporaryDirectory.resolve("notifications")
                .toAbsolutePath()
                .toString()
                .replace('\\', '/');
        String storagePath = temporaryDirectory.resolve("uploads")
                .toAbsolutePath()
                .toString();
        String documentId = UUID.randomUUID() + ".txt";
        String[] properties = {
                "spring.datasource.url=jdbc:h2:file:" + databasePath,
                "spring.datasource.driver-class-name=org.h2.Driver",
                "spring.datasource.username=sa",
                "spring.datasource.password=",
                "spring.jpa.hibernate.ddl-auto=update",
                "spring.jpa.open-in-view=false",
                "spring.devtools.restart.enabled=false",
                "app.storage.location=" + storagePath,
                "app.ai-service.url=http://127.0.0.1:1",
                "app.ai-service.connect-timeout-ms=100",
                "app.ai-service.read-timeout-ms=100"
        };

        try (var first = application().run(commandLine(properties))) {
            first.getBean(NotificationService.class).recordSafely(
                    NotificationType.DOCUMENT_UPLOADED,
                    documentId,
                    "persistent.txt"
            );
            assertEquals(
                    1,
                    first.getBean(NotificationRepository.class).count()
            );
        }

        try (var restarted = application().run(commandLine(properties))) {
            NotificationRepository repository = restarted.getBean(
                    NotificationRepository.class
            );
            assertEquals(1, repository.count());
            assertEquals(
                    NotificationType.DOCUMENT_UPLOADED,
                    repository.findAll().getFirst().getType()
            );
        }
    }

    private static SpringApplicationBuilder application() {
        return new SpringApplicationBuilder(BackendApplication.class)
                .web(WebApplicationType.NONE);
    }

    private static String[] commandLine(String[] properties) {
        return Arrays.stream(properties)
                .map(property -> "--" + property)
                .toArray(String[]::new);
    }
}
