package com.moneytrail.pipeline;

import com.moneytrail.common.config.PipelineProperties;
import org.springframework.stereotype.Service;

import java.time.Duration;

@Service
public class RetryPolicy {
    private final PipelineProperties pipelineProperties;

    public RetryPolicy(PipelineProperties pipelineProperties) {
        this.pipelineProperties = pipelineProperties;
    }

    public Duration backoffFor(int attemptNumber) {
        return pipelineProperties.retryBaseDelay().multipliedBy(attemptNumber);
    }
}
