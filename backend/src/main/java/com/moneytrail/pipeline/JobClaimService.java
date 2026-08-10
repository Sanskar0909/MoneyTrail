package com.moneytrail.pipeline;

import com.moneytrail.common.config.PipelineProperties;

import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.net.InetAddress;
import java.net.UnknownHostException;
import java.time.Instant;
import java.util.ArrayList;
import java.util.List;

@Service
public class JobClaimService {

    private final ProcessingJobRepository processingJobRepository;
    private final PipelineProperties pipelineProperties;
    private static final String WORKER_ID = buildWorkerId();

    public  JobClaimService(ProcessingJobRepository processingJobRepository, PipelineProperties pipelineProperties) {
        this.processingJobRepository = processingJobRepository;
        this.pipelineProperties = pipelineProperties;
    }

    @Transactional
    public List<Long> claimJobs() {
        List<Long> claimedJobs = new ArrayList<>();
        Instant now = Instant.now();
        Instant stale = now.minus(pipelineProperties.leaseDuration());

        List<ProcessingJob> jobs = processingJobRepository.claimJobs(now, stale, pipelineProperties.batchSize());

        for(ProcessingJob job: jobs) {
            if(!job.hasAttemptsRemaining()) {
                job.markAsFailed("Exhausted attempts " + job.getMaxAttempts());
                continue;
            }
            job.markAsRunning(WORKER_ID);
            claimedJobs.add(job.getId());
        }

        return claimedJobs;
    }


    private static String buildWorkerId() {
        String host;
        try {
            host = InetAddress.getLocalHost().getHostName();
        } catch (UnknownHostException e) {
            host = "unknown-host";
        }
        return host + "-" + ProcessHandle.current().pid();
    }
}
