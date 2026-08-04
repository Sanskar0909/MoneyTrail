package com.moneytrail.receipt;

import com.moneytrail.common.config.UploadProperties;
import com.moneytrail.common.exception.ApiException;
import com.moneytrail.storage.FileStorageClient;
import com.moneytrail.user.CurrentUserProvider;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.multipart.MultipartFile;

import java.io.IOException;
import java.io.InputStream;
import java.time.Instant;
import java.time.ZoneOffset;
import java.time.format.DateTimeFormatter;
import java.util.List;
import java.util.Map;
import java.util.UUID;

@Service
public class ReceiptService {

    private static final Logger log = LoggerFactory.getLogger(ReceiptService.class);

    private static final DateTimeFormatter KEY_DATE_PREFIX =
            DateTimeFormatter.ofPattern("yyyy/MM").withZone(ZoneOffset.UTC);

    private static final Map<String, String> EXTENSION_BY_CONTENT_TYPE = Map.of(
            "image/jpeg", ".jpg",
            "image/png", ".png",
            "image/heic", ".heic",
            "application/pdf", ".pdf"
    );

    private final UploadProperties uploadProperties;
    private final FileStorageClient fileStorageClient;
    private final ReceiptRepository receiptRepository;
    private final CurrentUserProvider currentUserProvider;

    public ReceiptService(UploadProperties uploadProperties,
                          FileStorageClient fileStorageClient,
                          ReceiptRepository receiptRepository,
                          CurrentUserProvider currentUserProvider) {
        this.uploadProperties = uploadProperties;
        this.fileStorageClient = fileStorageClient;
        this.receiptRepository = receiptRepository;
        this.currentUserProvider = currentUserProvider;
    }

    /**
     * Stores the uploaded file and records it as a receipt awaiting extraction.
     *
     * <p>The object store write happens before the database insert on purpose: an object with no
     * row is harmless garbage, while a row pointing at a missing object would enter the pipeline
     * and fail forever. If the insert fails we make a best-effort attempt to remove the object.
     */
    public ReceiptResponse addReceipt(MultipartFile file) {
        validate(file);

        Instant uploadedAt = Instant.now();
        String storageKey = buildStorageKey(uploadedAt, file.getContentType());

        // Deliberately outside any transaction — this streams up to 15MB and must not hold a
        // database connection while it does.
        try (InputStream content = file.getInputStream()) {
            fileStorageClient.putObject(storageKey, content, file.getSize(), file.getContentType());
        } catch (IOException e) {
            throw new ApiException(HttpStatus.INTERNAL_SERVER_ERROR, "Could not read the uploaded file.");
        }

        try {
            return ReceiptResponse.from(persist(file, storageKey, uploadedAt));
        } catch (RuntimeException e) {
            deleteQuietly(storageKey);
            throw e;
        }
    }

    @Transactional(readOnly = true)
    public List<ReceiptResponse> listReceipts() {
        return receiptRepository.findByOwnerIdOrderByUploadedAtDesc(currentUserProvider.currentUserId())
                .stream()
                .map(ReceiptResponse::from)
                .toList();
    }

    private void validate(MultipartFile file) {
        if (file == null || file.isEmpty()) {
            throw new ApiException(HttpStatus.BAD_REQUEST, "A file is required.");
        }
        if (file.getSize() > uploadProperties.maxFileSizeBytes()) {
            throw new ApiException(HttpStatus.PAYLOAD_TOO_LARGE,
                    "File exceeds the maximum size of " + uploadProperties.maxFileSizeBytes() + " bytes.");
        }
        String contentType = file.getContentType();
        if (contentType == null || !uploadProperties.allowedContentTypes().contains(contentType)) {
            throw new ApiException(HttpStatus.UNSUPPORTED_MEDIA_TYPE,
                    "Unsupported file type. Allowed: " + String.join(", ", uploadProperties.allowedContentTypes()));
        }
        if (file.getOriginalFilename() == null || file.getOriginalFilename().isBlank()) {
            throw new ApiException(HttpStatus.BAD_REQUEST, "The uploaded file has no filename.");
        }
    }

    private Receipt persist(MultipartFile file, String storageKey, Instant uploadedAt) {
        Receipt receipt = new Receipt();
        receipt.setOwnerId(currentUserProvider.currentUserId());
        receipt.setStatus(ReceiptStatus.UPLOADED);
        receipt.setStorageKey(storageKey);
        receipt.setOriginalFilename(file.getOriginalFilename());
        receipt.setContentType(file.getContentType());
        receipt.setFileSizeBytes(file.getSize());
        receipt.setUploadedAt(uploadedAt);
        return receiptRepository.save(receipt);
    }

    /**
     * The storage key is generated, never derived from the uploaded filename — that would allow
     * collisions between two "IMG_1234.jpg" uploads and path traversal via "../". The original
     * name is kept on the entity for display instead.
     */
    private String buildStorageKey(Instant uploadedAt, String contentType) {
        String extension = EXTENSION_BY_CONTENT_TYPE.getOrDefault(contentType, "");
        return "receipts/" + KEY_DATE_PREFIX.format(uploadedAt) + "/" + UUID.randomUUID() + extension;
    }

    /**
     * Compensating action for a failed insert. Best-effort by design: if it fails we are left with
     * an unreferenced object, which costs storage but breaks nothing.
     */
    private void deleteQuietly(String storageKey) {
        try {
            fileStorageClient.deleteObject(storageKey);
        } catch (RuntimeException e) {
            log.warn("Orphaned object left in storage at key {} after a failed insert", storageKey, e);
        }
    }
}
