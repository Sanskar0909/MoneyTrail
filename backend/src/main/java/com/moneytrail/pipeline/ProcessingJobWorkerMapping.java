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

    @Transactional
    public void mapChanges(Long jobId, Long receiptId, ExtractionResult extractionResult,
                           String llmProvider, String llmModel, int durationMs) {

        boolean stillOurs = receiptStateMachineService.transition(
                receiptId, ReceiptStatus.PROCESSING, ReceiptStatus.NEEDS_REVIEW);
        if (!stillOurs) {
            completeJob(jobId);
            return;
        }

        Receipt receipt = receiptRepository.findById(receiptId).orElseThrow();
        ProcessingJob job = processingJobRepository.findById(jobId).orElseThrow();

        receiptExtractionRepository.save(ReceiptExtraction.succeeded(
                receiptId, job.getAttemptCount(), llmProvider, llmModel, durationMs, extractionResult));

        receipt.setMerchantName(extractionResult.merchantName());
        receipt.setReceiptDate(extractionResult.receiptDate());
        receipt.setTotalAmount(extractionResult.totalAmount());

        job.markAsSucceeded();
    }

    @Transactional
    public void completeJob(Long jobId) {
        processingJobRepository.findById(jobId).ifPresent(ProcessingJob::markAsSucceeded);
    }
}
