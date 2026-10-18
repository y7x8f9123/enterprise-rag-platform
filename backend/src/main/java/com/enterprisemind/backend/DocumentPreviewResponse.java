package com.enterprisemind.backend;

public record DocumentPreviewResponse(
        String text,
        boolean truncated
) {
}
