package com.enterprisemind.backend;

import java.io.IOException;
import java.io.InputStream;
import java.nio.file.AtomicMoveNotSupportedException;
import java.nio.file.Files;
import java.nio.file.LinkOption;
import java.nio.file.Path;
import java.nio.file.StandardCopyOption;
import java.time.Instant;
import java.util.Locale;
import java.util.Set;
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.ConcurrentMap;
import java.util.concurrent.locks.ReentrantLock;
import java.util.regex.Pattern;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.core.io.FileSystemResource;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Sort;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.multipart.MultipartFile;
import org.springframework.web.client.ResourceAccessException;
import org.springframework.web.client.RestClientResponseException;
import org.springframework.web.server.ResponseStatusException;

@Service
public class DocumentManagementService {

    private static final Logger LOGGER =
            LoggerFactory.getLogger(DocumentManagementService.class);
    private static final Set<String> ALLOWED = Set.of("pdf", "docx", "txt");
    private static final long MAX_FILE_SIZE = 20L * 1024 * 1024;
    private static final String NO_EXTRACTABLE_TEXT =
            "No extractable text. This PDF may require OCR.";
    private static final Pattern DOCUMENT_ID = Pattern.compile(
            "^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-5][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}\\.(pdf|docx|txt)$"
    );

    private final Path storageRoot;
    private final DocumentParsingService parsingService;
    private final DocumentMetadataRepository repository;
    private final NotificationService notifications;
    private final ConcurrentMap<String, ReentrantLock> documentLocks =
            new ConcurrentHashMap<>();

    public DocumentManagementService(
            @Value("${app.storage.location}") String location,
            DocumentParsingService parsingService,
            DocumentMetadataRepository repository,
            NotificationService notifications
    ) throws IOException {
        storageRoot = Path.of(location).toAbsolutePath().normalize();
        this.parsingService = parsingService;
        this.repository = repository;
        this.notifications = notifications;
        Files.createDirectories(storageRoot);
    }

    public DocumentResponse upload(MultipartFile file) throws IOException {
        validateUpload(file);
        String originalName = safeFilename(file.getOriginalFilename());
        String extension = extensionOf(originalName);
        String documentId = UUID.randomUUID() + "." + extension;
        Path target = resolveStoredPath(documentId);

        try (InputStream input = file.getInputStream()) {
            Files.copy(input, target);
        }

        DocumentMetadata metadata = new DocumentMetadata(
                documentId,
                originalName,
                file.getSize(),
                documentId,
                "INDEX_FAILED",
                Instant.now()
        );

        try {
            metadata = repository.saveAndFlush(metadata);
        } catch (RuntimeException exception) {
            Files.deleteIfExists(target);
            throw exception;
        }
        notifySafely(
                NotificationType.DOCUMENT_UPLOADED,
                documentId,
                originalName,
                false
        );

        try {
            byte[] content = Files.readAllBytes(target);
            DocumentIndexResult indexed = parsingService.index(
                    originalName,
                    content,
                    documentId
            );
            metadata.markIndexed(indexed);
            metadata = repository.save(metadata);
            notifySafely(
                    NotificationType.INDEX_SUCCEEDED,
                    documentId,
                    originalName,
                    false
            );
        } catch (Exception exception) {
            IndexingFailure failure = indexingFailure(exception);
            metadata.markIndexFailed(failure.code(), failure.message());
            metadata = repository.save(metadata);
            notifyIndexFailureSafely(
                    documentId,
                    originalName,
                    NotificationType.INDEX_FAILED.name() + ":" + documentId,
                    failure.message()
            );
            LOGGER.warn(
                    "AI indexing failed for documentId={} cause={}",
                    documentId,
                    exception.getClass().getSimpleName()
            );
        }

        return DocumentResponse.from(metadata);
    }

    public DocumentPageResponse list(
            String query,
            int page,
            int size,
            String status
    ) {
        if (page < 0) {
            throw new ResponseStatusException(
                    HttpStatus.BAD_REQUEST,
                    "page cannot be negative"
            );
        }
        if (size < 1 || size > 100) {
            throw new ResponseStatusException(
                    HttpStatus.BAD_REQUEST,
                    "size must be between 1 and 100"
            );
        }

        PageRequest pageable = PageRequest.of(
                page,
                size,
                Sort.by(Sort.Direction.DESC, "createdAt")
        );
        String normalized = query == null ? "" : query.trim();
        String normalizedStatus = status == null
                ? ""
                : status.trim().toUpperCase(Locale.ROOT);
        if (!normalizedStatus.isEmpty()
                && !Set.of("INDEXED", "INDEX_FAILED")
                        .contains(normalizedStatus)) {
            throw new ResponseStatusException(
                    HttpStatus.BAD_REQUEST,
                    "status must be INDEXED or INDEX_FAILED"
            );
        }

        Page<DocumentMetadata> result;
        if (normalizedStatus.isEmpty()) {
            result = normalized.isEmpty()
                    ? repository.findAll(pageable)
                    : repository.findByOriginalNameContainingIgnoreCase(
                            normalized,
                            pageable
                    );
        } else {
            result = normalized.isEmpty()
                    ? repository.findByIndexingStatus(
                            normalizedStatus,
                            pageable
                    )
                    : repository
                            .findByOriginalNameContainingIgnoreCaseAndIndexingStatus(
                                    normalized,
                                    normalizedStatus,
                                    pageable
                            );
        }

        return new DocumentPageResponse(
                result.getContent().stream()
                        .map(DocumentResponse::from)
                        .toList(),
                result.getNumber(),
                result.getSize(),
                result.getTotalElements(),
                result.getTotalPages()
        );
    }

    @Transactional(readOnly = true)
    public DocumentResponse details(String documentId) {
        return DocumentResponse.from(findDocument(documentId));
    }

    public DocumentResponse retryIndex(String documentId) {
        validateDocumentId(documentId);
        ReentrantLock lock = acquireDocumentLock(documentId);
        try {
            DocumentMetadata metadata = findDocument(documentId);
            if (!"INDEX_FAILED".equals(metadata.getIndexingStatus())) {
                throw new ResponseStatusException(
                        HttpStatus.CONFLICT,
                        "Only documents with failed indexing can be retried"
                );
            }

            StoredDocumentResource stored = original(documentId);
            byte[] content;
            try {
                content = stored.resource().getContentAsByteArray();
            } catch (IOException exception) {
                throw new ResponseStatusException(
                        HttpStatus.INTERNAL_SERVER_ERROR,
                        "Stored document could not be read",
                        exception
                );
            }

            String retryEvent = "RETRY:" + UUID.randomUUID();
            try {
                DocumentIndexResult indexed = parsingService.index(
                        metadata.getOriginalName(),
                        content,
                        documentId
                );
                metadata.markIndexed(indexed);
                metadata = repository.saveAndFlush(metadata);
                notifyRetrySafely(
                        NotificationType.INDEX_SUCCEEDED,
                        documentId,
                        metadata.getOriginalName(),
                        retryEvent
                );
                return DocumentResponse.from(metadata);
            } catch (DocumentIndexingException exception) {
                IndexingFailure failure = indexingFailure(exception);
                persistRetryFailure(metadata, retryEvent, failure);
                HttpStatus status = HttpStatus.resolve(exception.getStatusCode());
                throw new ResponseStatusException(
                        status == null ? HttpStatus.BAD_GATEWAY : status,
                        failure.message(),
                        exception
                );
            } catch (ResourceAccessException exception) {
                IndexingFailure failure = indexingFailure(exception);
                persistRetryFailure(metadata, retryEvent, failure);
                throw new ResponseStatusException(
                        HttpStatus.SERVICE_UNAVAILABLE,
                        failure.message(),
                        exception
                );
            } catch (RestClientResponseException exception) {
                IndexingFailure failure = indexingFailure(exception);
                persistRetryFailure(metadata, retryEvent, failure);
                HttpStatus status = exception.getStatusCode().value() == 422
                        ? HttpStatus.UNPROCESSABLE_CONTENT
                        : exception.getStatusCode().value() == 503
                                ? HttpStatus.SERVICE_UNAVAILABLE
                                : HttpStatus.BAD_GATEWAY;
                throw new ResponseStatusException(
                        status,
                        failure.message(),
                        exception
                );
            } catch (RuntimeException exception) {
                IndexingFailure failure = indexingFailure(exception);
                persistRetryFailure(metadata, retryEvent, failure);
                throw new ResponseStatusException(
                        HttpStatus.BAD_GATEWAY,
                        failure.message(),
                        exception
                );
            }
        } finally {
            releaseDocumentLock(lock);
        }
    }

    @Transactional(readOnly = true)
    public DocumentPreviewResponse preview(String documentId) {
        StoredDocumentResource file = original(documentId);
        try {
            byte[] content = file.resource().getContentAsByteArray();
            return parsingService.preview(file.originalName(), content);
        } catch (IOException exception) {
            throw new ResponseStatusException(
                    HttpStatus.INTERNAL_SERVER_ERROR,
                    "Stored document could not be read",
                    exception
            );
        } catch (ResourceAccessException exception) {
            throw new ResponseStatusException(
                    HttpStatus.SERVICE_UNAVAILABLE,
                    "Document preview service is unavailable",
                    exception
            );
        } catch (RestClientResponseException exception) {
            HttpStatus status = exception.getStatusCode().value() == 415
                    ? HttpStatus.UNSUPPORTED_MEDIA_TYPE
                    : HttpStatus.UNPROCESSABLE_CONTENT;
            throw new ResponseStatusException(
                    status,
                    "Document preview could not be parsed",
                    exception
            );
        } catch (RuntimeException exception) {
            throw new ResponseStatusException(
                    HttpStatus.UNPROCESSABLE_CONTENT,
                    "Document preview could not be parsed",
                    exception
            );
        }
    }

    @Transactional(readOnly = true)
    public StoredDocumentResource original(String documentId) {
        DocumentMetadata metadata = findDocument(documentId);
        String extension = extensionOf(metadata.getOriginalName());
        if (!ALLOWED.contains(extension)) {
            throw new ResponseStatusException(
                    HttpStatus.UNSUPPORTED_MEDIA_TYPE,
                    "Unsupported document format"
            );
        }
        if (!documentId.equals(metadata.getStoragePath())) {
            throw new ResponseStatusException(
                    HttpStatus.INTERNAL_SERVER_ERROR,
                    "Invalid stored document path"
            );
        }

        Path realFile;
        try {
            Path stored = resolveStoredPath(metadata.getStoragePath());
            if (!Files.isRegularFile(stored, LinkOption.NOFOLLOW_LINKS)) {
                throw new ResponseStatusException(
                        HttpStatus.NOT_FOUND,
                        "Stored document file not found"
                );
            }
            Path realRoot = storageRoot.toRealPath();
            realFile = stored.toRealPath();
            if (!realFile.startsWith(realRoot) || realFile.equals(realRoot)) {
                throw new ResponseStatusException(
                        HttpStatus.INTERNAL_SERVER_ERROR,
                        "Invalid stored document path"
                );
            }
        } catch (ResponseStatusException exception) {
            throw exception;
        } catch (IOException exception) {
            throw new ResponseStatusException(
                    HttpStatus.NOT_FOUND,
                    "Stored document file not found",
                    exception
            );
        }

        MediaType mediaType = switch (extension) {
            case "pdf" -> MediaType.APPLICATION_PDF;
            case "docx" -> MediaType.parseMediaType(
                    "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
            );
            case "txt" -> MediaType.parseMediaType(
                    "text/plain;charset=UTF-8"
            );
            default -> throw new ResponseStatusException(
                    HttpStatus.UNSUPPORTED_MEDIA_TYPE,
                    "Unsupported document format"
            );
        };

        try {
            return new StoredDocumentResource(
                    new FileSystemResource(realFile),
                    sanitizeResponseFilename(metadata.getOriginalName()),
                    mediaType,
                    Files.size(realFile)
            );
        } catch (IOException exception) {
            throw new ResponseStatusException(
                    HttpStatus.NOT_FOUND,
                    "Stored document file not found",
                    exception
            );
        }
    }

    @Transactional(rollbackFor = Exception.class)
    public void delete(String documentId) throws IOException {
        validateDocumentId(documentId);
        ReentrantLock lock = acquireDocumentLock(documentId);
        try {
            deleteLocked(documentId);
        } finally {
            releaseDocumentLock(lock);
        }
    }

    protected void deleteLocked(String documentId) throws IOException {
        DocumentMetadata metadata = findDocument(documentId);
        Path original = resolveStoredPath(metadata.getStoragePath());
        Path staged = resolveStoredPath(
                ".deleting-" + UUID.randomUUID() + ".tmp"
        );
        boolean moved = false;

        try {
            if (Files.exists(original)) {
                move(original, staged);
                moved = true;
            }

            parsingService.delete(documentId);

            repository.delete(metadata);
            repository.flush();
            if (moved) {
                Files.delete(staged);
                moved = false;
            }
            notifySafely(
                    NotificationType.DOCUMENT_DELETED,
                    documentId,
                    metadata.getOriginalName(),
                    true
            );
        } catch (Exception exception) {
            if (moved && Files.exists(staged)) {
                try {
                    move(staged, original);
                } catch (IOException restoreException) {
                    exception.addSuppressed(restoreException);
                    LOGGER.error(
                            "Failed to restore staged file for documentId={}",
                            documentId
                    );
                }
            }
            LOGGER.warn(
                    "Document deletion failed for documentId={} cause={}",
                    documentId,
                    exception.getClass().getSimpleName()
            );
            if (exception instanceof ResponseStatusException response) {
                throw response;
            }
            if (exception instanceof IOException ioException) {
                throw ioException;
            }
            throw new ResponseStatusException(
                    HttpStatus.BAD_GATEWAY,
                    "Document deletion was not completed",
                    exception
            );
        }
    }

    private void persistRetryFailure(
            DocumentMetadata metadata,
            String retryEvent,
            IndexingFailure failure
    ) {
        metadata.markIndexFailed(failure.code(), failure.message());
        repository.saveAndFlush(metadata);
        notifyIndexFailureSafely(
                metadata.getDocumentId(),
                metadata.getOriginalName(),
                retryEvent + ":" + NotificationType.INDEX_FAILED.name(),
                failure.message()
        );
        LOGGER.warn(
                "Indexing retry failed for documentId={}",
                metadata.getDocumentId()
        );
    }

    private ReentrantLock acquireDocumentLock(String documentId) {
        ReentrantLock lock = documentLocks.computeIfAbsent(
                documentId,
                ignored -> new ReentrantLock()
        );
        if (!lock.tryLock()) {
            throw new ResponseStatusException(
                    HttpStatus.CONFLICT,
                    "A document operation is already in progress"
            );
        }
        return lock;
    }

    private void releaseDocumentLock(ReentrantLock lock) {
        lock.unlock();
    }

    private static void move(Path source, Path target) throws IOException {
        try {
            Files.move(source, target, StandardCopyOption.ATOMIC_MOVE);
        } catch (AtomicMoveNotSupportedException exception) {
            Files.move(source, target);
        }
    }

    private void notifySafely(
            NotificationType type,
            String documentId,
            String originalName,
            boolean afterCommit
    ) {
        try {
            if (afterCommit) {
                notifications.recordAfterCommit(type, documentId, originalName);
            } else {
                notifications.recordSafely(type, documentId, originalName);
            }
        } catch (RuntimeException exception) {
            LOGGER.warn(
                    "Notification dispatch failed for type={} documentId={} cause={}",
                    type,
                    documentId,
                    exception.getClass().getSimpleName()
            );
        }
    }

    private void notifyRetrySafely(
            NotificationType type,
            String documentId,
            String originalName,
            String retryEvent
    ) {
        try {
            notifications.recordSafely(
                    type,
                    documentId,
                    originalName,
                    retryEvent + ":" + type.name()
            );
        } catch (RuntimeException exception) {
            LOGGER.warn(
                    "Retry notification dispatch failed for type={} "
                            + "documentId={} cause={}",
                    type,
                    documentId,
                    exception.getClass().getSimpleName()
            );
        }
    }

    private void notifyIndexFailureSafely(
            String documentId,
            String originalName,
            String eventKey,
            String failureReason
    ) {
        try {
            notifications.recordIndexFailureSafely(
                    documentId,
                    originalName,
                    eventKey,
                    failureReason
            );
        } catch (RuntimeException exception) {
            LOGGER.warn(
                    "Index failure notification dispatch failed for "
                            + "documentId={} cause={}",
                    documentId,
                    exception.getClass().getSimpleName()
            );
        }
    }

    private static IndexingFailure indexingFailure(Throwable exception) {
        if (exception instanceof DocumentIndexingException indexingException) {
            String code = indexingException.getErrorCode();
            String message = "NO_EXTRACTABLE_TEXT".equals(code)
                    ? NO_EXTRACTABLE_TEXT
                    : indexingException.getSafeMessage();
            return new IndexingFailure(code, message);
        }
        if (exception instanceof ResourceAccessException) {
            return new IndexingFailure(
                    "AI_SERVICE_UNAVAILABLE",
                    "AI indexing service is unavailable."
            );
        }
        return new IndexingFailure(
                "INDEXING_FAILED",
                "Document indexing failed."
        );
    }

    private record IndexingFailure(String code, String message) { }

    private void validateUpload(MultipartFile file) {
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
        String filename = safeFilename(file.getOriginalFilename());
        if (!ALLOWED.contains(extensionOf(filename))) {
            throw new ResponseStatusException(
                    HttpStatus.BAD_REQUEST,
                    "Unsupported file format"
            );
        }
    }

    private static String safeFilename(String original) {
        if (original == null || original.isBlank()) {
            throw new ResponseStatusException(
                    HttpStatus.BAD_REQUEST,
                    "Invalid filename"
            );
        }
        String normalized = original.replace('\\', '/');
        String filename = normalized.substring(normalized.lastIndexOf('/') + 1);
        if (filename.isBlank()) {
            throw new ResponseStatusException(
                    HttpStatus.BAD_REQUEST,
                    "Invalid filename"
            );
        }
        return filename;
    }

    private static String extensionOf(String filename) {
        int dot = filename.lastIndexOf('.');
        return dot < 0
                ? ""
                : filename.substring(dot + 1).toLowerCase(Locale.ROOT);
    }

    private static String sanitizeResponseFilename(String filename) {
        return filename.replace('\r', '_').replace('\n', '_');
    }

    private static void validateDocumentId(String documentId) {
        if (documentId == null || !DOCUMENT_ID.matcher(documentId).matches()) {
            throw new ResponseStatusException(
                    HttpStatus.BAD_REQUEST,
                    "Invalid document ID"
            );
        }
    }

    private DocumentMetadata findDocument(String documentId) {
        validateDocumentId(documentId);
        return repository.findById(documentId)
                .orElseThrow(() -> new ResponseStatusException(
                        HttpStatus.NOT_FOUND,
                        "Document not found"
                ));
    }

    private Path resolveStoredPath(String relativePath) {
        if (relativePath == null || relativePath.isBlank()) {
            throw new ResponseStatusException(
                    HttpStatus.INTERNAL_SERVER_ERROR,
                    "Invalid stored document path"
            );
        }
        Path relative = Path.of(relativePath);
        if (relative.isAbsolute()) {
            throw new ResponseStatusException(
                    HttpStatus.INTERNAL_SERVER_ERROR,
                    "Invalid stored document path"
            );
        }
        Path resolved = storageRoot.resolve(relative).normalize();
        if (!resolved.startsWith(storageRoot) || resolved.equals(storageRoot)) {
            throw new ResponseStatusException(
                    HttpStatus.INTERNAL_SERVER_ERROR,
                    "Invalid stored document path"
            );
        }
        return resolved;
    }
}
