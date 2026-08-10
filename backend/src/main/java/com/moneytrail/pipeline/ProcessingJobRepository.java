package com.moneytrail.pipeline;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.time.Instant;
import java.util.List;

public interface ProcessingJobRepository extends JpaRepository<ProcessingJob, Long> {

    /**
     * Claims up to {@code batchSize} jobs for this poller, locking the rows so no other
     * poller can take them.
     *
     * <p>Two kinds of row are claimable:
     * <ol>
     *   <li><b>Due PENDING jobs</b> — either never attempted ({@code next_retry_at IS NULL})
     *       or their backoff has elapsed.</li>
     *   <li><b>Stale RUNNING jobs</b> — claimed by a worker that never reported back. Their
     *       lease has expired, so we assume that worker died and hand the job to someone else.
     *       This is the only reason a crashed worker doesn't strand a receipt forever.</li>
     * </ol>
     *
     * <p>{@code FOR UPDATE} locks each returned row for the duration of the transaction.
     * {@code SKIP LOCKED} makes a concurrent poller step over rows we already hold instead of
     * blocking on them — without it, two pollers would serialise and the second would sit idle.
     *
     * <p>The rows come back <em>unchanged</em>: this only reserves them. The caller must call
     * {@link ProcessingJob#markAsRunning(String)} on each one and let the transaction commit
     * before starting any slow work. Locks are released at commit, so holding this transaction
     * open across an LLM call would block every other poller for the length of that call.
     *
     * <p>Ordering by {@code created_at} makes the queue roughly FIFO, so a retry that keeps
     * failing can't starve receipts uploaded after it.
     *
     * @param now         the current instant; a PENDING job is due when next_retry_at &lt;= now
     * @param staleBefore lease cutoff — a RUNNING job locked before this is presumed abandoned
     * @param batchSize   maximum jobs to claim in one poll
     */
    @Query(value = """
            SELECT * FROM processing_jobs
             WHERE (status = 'PENDING' AND (next_retry_at IS NULL OR next_retry_at <= :now))
                OR (status = 'RUNNING' AND locked_at < :staleBefore)
             ORDER BY created_at
             LIMIT :batchSize
             FOR UPDATE SKIP LOCKED
            """, nativeQuery = true)
    List<ProcessingJob> claimJobs(@Param("now") Instant now,
                                  @Param("staleBefore") Instant staleBefore,
                                  @Param("batchSize") int batchSize);

    /**
     * Guards against enqueueing a second job for a receipt that already has one in flight.
     * Useful once a manual "reprocess this receipt" action exists.
     */
    boolean existsByReceiptIdAndStatusIn(Long receiptId, List<JobStatus> statuses);
}
