package com.enterprisemind.backend;

import java.io.IOException;
import java.util.Map;

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
            @RequestParam(defaultValue = "20") int size
    ) {
        return documents.list(query, page, size);
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
}
