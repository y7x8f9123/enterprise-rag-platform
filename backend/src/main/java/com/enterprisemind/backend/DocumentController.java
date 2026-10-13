
package com.enterprisemind.backend;

import java.io.IOException;
import java.io.InputStream;
import java.nio.file.*;
import java.util.HashMap;
import java.util.Locale;
import java.util.Map;
import java.util.Set;
import java.util.UUID;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.multipart.MultipartFile;
import org.springframework.web.server.ResponseStatusException;

@RestController
@RequestMapping("/api/documents")
public class DocumentController {

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
                    HttpStatus.PAYLOAD_TOO_LARGE,
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

        Map<String, Object> result = new HashMap<>();

        result.put("id", storedName);
        result.put("originalName", safeName);
        result.put("size", file.getSize());
        result.put("status", "STORED");

        try {
            byte[] content = Files.readAllBytes(target);

            Map<?, ?> parsed = parsingService.parse(
                    safeName,
                    content
            );

            result.put("parsingStatus", "PARSED");
            result.put("characters", parsed.get("characters"));
            result.put("words", parsed.get("words"));

        } catch (Exception exception) {
            result.put("parsingStatus", "FAILED");
            result.put("parsingError",
                    "Document parsing failed or AI service unavailable");

            System.err.println(
                    "Parsing failed for " + storedName
                    + ": " + exception.getMessage()
            );
        }

        return ResponseEntity
                .status(HttpStatus.CREATED)
                .body(result);
    }
}
