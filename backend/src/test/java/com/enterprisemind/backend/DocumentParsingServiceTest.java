package com.enterprisemind.backend;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.io.IOException;
import java.net.InetSocketAddress;
import java.nio.charset.StandardCharsets;
import java.util.concurrent.atomic.AtomicReference;

import com.sun.net.httpserver.HttpExchange;
import com.sun.net.httpserver.HttpServer;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;

class DocumentParsingServiceTest {

    private HttpServer server;

    @AfterEach
    void stopServer() {
        if (server != null) {
            server.stop(0);
        }
    }

    @Test
    void sendsFileAndDocumentIdToIndexEndpoint() throws Exception {
        AtomicReference<String> requestBody = new AtomicReference<>();
        startServer(exchange -> {
            requestBody.set(new String(
                    exchange.getRequestBody().readAllBytes(),
                    StandardCharsets.ISO_8859_1
            ));
            sendJson(exchange, 200, """
                    {
                      "status": "INDEXED",
                      "document_id": "spring-id.txt",
                      "characters": 17,
                      "words": 3,
                      "chunk_count": 2,
                      "indexed_chunks": 2
                    }
                    """);
        });

        DocumentIndexResult result = createService().index(
                "handbook.txt",
                "document content".getBytes(StandardCharsets.UTF_8),
                "spring-id.txt"
        );

        assertEquals("INDEXED", result.status());
        assertEquals("spring-id.txt", result.documentId());
        assertEquals(2, result.chunkCount());
        assertEquals(2, result.indexedChunks());

        String multipart = requestBody.get();
        assertTrue(multipart.contains("name=\"file\""));
        assertTrue(multipart.contains("filename=\"handbook.txt\""));
        assertTrue(multipart.contains("name=\"document_id\""));
        assertTrue(multipart.contains("spring-id.txt"));
    }

    @Test
    void rejectsPythonResponseWithoutIndexedStatus() throws Exception {
        startServer(exchange -> sendJson(exchange, 200, """
                {
                  "status": "INDEX_FAILED",
                  "document_id": "spring-id.txt",
                  "characters": 0,
                  "words": 0,
                  "chunk_count": 0,
                  "indexed_chunks": 0
                }
                """));

        IllegalStateException exception = assertThrows(
                IllegalStateException.class,
                () -> createService().index(
                        "handbook.txt",
                        "content".getBytes(StandardCharsets.UTF_8),
                        "spring-id.txt"
                )
        );

        assertEquals(
                "AI service did not confirm indexing",
                exception.getMessage()
        );
    }

    @Test
    void rejectsResponseWithDifferentDocumentId() throws Exception {
        startServer(exchange -> sendJson(exchange, 200, """
                {
                  "status": "INDEXED",
                  "document_id": "different-id.txt",
                  "characters": 7,
                  "words": 1,
                  "chunk_count": 1,
                  "indexed_chunks": 1
                }
                """));

        assertThrows(
                IllegalStateException.class,
                () -> createService().index(
                        "handbook.txt",
                        "content".getBytes(StandardCharsets.UTF_8),
                        "spring-id.txt"
                )
        );
    }

    private DocumentParsingService createService() {
        return new DocumentParsingService(
                "http://127.0.0.1:" + server.getAddress().getPort(),
                1000,
                5000
        );
    }

    private void startServer(ExchangeHandler handler) throws IOException {
        server = HttpServer.create(
                new InetSocketAddress("127.0.0.1", 0),
                0
        );
        server.createContext("/api/documents/index", exchange -> {
            try {
                assertEquals("POST", exchange.getRequestMethod());
                assertTrue(
                        exchange.getRequestHeaders()
                                .getFirst("Content-Type")
                                .startsWith("multipart/form-data;")
                );
                handler.handle(exchange);
            } finally {
                exchange.close();
            }
        });
        server.start();
    }

    private static void sendJson(
            HttpExchange exchange,
            int status,
            String json
    ) throws IOException {
        byte[] response = json.getBytes(StandardCharsets.UTF_8);
        exchange.getResponseHeaders().set(
                "Content-Type",
                "application/json"
        );
        exchange.sendResponseHeaders(status, response.length);
        exchange.getResponseBody().write(response);
    }

    @FunctionalInterface
    private interface ExchangeHandler {
        void handle(HttpExchange exchange) throws IOException;
    }
}
