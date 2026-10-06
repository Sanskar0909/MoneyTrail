package com.moneytrail.pipeline;

import com.moneytrail.receipt.*;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import tools.jackson.core.JacksonException;
import tools.jackson.databind.ObjectMapper;

import java.util.Map;

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
    private final RetryPolicy retryPolicy;
    private final ObjectMapper objectMapper;

    public ProcessingJobWorkerMapping(ReceiptRepository receiptRepository,
                                      ReceiptStateMachineService receiptStateMachineService,
                                      ReceiptExtractionRepository receiptExtractionRepository,
                                      ProcessingJobRepository processingJobRepository,
                                      RetryPolicy retryPolicy,
                                      ObjectMapper objectMapper) {
        this.receiptRepository = receiptRepository;
        this.receiptStateMachineService = receiptStateMachineService;
        this.receiptExtractionRepository = receiptExtractionRepository;
        this.processingJobRepository = processingJobRepository;
        this.retryPolicy = retryPolicy;
        this.objectMapper = objectMapper;
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

        // Loaded after the transition: compareAndSetStatus clears Hibernate's tracked objects, so
        // anything loaded before it would not have its changes saved.
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
     * Records a failed attempt and decides what happens next: wait and try again, or give up.
     *
     * <p>The receipt only moves to FAILED on the last attempt. Between retries it stays PROCESSING,
     * because it is still in the pipeline and the user has nothing to do about it yet.
     *
     * @return true if the job will be retried, false if it has run out of attempts
     */
    @Transactional
    public boolean mapFailure(Long jobId, Long receiptId, int attemptNumber,
                              String llmProvider, String llmModel,
                              String errorMessage, int durationMs) {

        // The attempt happened and cost real time, so it belongs in the log exactly like a success.
        receiptExtractionRepository.save(ReceiptExtraction.failed(
                receiptId, attemptNumber, llmProvider, llmModel,
                errorJson(errorMessage), errorMessage, durationMs));

        ProcessingJob job = processingJobRepository.findById(jobId).orElseThrow();

        if (job.hasAttemptsRemaining()) {
            job.markForRetry(retryPolicy.backoffFor(attemptNumber), errorMessage);
            return true;
        }

        // Out of attempts. The transition has to come before the job is marked, because it clears
        // the persistence context — a job loaded earlier would be detached and its change lost.
        receiptStateMachineService.transition(receiptId, ReceiptStatus.PROCESSING, ReceiptStatus.FAILED);
        processingJobRepository.findById(jobId).orElseThrow().markAsFailed(errorMessage);
        return false;
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

    /**
     * Wraps an error message as a JSON object, because raw_response is jsonb NOT NULL and a failed
     * call has no response to store. Built with Jackson rather than string concatenation: a real API
     * error often contains quotes, which would produce invalid JSON and lose the record entirely.
     */
    private String errorJson(String message) {
        try {
            return objectMapper.writeValueAsString(Map.of("error", message));
        } catch (JacksonException e) {
            return "{\"error\":\"could not serialise error message\"}";
        }
    }
}
