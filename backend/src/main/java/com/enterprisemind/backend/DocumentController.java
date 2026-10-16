
package com.enterprisemind.backend;

import java.io.IOException;
import java.io.InputStream;
import java.nio.file.*;
import java.util.LinkedHashMap;
import java.util.Locale;
import java.util.Map;
import java.util.Set;
import java.util.UUID;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.multipart.MultipartFile;
import org.springframework.web.server.ResponseStatusException;

@RestController
@RequestMapping("/api/documents")
public class DocumentController {

    private static final Logger LOGGER =
            LoggerFactory.getLogger(DocumentController.class);

    private static final Set<String> ALLOWED =
            Set.of("pdf", "docx", "txt");

    private static final long MAX_FILE_SIZE =
            20L * 1024 * 1024;

    private final Path storagePath;
    private final DocumentParsingService parsingService;

    public DocumentController(
            @Value("${app.storage.location}") String location,
            DocumentParsingService parsingService
    ) throws IOException {
        this.storagePath = Paths.get(location)
                .toAbsolutePath()
                .normalize();

        this.parsingService = parsingService;

        Files.createDirectories(storagePath);
    }

    @PostMapping("/upload")
    public ResponseEntity<Map<String, Object>> upload(
            @RequestParam("file") MultipartFile file
    ) throws IOException {

        if (file.isEmpty()) {
            throw new ResponseStatusException(
                    HttpStatus.BAD_REQUEST,
                    "File is empty"
            );
        }

        if (file.getSize() > MAX_FILE_SIZE) {
                throw new ResponseStatusException(
                        HttpStatus.CONTENT_TOO_LARGE,
                        "File exceeds 20 MB"
                );
        }

        String original = file.getOriginalFilename();

        if (original == null || original.isBlank()) {
            throw new ResponseStatusException(
                    HttpStatus.BAD_REQUEST,
                    "Invalid filename"
            );
        }

        String safeName = original.replace('\\', '/');
        safeName = safeName.substring(
                safeName.lastIndexOf('/') + 1
        );

        int dot = safeName.lastIndexOf('.');

        String extension = dot >= 0
                ? safeName.substring(dot + 1)
                    .toLowerCase(Locale.ROOT)
                : "";

        if (!ALLOWED.contains(extension)) {
            throw new ResponseStatusException(
                    HttpStatus.BAD_REQUEST,
                    "Unsupported file format"
            );
        }

        String storedName =
                UUID.randomUUID() + "." + extension;

        Path target = storagePath.resolve(storedName);

        try (InputStream input = file.getInputStream()) {
            Files.copy(input, target);
        }

        Map<String, Object> result = new LinkedHashMap<>();

        result.put("id", storedName);
        result.put("documentId", storedName);
        result.put("originalName", safeName);
        result.put("size", file.getSize());
        result.put("status", "STORED");
        result.put("indexingStatus", "INDEX_FAILED");
        result.put("characters", null);
        result.put("words", null);
        result.put("chunkCount", null);
        result.put("indexedChunks", null);

        try {
            byte[] content = Files.readAllBytes(target);

            DocumentIndexResult indexed = parsingService.index(
                    safeName,
                    content,
                    storedName
            );

            result.put("indexingStatus", "INDEXED");
            result.put("characters", indexed.characters());
            result.put("words", indexed.words());
            result.put("chunkCount", indexed.chunkCount());
            result.put("indexedChunks", indexed.indexedChunks());

        } catch (Exception exception) {
            result.put("indexingError",
                    "Document was stored but indexing failed");

            LOGGER.warn(
                    "AI indexing failed for documentId={} cause={}",
                    storedName,
                    exception.getClass().getSimpleName()
            );
        }

        return ResponseEntity
                .status(HttpStatus.CREATED)
                .body(result);
    }
}
