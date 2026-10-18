package com.enterprisemind.backend;

import static org.junit.jupiter.api.Assertions.assertArrayEquals;
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.doThrow;
import static org.mockito.Mockito.reset;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.multipart;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.content;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.header;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.time.Instant;
import java.util.UUID;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.mock.web.MockMultipartFile;
import org.springframework.http.HttpHeaders;
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
    void listFiltersPersistedDocumentsByIndexingStatus() throws Exception {
        repository.save(new DocumentMetadata(
                UUID.randomUUID() + ".txt",
                "indexed-handbook.txt",
                10,
                "indexed.txt",
                "INDEXED",
                Instant.parse("2026-10-18T00:00:00Z")
        ));
        repository.save(new DocumentMetadata(
                UUID.randomUUID() + ".txt",
                "failed-handbook.txt",
                10,
                "failed.txt",
                "INDEX_FAILED",
                Instant.parse("2026-10-19T00:00:00Z")
        ));

        mockMvc.perform(get("/api/documents")
                        .param("query", "handbook")
                        .param("status", "INDEX_FAILED")
                        .param("page", "0")
                        .param("size", "10"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.totalElements").value(1))
                .andExpect(jsonPath("$.documents[0].originalName")
                        .value("failed-handbook.txt"));

        mockMvc.perform(get("/api/documents")
                        .param("status", "UNKNOWN"))
                .andExpect(status().isBadRequest());
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

    @Test
    void detailsReturnPersistedMetadataWithoutStoragePath() throws Exception {
        String documentId = storeDocument(
                "handbook.txt",
                "persisted content".getBytes()
        );
        DocumentMetadata metadata = repository.findById(documentId).orElseThrow();
        metadata.markIndexed(new DocumentIndexResult(
                "INDEXED", documentId, 17, 2, 3, 3
        ));
        repository.saveAndFlush(metadata);

        mockMvc.perform(get(
                        "/api/documents/{documentId}",
                        documentId
                ))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.documentId").value(documentId))
                .andExpect(jsonPath("$.originalName").value("handbook.txt"))
                .andExpect(jsonPath("$.size").value(17))
                .andExpect(jsonPath("$.indexingStatus").value("INDEXED"))
                .andExpect(jsonPath("$.characters").value(17))
                .andExpect(jsonPath("$.words").value(2))
                .andExpect(jsonPath("$.chunkCount").value(3))
                .andExpect(jsonPath("$.indexedChunks").value(3))
                .andExpect(jsonPath("$.createdAt").exists())
                .andExpect(jsonPath("$.storagePath").doesNotExist());
    }

    @Test
    void previewSupportsStoredTxtPdfAndDocxFiles() throws Exception {
        when(parsingService.preview(anyString(), any(byte[].class)))
                .thenAnswer(invocation -> new DocumentPreviewResponse(
                        "Preview for " + invocation.getArgument(0),
                        false
                ));

        for (String filename : new String[]{
                "notes.txt", "policy.pdf", "guide.docx"
        }) {
            String documentId = storeDocument(
                    filename,
                    ("bytes for " + filename).getBytes()
            );
            mockMvc.perform(get(
                            "/api/documents/{documentId}/preview",
                            documentId
                    ))
                    .andExpect(status().isOk())
                    .andExpect(jsonPath("$.text")
                            .value("Preview for " + filename))
                    .andExpect(jsonPath("$.truncated").value(false));
        }
    }

    @Test
    void previewRejectsMissingInvalidUnsupportedAndUnsafeDocuments()
            throws Exception {
        String missingId = UUID.randomUUID() + ".txt";
        mockMvc.perform(get(
                        "/api/documents/{documentId}/preview",
                        missingId
                ))
                .andExpect(status().isNotFound());
        mockMvc.perform(get(
                        "/api/documents/{documentId}/preview",
                        "not-a-valid-id.txt"
                ))
                .andExpect(status().isBadRequest());

        String unsupportedId = UUID.randomUUID() + ".txt";
        repository.saveAndFlush(new DocumentMetadata(
                unsupportedId,
                "unsafe.exe",
                1,
                unsupportedId,
                "INDEX_FAILED",
                Instant.now()
        ));
        Files.write(storageDirectory.resolve(unsupportedId), new byte[]{1});
        mockMvc.perform(get(
                        "/api/documents/{documentId}/preview",
                        unsupportedId
                ))
                .andExpect(status().isUnsupportedMediaType());

        String unsafeId = UUID.randomUUID() + ".txt";
        repository.saveAndFlush(new DocumentMetadata(
                unsafeId,
                "unsafe.txt",
                1,
                "../outside.txt",
                "INDEX_FAILED",
                Instant.now()
        ));
        mockMvc.perform(get(
                        "/api/documents/{documentId}/preview",
                        unsafeId
                ))
                .andExpect(status().isInternalServerError());
    }

    @Test
    void previewReportsMissingFileParseFailureAndTruncation()
            throws Exception {
        String missingFileId = UUID.randomUUID() + ".txt";
        repository.saveAndFlush(new DocumentMetadata(
                missingFileId,
                "missing.txt",
                10,
                missingFileId,
                "INDEX_FAILED",
                Instant.now()
        ));
        mockMvc.perform(get(
                        "/api/documents/{documentId}/preview",
                        missingFileId
                ))
                .andExpect(status().isNotFound());

        String brokenId = storeDocument("broken.pdf", new byte[]{1, 2, 3});
        when(parsingService.preview(
                eq("broken.pdf"),
                any(byte[].class)
        ))
                .thenThrow(new IllegalStateException("cannot parse"));
        mockMvc.perform(get(
                        "/api/documents/{documentId}/preview",
                        brokenId
                ))
                .andExpect(status().isUnprocessableContent());

        String longId = storeDocument("long.txt", "content".getBytes());
        when(parsingService.preview(
                eq("long.txt"),
                any(byte[].class)
        ))
                .thenReturn(new DocumentPreviewResponse(
                        "x".repeat(100_000),
                        true
                ));
        mockMvc.perform(get(
                        "/api/documents/{documentId}/preview",
                        longId
                ))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.truncated").value(true));
    }

    @Test
    void contentAndDownloadStreamOriginalBytesWithSafeHeaders()
            throws Exception {
        Object[][] documents = {
                {"notes.txt", "text/plain", "TXT bytes".getBytes()},
                {"policy.pdf", "application/pdf", new byte[]{0x25, 0x50, 0x44, 0x46}},
                {
                        "guide.docx",
                        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
                        new byte[]{0x50, 0x4b, 0x03, 0x04}
                }
        };

        for (Object[] document : documents) {
            String filename = (String) document[0];
            String expectedType = (String) document[1];
            byte[] original = (byte[]) document[2];
            String documentId = storeDocument(filename, original);

            mockMvc.perform(get(
                            "/api/documents/{documentId}/content",
                            documentId
                    ))
                    .andExpect(status().isOk())
                    .andExpect(content().bytes(original))
                    .andExpect(content().contentTypeCompatibleWith(expectedType))
                    .andExpect(header().string(
                            HttpHeaders.CONTENT_DISPOSITION,
                            org.hamcrest.Matchers.startsWith("inline;")
                    ))
                    .andExpect(header().string(
                            "X-Content-Type-Options",
                            "nosniff"
                    ))
                    .andExpect(header().string(
                            HttpHeaders.CACHE_CONTROL,
                            "private, no-store, max-age=0"
                    ));

            mockMvc.perform(get(
                            "/api/documents/{documentId}/download",
                            documentId
                    ))
                    .andExpect(status().isOk())
                    .andExpect(content().bytes(original))
                    .andExpect(header().string(
                            HttpHeaders.CONTENT_DISPOSITION,
                            org.hamcrest.Matchers.startsWith("attachment;")
                    ));
        }
    }

    @Test
    void downloadEncodesUnicodeFilename() throws Exception {
        byte[] original = "原始内容".getBytes();
        String documentId = storeDocument(
                "中文 文件 & notes.txt",
                original
        );

        mockMvc.perform(get(
                        "/api/documents/{documentId}/download",
                        documentId
                ))
                .andExpect(status().isOk())
                .andExpect(content().bytes(original))
                .andExpect(header().string(
                        HttpHeaders.CONTENT_DISPOSITION,
                        org.hamcrest.Matchers.allOf(
                                org.hamcrest.Matchers.startsWith("attachment;"),
                                org.hamcrest.Matchers.containsString(
                                        "filename*=UTF-8''%E4%B8%AD%E6%96%87%20%E6%96%87%E4%BB%B6%20&%20notes.txt"
                                )
                        )
                ));
    }

    @Test
    void originalFileEndpointsRejectMissingInvalidAndUnsafePaths()
            throws Exception {
        String missingId = UUID.randomUUID() + ".pdf";
        mockMvc.perform(get(
                        "/api/documents/{documentId}/content",
                        missingId
                ))
                .andExpect(status().isNotFound());
        mockMvc.perform(get(
                        "/api/documents/{documentId}/download",
                        "not-a-valid-id.txt"
                ))
                .andExpect(status().isBadRequest());

        String unsafeId = UUID.randomUUID() + ".txt";
        repository.saveAndFlush(new DocumentMetadata(
                unsafeId,
                "unsafe.txt",
                1,
                "../outside.txt",
                "INDEX_FAILED",
                Instant.now()
        ));
        mockMvc.perform(get(
                        "/api/documents/{documentId}/content",
                        unsafeId
                ))
                .andExpect(status().isInternalServerError());
    }

    @Test
    void originalFileEndpointRejectsSymbolicLinks() throws Exception {
        Path outside = Files.createTempFile("enterprisemind-outside-", ".txt");
        try {
            Files.writeString(outside, "outside storage");
            String documentId = UUID.randomUUID() + ".txt";
            repository.saveAndFlush(new DocumentMetadata(
                    documentId,
                    "linked.txt",
                    Files.size(outside),
                    documentId,
                    "INDEX_FAILED",
                    Instant.now()
            ));
            Path link = storageDirectory.resolve(documentId);
            try {
                Files.createSymbolicLink(link, outside);
            } catch (UnsupportedOperationException | IOException exception) {
                org.junit.jupiter.api.Assumptions.assumeTrue(
                        false,
                        "Symbolic links unavailable: " + exception.getMessage()
                );
            }

            mockMvc.perform(get(
                            "/api/documents/{documentId}/content",
                            documentId
                    ))
                    .andExpect(status().isNotFound());
        } finally {
            Files.deleteIfExists(outside);
        }
    }

    private String storeDocument(String filename, byte[] content)
            throws Exception {
        String extension = filename.substring(filename.lastIndexOf('.') + 1);
        String documentId = UUID.randomUUID() + "." + extension;
        repository.saveAndFlush(new DocumentMetadata(
                documentId,
                filename,
                content.length,
                documentId,
                "INDEX_FAILED",
                Instant.now()
        ));
        Files.write(storageDirectory.resolve(documentId), content);
        return documentId;
    }
}
