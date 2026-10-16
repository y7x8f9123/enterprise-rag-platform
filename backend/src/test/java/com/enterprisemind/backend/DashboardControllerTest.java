package com.enterprisemind.backend;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import java.nio.file.Path;
import java.time.Instant;
import java.util.UUID;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.servlet.MockMvc;

@SpringBootTest
@AutoConfigureMockMvc
class DashboardControllerTest {

    private static final String DATABASE_NAME =
            "dashboard-" + UUID.randomUUID();

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
    DocumentMetadataRepository repository;

    @MockitoBean
    DocumentParsingService parsingService;

    @BeforeEach
    void clearDatabase() {
        repository.deleteAll();
    }

    @Test
    void returnsZeroStatisticsForEmptyDatabase() throws Exception {
        mockMvc.perform(get("/api/dashboard/summary"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.totalDocuments").value(0))
                .andExpect(jsonPath("$.indexedDocuments").value(0))
                .andExpect(jsonPath("$.failedDocuments").value(0))
                .andExpect(jsonPath("$.totalChunks").value(0))
                .andExpect(jsonPath("$.recentDocuments").isEmpty());
    }

    @Test
    void aggregatesRealMetadataAndReturnsFiveMostRecent() throws Exception {
        Instant base = Instant.parse("2026-10-16T00:00:00Z");
        for (int index = 0; index < 7; index++) {
            String id = UUID.randomUUID() + ".txt";
            DocumentMetadata document = new DocumentMetadata(
                    id,
                    "document-" + index + ".txt",
                    100 + index,
                    id,
                    "INDEX_FAILED",
                    base.plusSeconds(index)
            );
            if (index < 4) {
                document.markIndexed(new DocumentIndexResult(
                        "INDEXED", id, 100, 20, index + 1, index + 1
                ));
            }
            repository.save(document);
        }

        mockMvc.perform(get("/api/dashboard/summary"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.totalDocuments").value(7))
                .andExpect(jsonPath("$.indexedDocuments").value(4))
                .andExpect(jsonPath("$.failedDocuments").value(3))
                .andExpect(jsonPath("$.totalChunks").value(10))
                .andExpect(jsonPath("$.recentDocuments.length()")
                        .value(5))
                .andExpect(jsonPath("$.recentDocuments[0].originalName")
                        .value("document-6.txt"))
                .andExpect(jsonPath("$.recentDocuments[0].indexingStatus")
                        .value("INDEX_FAILED"));
    }
}
