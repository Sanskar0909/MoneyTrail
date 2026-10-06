package com.moneytrail.receipt;

import com.moneytrail.common.config.ExtractionProperties;
import lombok.extern.slf4j.Slf4j;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.stereotype.Component;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.ObjectMapper;
import tools.jackson.databind.json.JsonMapper;

import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.charset.StandardCharsets;
import java.time.LocalDate;
import java.util.Base64;
import java.util.Date;
import java.util.Map;

/**
 * Reads receipts with Google's Gemini API.
 *
 * <p>Plain HTTP rather than a client library: this makes exactly one call, and the official Java
 * SDK would be a large dependency for a single POST.
 */
@Slf4j
@Component
@ConditionalOnProperty(name = "moneytrail.extraction.provider", havingValue = "gemini")
public class GeminiReceiptExtractionClient implements ReceiptExtractionClient {

    private static final String ENDPOINT =
            "https://generativelanguage.googleapis.com/v1beta/models/%s:generateContent";

    /**
     * What the model is asked to do.
     *
     * <p>Two rules matter more than the rest. It must never invent a value — a guessed total is
     * worse than a null, because a null shows up in review while a plausible wrong number does not.
     * And it must never calculate subtotal, tax or tip: those exist so the validation step can
     * check the arithmetic against the printed total, and a model that computes them would make
     * every receipt add up perfectly whether or not it read the numbers correctly.
     */
    private static final String PROMPT = """
            You are reading a photograph of a shop receipt. Return only JSON, matching this shape:

            {
              "merchantName":    string or null,
              "receiptDate":     string or null,
              "subtotal":        number or null,
              "tax":             number or null,
              "tip":             number or null,
              "totalAmount":     number or null,
              "confidenceScore": number
            }

            Rules:
            - merchantName: the shop's name as printed at the top. Not the branch address, not the
              cashier, not a tagline. Null if you cannot read it.
            - receiptDate: the date printed on the receipt, formatted yyyy-MM-dd. Indian receipts
              usually print dd/mm/yyyy, so 03/04/2026 means 3 April 2026. Null if absent or
              ambiguous. Never substitute today's date.
            - subtotal, tax, tip: only if printed as their own line. Do not calculate them, do not
              infer them from the total, and do not treat a discount or a rounding line as tax.
              Null when the receipt does not show them.
            - totalAmount: the final amount payable, after tax and any discount. If several totals
              are printed, take the one the customer actually paid.
            - All amounts: plain numbers, no currency symbol, no thousands separator, two decimal
              places. 1,234.50 becomes 1234.50.
            - confidenceScore: between 0 and 1, how sure you are that the values above are correct.
              Use a low score for a blurry, cropped, creased or partly unreadable photo.
            - If the image is not a receipt at all, return nulls for every field and a
              confidenceScore of 0.

            Never guess. A null is correct when the receipt does not show a value or you cannot read
            it; an invented value is not.
            """;

    private final ExtractionProperties.Gemini config;
    private final ObjectMapper objectMapper;
    private final HttpClient httpClient;

    public GeminiReceiptExtractionClient(ExtractionProperties extractionProperties, ObjectMapper objectMapper) {
        this.config = extractionProperties.gemini();
        this.objectMapper = objectMapper;
        this.httpClient = HttpClient.newBuilder()
                .connectTimeout(config.timeout())
                .build();
    }

    @Override
    public ExtractionResult processImage(byte[] image, String contentType) {
        String responseBody = callGemini(image, contentType);
        String modelText = extractText(responseBody);
        return toExtractionResult(modelText, responseBody);
    }

    @Override
    public String provider() {
        return "google";
    }

    @Override
    public String model() {
        return config.model();
    }

    /**
     * TODO (yours): turn the model's JSON into an ExtractionResult.
     *
     * @param modelText    the JSON the model produced — the shape your PROMPT asked for
     * @param rawResponse  Gemini's full response envelope, stored verbatim in receipt_extractions
     *                     so a bad parse can be diagnosed later
     */
    private ExtractionResult toExtractionResult(String modelText, String rawResponse) {
        try {
            ExtractionResult extractionResult = objectMapper.readValue(modelText, ExtractionResult.class);

            return new ExtractionResult(extractionResult.merchantName(), extractionResult.receiptDate(), extractionResult.tip(), extractionResult.tax(), extractionResult.subtotal(), extractionResult.totalAmount(), extractionResult.confidenceScore(), rawResponse);
        } catch (Exception e) {
            throw new ExtractionException("Couldn't parse model response: " + truncate(modelText), e);
        }
    }

    /** Sends the image and the prompt, and returns the raw response body. */
    private String callGemini(byte[] image, String contentType) {
        // Gemini takes images inline as base64, which inflates them by about a third. A 15MB upload
        // becomes ~20MB on the wire; large photos are worth downscaling before this point.
        String encodedImage = Base64.getEncoder().encodeToString(image);

        Map<String, Object> body = Map.of(
                "contents", java.util.List.of(Map.of(
                        "parts", java.util.List.of(
                                Map.of("inline_data", Map.of(
                                        "mime_type", contentType,
                                        "data", encodedImage)),
                                Map.of("text", PROMPT)))),
                // Asks the model for JSON instead of prose wrapped in markdown fences.
                "generationConfig", Map.of("responseMimeType", "application/json"));

        HttpRequest request = HttpRequest.newBuilder()
                .uri(URI.create(ENDPOINT.formatted(config.model())))
                // Header rather than ?key=, so the key never lands in a URL, a log, or a proxy trace.
                .header("x-goog-api-key", config.apiKey())
                .header("Content-Type", "application/json")
                .timeout(config.timeout())
                .POST(HttpRequest.BodyPublishers.ofString(
                        objectMapper.writeValueAsString(body), StandardCharsets.UTF_8))
                .build();

        HttpResponse<String> response;
        try {
            response = httpClient.send(request, HttpResponse.BodyHandlers.ofString());
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
            throw new ExtractionException("Interrupted while calling Gemini", e);
        } catch (Exception e) {
            throw new ExtractionException("Could not reach Gemini", e);
        }

        if (response.statusCode() != 200) {
            // 429 and 5xx are worth retrying, 400/401/403 are not — the worker currently retries
            // everything, so a bad key burns all three attempts. Fine for now; worth splitting once
            // real rate limits show up.
            throw new ExtractionException(
                    "Gemini returned " + response.statusCode() + ": " + truncate(response.body()));
        }
        return response.body();
    }

    /** Digs the model's own output out of Gemini's response envelope. */
    private String extractText(String responseBody) {
        JsonNode root = objectMapper.readTree(responseBody);
        JsonNode text = root.path("candidates").path(0).path("content").path("parts").path(0).path("text");
        if (text.isMissingNode() || !text.isString()) {
            // Usually means the response was blocked by a safety filter or hit a token limit, in
            // which case the envelope explains why — hence the full body in the message.
            throw new ExtractionException("No text in Gemini response: " + truncate(responseBody));
        }
        return text.stringValue();
    }

    private static String truncate(String value) {
        if (value == null) return "";
        return value.length() <= 500 ? value : value.substring(0, 500) + "…";
    }
}
