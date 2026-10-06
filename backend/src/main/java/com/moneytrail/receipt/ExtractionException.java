package com.moneytrail.receipt;

/**
 * Thrown when an extraction attempt fails. The worker catches it, records the attempt, and either
 * schedules a retry or fails the job.
 */
public class ExtractionException extends RuntimeException {

    public ExtractionException(String message) {
        super(message);
    }

    public ExtractionException(String message, Throwable cause) {
        super(message, cause);
    }
}
