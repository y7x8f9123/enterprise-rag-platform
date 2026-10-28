package com.enterprisemind.backend;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.util.Map;

import org.springframework.core.io.Resource;
import org.springframework.http.ContentDisposition;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.multipart.MultipartFile;

@RestController
@RequestMapping("/api/documents")
public class DocumentController {

    private final DocumentManagementService documents;

    public DocumentController(DocumentManagementService documents) {
        this.documents = documents;
    }

    @PostMapping("/upload")
    public ResponseEntity<DocumentResponse> upload(
            @RequestParam("file") MultipartFile file
    ) throws IOException {
        return ResponseEntity
                .status(HttpStatus.CREATED)
                .body(documents.upload(file));
    }

    @GetMapping
    public DocumentPageResponse list(
            @RequestParam(defaultValue = "") String query,
            @RequestParam(defaultValue = "0") int page,
            @RequestParam(defaultValue = "20") int size,
            @RequestParam(defaultValue = "") String status
    ) {
        return documents.list(query, page, size, status);
    }

    @GetMapping("/{documentId}")
    public DocumentResponse details(@PathVariable String documentId) {
        return documents.details(documentId);
    }

    @PostMapping("/{documentId}/retry-index")
    public DocumentResponse retryIndex(@PathVariable String documentId) {
        return documents.retryIndex(documentId);
    }

    @GetMapping("/{documentId}/preview")
    public DocumentPreviewResponse preview(@PathVariable String documentId) {
        return documents.preview(documentId);
    }

    @GetMapping("/{documentId}/content")
    public ResponseEntity<Resource> content(@PathVariable String documentId) {
        return fileResponse(documents.original(documentId), false);
    }

    @GetMapping("/{documentId}/download")
    public ResponseEntity<Resource> download(@PathVariable String documentId) {
        return fileResponse(documents.original(documentId), true);
    }

    @DeleteMapping("/{documentId}")
    public ResponseEntity<Map<String, String>> delete(
            @PathVariable String documentId
    ) throws IOException {
        documents.delete(documentId);
        return ResponseEntity.ok(Map.of(
                "status", "DELETED",
                "documentId", documentId
        ));
    }

    private static ResponseEntity<Resource> fileResponse(
            StoredDocumentResource file,
            boolean download
    ) {
        ContentDisposition disposition = (download
                ? ContentDisposition.attachment()
                : ContentDisposition.inline())
                .filename(file.originalName(), StandardCharsets.UTF_8)
                .build();

        return ResponseEntity.ok()
                .contentType(file.mediaType())
                .contentLength(file.contentLength())
                .header(
                        HttpHeaders.CONTENT_DISPOSITION,
                        disposition.toString()
                )
                .header("X-Content-Type-Options", "nosniff")
                .header(
                        HttpHeaders.CACHE_CONTROL,
                        "private, no-store, max-age=0"
                )
                .body(file.resource());
    }
}
