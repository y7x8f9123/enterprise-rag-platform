package com.enterprisemind.backend;

import static org.junit.jupiter.api.Assertions.assertArrayEquals;
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.doThrow;
import static org.mockito.Mockito.reset;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.multipart;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import java.nio.file.Files;
import java.nio.file.Path;
import java.util.UUID;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.mock.web.MockMultipartFile;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.web.client.ResourceAccessException;
import org.springframework.web.server.ResponseStatusException;

@SpringBootTest
@AutoConfigureMockMvc
class DocumentControllerTest {

    private static final String DATABASE_NAME =
            "documents-" + UUID.randomUUID();

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

    @Autowired
    DocumentManagementService managementService;

    @MockitoBean
    DocumentParsingService parsingService;

    @BeforeEach
    void resetState() throws Exception {
        reset(parsingService);
        repository.deleteAll();
        try (var files = Files.list(storageDirectory)) {
            for (Path path : files.toList()) {
                Files.deleteIfExists(path);
            }
        }
    }

    @Test
    void uploadPersistsMetadataAndListSupportsSearch() throws Exception {
        when(parsingService.index(anyString(), any(byte[].class), anyString()))
                .thenAnswer(invocation -> new DocumentIndexResult(
                        "INDEXED",
                        invocation.getArgument(2),
                        23,
                        2,
                        1,
                        1
                ));

        String body = mockMvc.perform(multipart("/api/documents/upload")
                        .file(new MockMultipartFile(
                                "file",
                                "handbook.txt",
                                "text/plain",
                                "EnterpriseMind handbook".getBytes()
                        )))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.status").value("STORED"))
                .andExpect(jsonPath("$.indexingStatus").value("INDEXED"))
                .andExpect(jsonPath("$.originalName").value("handbook.txt"))
                .andExpect(jsonPath("$.createdAt").exists())
                .andReturn().getResponse().getContentAsString();

        String documentId = body.split("\\\"documentId\\\":\\\"")[1]
                .split("\\\"")[0];
        assertTrue(Files.exists(storageDirectory.resolve(documentId)));
        assertTrue(repository.existsById(documentId));

        mockMvc.perform(get("/api/documents")
                        .param("query", "HAND")
                        .param("page", "0")
                        .param("size", "10"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.totalElements").value(1))
                .andExpect(jsonPath("$.documents[0].documentId")
                        .value(documentId));
    }

    @Test
    void indexingFailureKeepsFileAndPersistentRecord() throws Exception {
        when(parsingService.index(anyString(), any(byte[].class), anyString()))
                .thenThrow(new ResourceAccessException("Connection refused"));

        mockMvc.perform(multipart("/api/documents/upload")
                        .file(new MockMultipartFile(
                                "file",
                                "offline.txt",
                                "text/plain",
                                "keep this file".getBytes()
                        )))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.indexingStatus")
                        .value("INDEX_FAILED"));

        DocumentMetadata stored = repository.findAll().getFirst();
        assertTrue(Files.exists(
                storageDirectory.resolve(stored.getStoragePath())
        ));
        assertEquals("INDEX_FAILED", stored.getIndexingStatus());
    }

    @Test
    void deleteRemovesVectorsFileAndMetadataOnlyAfterConfirmation()
            throws Exception {
        when(parsingService.index(anyString(), any(byte[].class), anyString()))
                .thenAnswer(invocation -> new DocumentIndexResult(
                        "INDEXED", invocation.getArgument(2), 7, 1, 1, 1
                ));
        mockMvc.perform(multipart("/api/documents/upload")
                        .file(new MockMultipartFile(
                                "file", "delete.txt", "text/plain",
                                "content".getBytes()
                        )))
                .andExpect(status().isCreated());
        DocumentMetadata stored = repository.findAll().getFirst();
        Path storedPath = storageDirectory.resolve(stored.getStoragePath());

        mockMvc.perform(delete(
                        "/api/documents/{documentId}",
                        stored.getDocumentId()
                ))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.status").value("DELETED"));

        verify(parsingService).delete(stored.getDocumentId());
        assertFalse(repository.existsById(stored.getDocumentId()));
        assertFalse(Files.exists(storedPath));
    }

    @Test
    void vectorDeleteFailureRestoresFileAndKeepsMetadata() throws Exception {
        when(parsingService.index(anyString(), any(byte[].class), anyString()))
                .thenThrow(new ResourceAccessException("offline"));
        mockMvc.perform(multipart("/api/documents/upload")
                        .file(new MockMultipartFile(
                                "file", "restore.txt", "text/plain",
                                "original bytes".getBytes()
                        )))
                .andExpect(status().isCreated());
        DocumentMetadata stored = repository.findAll().getFirst();
        Path storedPath = storageDirectory.resolve(stored.getStoragePath());
        byte[] before = Files.readAllBytes(storedPath);
        doThrow(new ResourceAccessException("offline"))
                .when(parsingService).delete(stored.getDocumentId());

        mockMvc.perform(delete(
                        "/api/documents/{documentId}",
                        stored.getDocumentId()
                ))
                .andExpect(status().isBadGateway());

        assertTrue(repository.existsById(stored.getDocumentId()));
        assertTrue(Files.exists(storedPath));
        assertArrayEquals(before, Files.readAllBytes(storedPath));
    }

    @Test
    void rejectsInvalidFilesAndUnsafeDocumentIds() throws Exception {
        mockMvc.perform(multipart("/api/documents/upload")
                        .file(new MockMultipartFile(
                                "file", "empty.txt", "text/plain", new byte[0]
                        )))
                .andExpect(status().isBadRequest());
        mockMvc.perform(multipart("/api/documents/upload")
                        .file(new MockMultipartFile(
                                "file", "bad.exe", "application/octet-stream",
                                new byte[]{1}
                        )))
                .andExpect(status().isBadRequest());

        ResponseStatusException exception = assertThrows(
                ResponseStatusException.class,
                () -> managementService.delete("../secret.txt")
        );
        assertEquals(400, exception.getStatusCode().value());
        assertTrue(repository.findAll().isEmpty());
    }
}
