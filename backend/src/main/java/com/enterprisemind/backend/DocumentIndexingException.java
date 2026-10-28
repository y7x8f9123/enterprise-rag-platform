package com.enterprisemind.backend;

public class DocumentIndexingException extends RuntimeException {

    private final int statusCode;
    private final String errorCode;
    private final String safeMessage;

    public DocumentIndexingException(
            int statusCode,
            String errorCode,
            String safeMessage,
            Throwable cause
    ) {
        super(safeMessage, cause);
        this.statusCode = statusCode;
        this.errorCode = errorCode;
        this.safeMessage = safeMessage;
    }

    public int getStatusCode() { return statusCode; }
    public String getErrorCode() { return errorCode; }
    public String getSafeMessage() { return safeMessage; }
}
