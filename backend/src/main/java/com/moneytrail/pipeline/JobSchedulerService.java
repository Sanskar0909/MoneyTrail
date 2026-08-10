package com.moneytrail.pipeline;

import lombok.extern.slf4j.Slf4j;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

import java.util.List;

@Slf4j
@Component
public class JobSchedulerService {

    private final JobClaimService jobClaimService;
    private final ProcessingJobWorker worker;

    public JobSchedulerService(JobClaimService jobClaimService, ProcessingJobWorker worker) {
        this.jobClaimService = jobClaimService;
        this.worker = worker;
    }

    @Scheduled(fixedDelayString = "${moneytrail.pipeline.job-poll-interval-ms}")
    public void poll() {
        List<Long> ids = jobClaimService.claimJobs();

        for (Long id: ids) {
            try {
                worker.processJob(id);
            } catch (Exception e) {
                log.error("Failed to dispatch job {}", id, e);
            }
        }
    }
}
