package com.moneytrail.pipeline;

import com.moneytrail.receipt.*;
import com.moneytrail.storage.FileStorageClient;
import com.moneytrail.storage.StorageException;
import lombok.extern.slf4j.Slf4j;
import org.springframework.scheduling.annotation.Async;
import org.springframework.stereotype.Component;

import java.io.IOException;
import java.io.InputStream;
import java.util.Optional;

@Slf4j
@Component
public class ProcessingJobWorker {
    private final ProcessingJobRepository processingJobRepository;
    private final ReceiptRepository receiptRepository;
    private final FileStorageClient fileStorageClient;
    private final ReceiptExtractionClient receiptExtractionClient;
    private final ReceiptStateMachineService receiptStateMachineService;
    private final ProcessingJobWorkerMapping processingJobWorkerMapping;

    public ProcessingJobWorker(FileStorageClient fileStorageClient, ProcessingJobRepository processingJobRepository, ProcessingJobWorkerMapping processingJobWorkerMapping, ReceiptExtractionClient receiptExtractionClient, ReceiptRepository receiptRepository, ReceiptStateMachineService receiptStateMachineService) {
        this.fileStorageClient = fileStorageClient;
        this.processingJobRepository = processingJobRepository;
        this.processingJobWorkerMapping = processingJobWorkerMapping;
        this.receiptExtractionClient = receiptExtractionClient;
        this.receiptRepository = receiptRepository;
        this.receiptStateMachineService = receiptStateMachineService;
    }

    /**
     * Deliberately not @Transactional. The extraction call is slow, and a transaction held open
     * across it would tie up a database connection for the whole call. The writes happen at the
     * end, in one short transaction inside ProcessingJobWorkerMapping.
     */
    @Async("receiptProcessingExecutor")
    public void processJob(Long jobId) {

        Optional<ProcessingJob> processingJob = processingJobRepository.findById(jobId);
        if (processingJob.isEmpty()) {
            log.warn("Job {} no longer exists, skipping", jobId);
            return;
        }
        ProcessingJob job = processingJob.get();

        Optional<Receipt> optionalReceipt = receiptRepository.findById(job.getReceiptId());
        if (optionalReceipt.isEmpty()) {
            log.warn("Receipt {} for job {} no longer exists, skipping", job.getReceiptId(), jobId);
            return;
        }
        Receipt receipt = optionalReceipt.get();

        ReceiptStatus current = receipt.getStatus();
        if (current != ReceiptStatus.UPLOADED && current != ReceiptStatus.PROCESSING) {
            log.info("Receipt {} is already {}, closing job {}", receipt.getId(), current, jobId);
            processingJobWorkerMapping.completeJob(jobId);
            return;
        }
        if (!receiptStateMachineService.transition(receipt.getId(), current, ReceiptStatus.PROCESSING)) {
            log.info("Receipt {} changed status before job {} could claim it, closing job", receipt.getId(), jobId);
            processingJobWorkerMapping.completeJob(jobId);
            return;
        }

        // Reading the image and calling the model share one catch: from the job's point of view
        // "storage was down" and "the model broke" are the same event — this attempt produced
        // nothing, so wait and try again.
        long start = System.nanoTime();
        try {
            byte[] image = downloadImage(receipt.getStorageKey());
            ExtractionResult extractionResult =
                    receiptExtractionClient.processImage(image, receipt.getContentType());
            int durationMs = elapsedMs(start);

            boolean updated = processingJobWorkerMapping.mapChanges(jobId, receipt.getId(),
                    job.getAttemptCount(), extractionResult,
                    receiptExtractionClient.provider(), receiptExtractionClient.model(), durationMs);

            if (updated) {
                log.info("Job {} finished: receipt {} is ready for review ({} ms)", jobId, receipt.getId(), durationMs);
            } else {
                log.info("Job {} discarded: receipt {} changed while the extraction was running", jobId, receipt.getId());
            }
        } catch (Exception e) {
            String error = describe(e);
            boolean willRetry = processingJobWorkerMapping.mapFailure(jobId, receipt.getId(),
                    job.getAttemptCount(),
                    receiptExtractionClient.provider(), receiptExtractionClient.model(),
                    error, elapsedMs(start));

            if (willRetry) {
                log.warn("Job {} attempt {} failed, will retry: {}", jobId, job.getAttemptCount(), error);
            } else {
                log.error("Job {} failed permanently after {} attempts: {}", jobId, job.getAttemptCount(), error);
            }
        }
    }

    /** try-with-resources closes the MinIO download even if reading throws. */
    private byte[] downloadImage(String storageKey) {
        try (InputStream inputStream = fileStorageClient.getObject(storageKey)) {
            return inputStream.readAllBytes();
        } catch (IOException e) {
            throw new StorageException("Could not read image " + storageKey, e);
        }
    }

    private int elapsedMs(long startNanos) {
        return (int) ((System.nanoTime() - startNanos) / 1_000_000);
    }

    /** getMessage() alone is often null or bare; the class name is what makes last_error readable. */
    private String describe(Exception e) {
        return e.getClass().getSimpleName() + ": " + e.getMessage();
    }
}
