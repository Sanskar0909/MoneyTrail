package com.moneytrail.common.config;

import org.springframework.boot.context.properties.ConfigurationProperties;

import java.time.Duration;

/**
 * Which extraction backend to use, and how to reach it.
 *
 * <p>{@code provider} picks the {@code ReceiptExtractionClient} implementation at startup, so the
 * stub stays usable with no API key — useful for tests and for working offline.
 */
@ConfigurationProperties(prefix = "moneytrail.extraction")
public record ExtractionProperties(String provider, Gemini gemini) {

    /**
     * @param apiKey  read from the GEMINI_API_KEY environment variable or backend/.env — never
     *                committed, which is why application.yml holds only the placeholder
     * @param timeout guards the worker thread: without it a hung request would hold a pool thread
     *                until the job's lease expired
     */
    public record Gemini(String apiKey, String model, Duration timeout) {
    }
}
