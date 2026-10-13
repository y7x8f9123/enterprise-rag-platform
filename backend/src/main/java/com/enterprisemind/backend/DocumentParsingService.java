
package com.enterprisemind.backend;

import java.util.Map;

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
            String aiServiceUrl
    ) {
        SimpleClientHttpRequestFactory factory =
                new SimpleClientHttpRequestFactory();

        factory.setConnectTimeout(5000);
        factory.setReadTimeout(30000);

        this.restClient = RestClient.builder()
                .baseUrl(aiServiceUrl)
                .requestFactory(factory)
                .build();
    }

    public Map<?, ?> parse(
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

        Map<?, ?> response = restClient.post()
                .uri("/api/documents/parse")
                .contentType(MediaType.MULTIPART_FORM_DATA)
                .body(body)
                .retrieve()
                .body(Map.class);

        if (response == null ||
                !"PARSED".equals(response.get("status"))) {
            throw new IllegalStateException(
                    "AI service did not confirm parsing"
            );
        }

        return response;
    }
}
