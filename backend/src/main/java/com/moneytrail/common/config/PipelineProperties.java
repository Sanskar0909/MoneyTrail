package com.moneytrail.common.config;

import org.springframework.boot.context.properties.ConfigurationProperties;

import java.math.BigDecimal;
import java.time.Duration;

/**
 * Tuning knobs for the async job pipeline.
 *
 * <p>{@code leaseDuration} is the one to be careful with. A job is claimed by stamping
 * {@code locked_at}; if it is still RUNNING that long afterwards, the poller assumes the worker
 * died and hands the job to someone else. Set it too short and a merely-slow worker gets its job
 * stolen and the work runs twice. The safe floor is:
 *
 * <pre>leaseDuration &gt; worst-case queue wait + worst-case processing time</pre>
 */
@ConfigurationProperties(prefix = "moneytrail.pipeline")
public record PipelineProperties(
        long jobPollIntervalMs,
        int batchSize,
        Duration leaseDuration,
        BigDecimal autoConfirmThreshold) {
}
