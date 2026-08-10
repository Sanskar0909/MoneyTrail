package com.moneytrail.pipeline;

import jakarta.persistence.*;
import lombok.Getter;
import lombok.NoArgsConstructor;
import java.time.Duration;
import java.time.Instant;

@Entity
@Table(name = "processing_jobs")
@NoArgsConstructor
@Getter
public class ProcessingJob {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(nullable = false)
    private Long receiptId;

    @Column(nullable = false)
    private int maxAttempts = 3;

    @Column(nullable = false)
    private int attemptCount = 0;

    @Column(nullable = false)
    @Enumerated(EnumType.STRING)
    private JobStatus status = JobStatus.PENDING;

    @Column(nullable = false)
    @Enumerated(EnumType.STRING)
    private JobType jobType;

    private Instant nextRetryAt;

    @Column(nullable = false)
    private Instant createdAt = Instant.now();

    @Column(nullable = false)
    private Instant updatedAt = Instant.now();

    private String lockedBy;

    private Instant lockedAt;

    private String lastError;

    public ProcessingJob(Long receiptId, JobType jobType) {
        this.receiptId = receiptId;
        this.jobType = jobType;
    }

    public void markAsRunning(String lockedBy) {
        this.lockedBy = lockedBy;
        this.lockedAt = Instant.now();
        this.attemptCount += 1;
        this.status = JobStatus.RUNNING;
        this.updatedAt = Instant.now();
    }

    public void markAsSucceeded() {
        this.lockedBy = null;
        this.lockedAt = null;
        this.nextRetryAt = null;
        this.status = JobStatus.SUCCEEDED;
        this.updatedAt = Instant.now();
    }

    public void markAsFailed(String error) {
        this.lockedBy = null;
        this.lockedAt = null;
        this.nextRetryAt = null;
        this.status = JobStatus.FAILED;
        this.lastError = error;
        this.updatedAt = Instant.now();
    }

    public void markForRetry(Duration backoff, String error) {
        this.nextRetryAt = Instant.now().plus(backoff);
        this.status = JobStatus.PENDING;
        this.lockedBy = null;
        this.lockedAt = null;
        this.updatedAt = Instant.now();
        this.lastError = error;
    }

    public boolean hasAttemptsRemaining() {
        return this.attemptCount < this.maxAttempts;
    }




}
