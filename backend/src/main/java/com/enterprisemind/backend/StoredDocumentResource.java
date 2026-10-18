package com.enterprisemind.backend;

import org.springframework.core.io.Resource;
import org.springframework.http.MediaType;

record StoredDocumentResource(
        Resource resource,
        String originalName,
        MediaType mediaType,
        long contentLength
) {
}
