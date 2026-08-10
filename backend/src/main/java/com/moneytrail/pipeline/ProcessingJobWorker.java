package com.moneytrail.pipeline;

import org.springframework.scheduling.annotation.Async;
import org.springframework.stereotype.Component;

@Component
public class ProcessingJobWorker {

    @Async("receiptProcessingExecutor")
    public void processJob(Long jobId) {

    }
}
