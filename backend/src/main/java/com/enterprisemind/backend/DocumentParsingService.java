package com.enterprisemind.backend;

import java.time.Duration;

import tools.jackson.databind.JsonNode;
import tools.jackson.databind.json.JsonMapper;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.core.io.ByteArrayResource;
import org.springframework.http.MediaType;
import org.springframework.http.client.SimpleClientHttpRequestFactory;
import org.springframework.stereotype.Service;
import org.springframework.util.LinkedMultiValueMap;
import org.springframework.util.MultiValueMap;
import org.springframework.web.client.RestClient;
import org.springframework.web.client.RestClientResponseException;

@Service
public class DocumentParsingService {

    private static final JsonMapper ERROR_MAPPER = JsonMapper.builder().build();

    private final RestClient restClient;

    public DocumentParsingService(
            @Value("${app.ai-service.url:http://127.0.0.1:8000}")
            String aiServiceUrl,
            @Value("${app.ai-service.connect-timeout-ms:5000}")
            int connectTimeoutMs,
            @Value("${app.ai-service.read-timeout-ms:180000}")
            int readTimeoutMs
    ) {
        if (connectTimeoutMs <= 0 || readTimeoutMs <= 0) {
            throw new IllegalArgumentException(
                    "AI service timeouts must be positive"
            );
        }

        SimpleClientHttpRequestFactory factory =
                new SimpleClientHttpRequestFactory();

        factory.setConnectTimeout(
                Duration.ofMillis(connectTimeoutMs)
        );
        factory.setReadTimeout(
                Duration.ofMillis(readTimeoutMs)
        );

        this.restClient = RestClient.builder()
                .baseUrl(aiServiceUrl)
                .requestFactory(factory)
                .build();
    }

    public DocumentIndexResult index(
            String filename,
            byte[] content,
            String documentId
    ) {
        if (documentId == null || documentId.isBlank()) {
            throw new IllegalArgumentException(
                    "documentId cannot be blank"
            );
        }

        ByteArrayResource resource =
                new ByteArrayResource(content) {
                    @Override
                    public String getFilename() {
                        return filename;
                    }
                };

        MultiValueMap<String, Object> body =
                new LinkedMultiValueMap<>();

        body.add("file", resource);
        body.add("document_id", documentId);

        DocumentIndexResult response;
        try {
            response = restClient.post()
                    .uri("/api/documents/index")
                    .contentType(MediaType.MULTIPART_FORM_DATA)
                    .body(body)
                    .retrieve()
                    .body(DocumentIndexResult.class);
        } catch (RestClientResponseException exception) {
            throw indexingException(exception);
        }

        validateResponse(response, documentId);
        return response;
    }

    private static DocumentIndexingException indexingException(
            RestClientResponseException exception
    ) {
        String code = "INDEXING_FAILED";
        String message = "Document indexing failed.";
        try {
            JsonNode detail = ERROR_MAPPER
                    .readTree(exception.getResponseBodyAsString())
                    .path("detail");
            if (detail.isObject()) {
                String parsedCode = detail.path("code").asText("").trim();
                String parsedMessage = detail.path("message").asText("").trim();
                if (!parsedCode.isEmpty()) {
                    code = parsedCode;
                }
                if (!parsedMessage.isEmpty()) {
                    message = parsedMessage;
                }
            } else if (detail.isTextual() && !detail.asText().isBlank()) {
                message = detail.asText();
            }
        } catch (Exception ignored) {
            // Keep the bounded, user-safe fallback above. Never expose the
            // raw upstream response or a server-side stack trace.
        }
        return new DocumentIndexingException(
                exception.getStatusCode().value(),
                code,
                message,
                exception
        );
    }

    public DocumentPreviewResponse preview(
            String filename,
            byte[] content
    ) {
        ByteArrayResource resource =
                new ByteArrayResource(content) {
                    @Override
                    public String getFilename() {
                        return filename;
                    }
                };

        MultiValueMap<String, Object> body =
                new LinkedMultiValueMap<>();
        body.add("file", resource);

        DocumentPreviewResponse response = restClient.post()
                .uri("/api/documents/preview")
                .contentType(MediaType.MULTIPART_FORM_DATA)
                .body(body)
                .retrieve()
                .body(DocumentPreviewResponse.class);

        if (response == null || response.text() == null) {
            throw new IllegalStateException(
                    "AI service returned an invalid preview"
            );
        }
        return response;
    }

    public void delete(String documentId) {
        if (documentId == null || documentId.isBlank()) {
            throw new IllegalArgumentException(
                    "documentId cannot be blank"
            );
        }

        DocumentDeleteResult response = restClient.delete()
                .uri("/api/documents/{documentId}/index", documentId)
                .retrieve()
                .body(DocumentDeleteResult.class);

        if (response == null ||
                !"DELETED".equals(response.status()) ||
                !documentId.equals(response.documentId())) {
            throw new IllegalStateException(
                    "AI service did not confirm vector deletion"
            );
        }
    }

    private static void validateResponse(
            DocumentIndexResult response,
            String expectedDocumentId
    ) {
        if (response == null ||
                !"INDEXED".equals(response.status())) {
            throw new IllegalStateException(
                    "AI service did not confirm indexing"
            );
        }

        if (!expectedDocumentId.equals(response.documentId())) {
            throw new IllegalStateException(
                    "AI service returned a different document ID"
            );
        }

        if (response.characters() < 0 || response.words() < 0 ||
                response.chunkCount() < 0 ||
                response.indexedChunks() < 0 ||
                response.indexedChunks() != response.chunkCount()) {
            throw new IllegalStateException(
                    "AI service returned invalid indexing counts"
            );
        }
    }
}
