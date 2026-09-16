package com.moneytrail.pipeline;

import com.moneytrail.receipt.*;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * The database half of processing a job. Everything here runs in one short transaction, after the
 * slow extraction call has already finished, so no row is locked while the model is working.
 *
 * <p>Takes IDs rather than entities: anything the worker loaded earlier is no longer tracked by
 * Hibernate, so changes made to it here would silently never be saved.
 */
@Service
public class ProcessingJobWorkerMapping {

    private final ReceiptRepository receiptRepository;
    private final ReceiptStateMachineService receiptStateMachineService;
    private final ReceiptExtractionRepository receiptExtractionRepository;
    private final ProcessingJobRepository processingJobRepository;

    public ProcessingJobWorkerMapping(ReceiptRepository receiptRepository,
                                      ReceiptStateMachineService receiptStateMachineService,
                                      ReceiptExtractionRepository receiptExtractionRepository,
                                      ProcessingJobRepository processingJobRepository) {
        this.receiptRepository = receiptRepository;
        this.receiptStateMachineService = receiptStateMachineService;
        this.receiptExtractionRepository = receiptExtractionRepository;
        this.processingJobRepository = processingJobRepository;
    }

    /**
     * Records the attempt and, if this worker is still the one that owns the receipt, copies the
     * extracted values onto it.
     *
     * @return true if the receipt was updated, false if someone else finished or confirmed it while
     *         the extraction was running
     */
    @Transactional
    public boolean mapChanges(Long jobId, Long receiptId, int attemptNumber,
                              ExtractionResult extractionResult,
                              String llmProvider, String llmModel, int durationMs) {

        receiptExtractionRepository.save(ReceiptExtraction.succeeded(
                receiptId, attemptNumber, llmProvider, llmModel, durationMs, extractionResult));

        boolean stillOurs = receiptStateMachineService.transition(
                receiptId, ReceiptStatus.PROCESSING, ReceiptStatus.NEEDS_REVIEW);

        ProcessingJob job = processingJobRepository.findById(jobId).orElseThrow();
        job.markAsSucceeded();

        if (!stillOurs) {
            return false;
        }

        Receipt receipt = receiptRepository.findById(receiptId).orElseThrow();
        receipt.setMerchantName(extractionResult.merchantName());
        receipt.setReceiptDate(extractionResult.receiptDate());
        receipt.setTotalAmount(extractionResult.totalAmount());

        return true;
    }

    /**
     * Closes out a job that has nothing left to do. Without this the job would stay RUNNING, get
     * reclaimed when its lease expires, and repeat the same pointless work until it ran out of
     * attempts.
     */
    @Transactional
    public void completeJob(Long jobId) {
        processingJobRepository.findById(jobId).ifPresent(ProcessingJob::markAsSucceeded);
    }
}
