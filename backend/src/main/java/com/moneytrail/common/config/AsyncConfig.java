package com.moneytrail.common.config;

import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.scheduling.annotation.EnableAsync;
import org.springframework.scheduling.annotation.EnableScheduling;
import org.springframework.scheduling.concurrent.ThreadPoolTaskExecutor;

import java.util.concurrent.Executor;
import java.util.concurrent.ThreadPoolExecutor;

/**
 * Turns on the two annotations the pipeline depends on. Without {@code @EnableScheduling},
 * {@code @Scheduled} methods are silently never invoked; without {@code @EnableAsync},
 * {@code @Async} methods run on the caller's thread — which would make the poller block on
 * every LLM call.
 */
@Configuration
@EnableScheduling
@EnableAsync
public class AsyncConfig {

    /**
     * Thread pool that runs receipt extraction.
     *
     * <p>The queue is deliberately small and the rejection policy is {@code CallerRunsPolicy},
     * which together give the pipeline backpressure. Without it the poller outruns the workers:
     * it claims a batch every few seconds, while each job takes far longer than that to finish.
     * Claimed jobs are already RUNNING with their lease ticking, so a job that sits in a long
     * queue can have its lease expire before it ever starts — it gets reclaimed and runs twice
     * for no reason.
     *
     * <p>{@code CallerRunsPolicy} makes the scheduler thread execute the overflow job itself.
     * That blocks the next poll until it finishes, which is exactly the throttle we want: the
     * poller cannot claim more work while there is nowhere to put it.
     *
     * <p>Shutdown waits for in-flight jobs so a restart doesn't strand rows at RUNNING until
     * their lease expires.
     */
    @Bean
    public Executor receiptProcessingExecutor() {
        ThreadPoolTaskExecutor executor = new ThreadPoolTaskExecutor();
        executor.setCorePoolSize(3);
        executor.setMaxPoolSize(3);
        executor.setQueueCapacity(5);
        executor.setThreadNamePrefix("receipt-worker-");
        executor.setRejectedExecutionHandler(new ThreadPoolExecutor.CallerRunsPolicy());
        executor.setWaitForTasksToCompleteOnShutdown(true);
        executor.setAwaitTerminationSeconds(60);
        executor.initialize();
        return executor;
    }
}
