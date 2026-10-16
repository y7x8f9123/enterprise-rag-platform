package com.enterprisemind.backend;

import static org.junit.jupiter.api.Assertions.assertArrayEquals;
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import java.nio.file.Files;
import java.nio.file.Path;
import java.util.Map;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;
import org.mockito.ArgumentCaptor;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.mock.web.MockMultipartFile;
import org.springframework.web.client.ResourceAccessException;
import org.springframework.web.server.ResponseStatusException;

class DocumentControllerTest {

    @TempDir
    Path storageDirectory;

    @Test
    void uploadStoresAndIndexesWithGeneratedDocumentId()
            throws Exception {
        byte[] content = "EnterpriseMind handbook".getBytes();
        DocumentParsingService service =
                mock(DocumentParsingService.class);

        when(service.index(anyString(), any(byte[].class), anyString()))
                .thenAnswer(invocation -> {
                    String documentId = invocation.getArgument(2);
                    return new DocumentIndexResult(
                            "INDEXED",
                            documentId,
                            23,
                            2,
                            1,
                            1
                    );
                });

        DocumentController controller = new DocumentController(
                storageDirectory.toString(),
                service
        );
        MockMultipartFile file = new MockMultipartFile(
                "file",
                "handbook.txt",
                "text/plain",
                content
        );

        ResponseEntity<Map<String, Object>> response =
                controller.upload(file);
        Map<String, Object> body = response.getBody();

        assertEquals(HttpStatus.CREATED, response.getStatusCode());
        assertNotNull(body);
        assertEquals("STORED", body.get("status"));
        assertEquals("INDEXED", body.get("indexingStatus"));
        assertEquals(body.get("id"), body.get("documentId"));
        assertEquals(23L, body.get("characters"));
        assertEquals(2L, body.get("words"));
        assertEquals(1, body.get("chunkCount"));
        assertEquals(1, body.get("indexedChunks"));
        assertFalse(body.containsKey("indexingError"));

        String documentId = (String) body.get("documentId");
        assertTrue(Files.exists(storageDirectory.resolve(documentId)));
        assertArrayEquals(
                content,
                Files.readAllBytes(storageDirectory.resolve(documentId))
        );

        ArgumentCaptor<String> filename =
                ArgumentCaptor.forClass(String.class);
        ArgumentCaptor<byte[]> sentContent =
                ArgumentCaptor.forClass(byte[].class);
        ArgumentCaptor<String> sentDocumentId =
                ArgumentCaptor.forClass(String.class);

        verify(service).index(
                filename.capture(),
                sentContent.capture(),
                sentDocumentId.capture()
        );
        assertEquals("handbook.txt", filename.getValue());
        assertArrayEquals(content, sentContent.getValue());
        assertEquals(documentId, sentDocumentId.getValue());
    }

    @Test
    void unavailableAiServiceReturnsIndexFailedAndKeepsFile()
            throws Exception {
        DocumentParsingService service =
                mock(DocumentParsingService.class);
        when(service.index(anyString(), any(byte[].class), anyString()))
                .thenThrow(new ResourceAccessException("Connection refused"));

        DocumentController controller = new DocumentController(
                storageDirectory.toString(),
                service
        );
        byte[] content = "stored even if AI is down".getBytes();

        ResponseEntity<Map<String, Object>> response = controller.upload(
                new MockMultipartFile(
                        "file",
                        "offline.txt",
                        "text/plain",
                        content
                )
        );
        Map<String, Object> body = response.getBody();

        assertNotNull(body);
        assertEquals("STORED", body.get("status"));
        assertEquals("INDEX_FAILED", body.get("indexingStatus"));
        assertEquals(
                "Document was stored but indexing failed",
                body.get("indexingError")
        );
        assertNull(body.get("characters"));
        assertNull(body.get("words"));
        assertNull(body.get("chunkCount"));
        assertNull(body.get("indexedChunks"));

        Path storedFile = storageDirectory.resolve(
                (String) body.get("documentId")
        );
        assertTrue(Files.exists(storedFile));
        assertArrayEquals(content, Files.readAllBytes(storedFile));
    }

    @Test
    void invalidAiResponseReturnsIndexFailedAndKeepsFile()
            throws Exception {
        DocumentParsingService service =
                mock(DocumentParsingService.class);
        when(service.index(anyString(), any(byte[].class), anyString()))
                .thenThrow(new IllegalStateException(
                        "AI service did not confirm indexing"
                ));

        DocumentController controller = new DocumentController(
                storageDirectory.toString(),
                service
        );
        ResponseEntity<Map<String, Object>> response = controller.upload(
                new MockMultipartFile(
                        "file",
                        "invalid-response.txt",
                        "text/plain",
                        "content".getBytes()
                )
        );
        Map<String, Object> body = response.getBody();

        assertNotNull(body);
        assertEquals("INDEX_FAILED", body.get("indexingStatus"));
        assertTrue(Files.exists(storageDirectory.resolve(
                (String) body.get("documentId")
        )));
    }

    @Test
    void rejectsEmptyFileWithoutSavingIt() throws Exception {
        DocumentController controller = new DocumentController(
                storageDirectory.toString(),
                mock(DocumentParsingService.class)
        );

        ResponseStatusException exception = assertThrows(
                ResponseStatusException.class,
                () -> controller.upload(new MockMultipartFile(
                        "file",
                        "empty.txt",
                        "text/plain",
                        new byte[0]
                ))
        );

        assertEquals(HttpStatus.BAD_REQUEST, exception.getStatusCode());
        try (var files = Files.list(storageDirectory)) {
            assertEquals(0, files.count());
        }
    }

    @Test
    void rejectsUnsupportedFileWithoutSavingIt() throws Exception {
        DocumentController controller = new DocumentController(
                storageDirectory.toString(),
                mock(DocumentParsingService.class)
        );

        ResponseStatusException exception = assertThrows(
                ResponseStatusException.class,
                () -> controller.upload(new MockMultipartFile(
                        "file",
                        "program.exe",
                        "application/octet-stream",
                        new byte[]{1, 2, 3}
                ))
        );

        assertEquals(HttpStatus.BAD_REQUEST, exception.getStatusCode());
        try (var files = Files.list(storageDirectory)) {
            assertEquals(0, files.count());
        }
    }
}
