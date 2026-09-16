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

        byte[] image;
        try (InputStream inputStream = fileStorageClient.getObject(receipt.getStorageKey())) {
            image = inputStream.readAllBytes();
        } catch (IOException e) {
            throw new StorageException("Could not read image " + receipt.getStorageKey(), e);
        }

        long start = System.nanoTime();
        ExtractionResult extractionResult = receiptExtractionClient.processImage(image, receipt.getContentType());
        int durationMs = (int) ((System.nanoTime() - start) / 1_000_000);

        boolean updated = processingJobWorkerMapping.mapChanges(jobId, receipt.getId(),
                job.getAttemptCount(), extractionResult,
                receiptExtractionClient.provider(), receiptExtractionClient.model(), durationMs);

        if (updated) {
            log.info("Job {} finished: receipt {} is ready for review ({} ms)", jobId, receipt.getId(), durationMs);
        } else {
            log.info("Job {} discarded: receipt {} changed while the extraction was running", jobId, receipt.getId());
        }
    }
}
