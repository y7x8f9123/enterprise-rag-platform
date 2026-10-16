package com.enterprisemind.backend;

import com.fasterxml.jackson.annotation.JsonProperty;

public record DocumentDeleteResult(
        String status,
        @JsonProperty("document_id") String documentId
) {
}
