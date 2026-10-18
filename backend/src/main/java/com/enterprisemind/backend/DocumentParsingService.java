package com.enterprisemind.backend;

import java.time.Duration;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.core.io.ByteArrayResource;
import org.springframework.http.MediaType;
import org.springframework.http.client.SimpleClientHttpRequestFactory;
import org.springframework.stereotype.Service;
import org.springframework.util.LinkedMultiValueMap;
import org.springframework.util.MultiValueMap;
import org.springframework.web.client.RestClient;

@Service
public class DocumentParsingService {

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

        DocumentIndexResult response = restClient.post()
                .uri("/api/documents/index")
                .contentType(MediaType.MULTIPART_FORM_DATA)
                .body(body)
                .retrieve()
                .body(DocumentIndexResult.class);

        validateResponse(response, documentId);
        return response;
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
