package com.moneytrail.receipt;

import com.moneytrail.pipeline.JobType;
import com.moneytrail.pipeline.ProcessingJob;
import com.moneytrail.pipeline.ProcessingJobRepository;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class ReceiptCreationService {

    private final ReceiptRepository receiptRepository;
    private final ProcessingJobRepository processingJobRepository;

    public ReceiptCreationService(ProcessingJobRepository processingJobRepository, ReceiptRepository receiptRepository) {
        this.processingJobRepository = processingJobRepository;
        this.receiptRepository = receiptRepository;
    }

    @Transactional
    public Receipt createWithJob(Receipt receipt) {
        Receipt saved = receiptRepository.save(receipt);
        processingJobRepository.save(new ProcessingJob(saved.getId(), JobType.EXTRACT_RECEIPT));

        return saved;
    }
}
