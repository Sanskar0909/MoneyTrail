package com.moneytrail.receipt;

import jakarta.persistence.*;
import lombok.Getter;
import org.hibernate.annotations.JdbcTypeCode;
import org.hibernate.type.SqlTypes;

import java.math.BigDecimal;
import java.time.Instant;
import java.time.LocalDate;

@Entity
@Table(name = "receipt_extractions")
@Getter
public class ReceiptExtraction {

    protected ReceiptExtraction() {

    }

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(nullable = false)
    private Long receiptId;

    @Column(nullable = false)
    private int attemptNumber;

    @Column(nullable = false)
    private String llmProvider;

    private String llmModel;

    private Integer durationMs;

    @Column(nullable = false)
    @JdbcTypeCode(SqlTypes.JSON)
    private String rawResponse;

    private String errorMessage;

    @Column(nullable = false)
    private boolean parsedSuccessfully;

    private String merchantName;
    private LocalDate receiptDate;
    private BigDecimal tip;
    private BigDecimal tax;
    private BigDecimal subtotal;
    private BigDecimal totalAmount;
    private BigDecimal confidenceScore;

    private Boolean validationPassed;

    @JdbcTypeCode(SqlTypes.JSON)
    private String validationDetails;

    @Column(nullable = false)
    private Instant createdAt;

    private ReceiptExtraction(int attemptNumber, BigDecimal confidenceScore, Instant createdAt, Integer durationMs, String errorMessage, Long id, String llmModel, String llmProvider, String merchantName, boolean parsedSuccessfully, String rawResponse, LocalDate receiptDate, Long receiptId, BigDecimal subtotal, BigDecimal tax, BigDecimal tip, BigDecimal totalAmount, String validationDetails, Boolean validationPassed) {
        this.attemptNumber = attemptNumber;
        this.confidenceScore = confidenceScore;
        this.createdAt = createdAt;
        this.durationMs = durationMs;
        this.errorMessage = errorMessage;
        this.id = id;
        this.llmModel = llmModel;
        this.llmProvider = llmProvider;
        this.merchantName = merchantName;
        this.parsedSuccessfully = parsedSuccessfully;
        this.rawResponse = rawResponse;
        this.receiptDate = receiptDate;
        this.receiptId = receiptId;
        this.subtotal = subtotal;
        this.tax = tax;
        this.tip = tip;
        this.totalAmount = totalAmount;
        this.validationDetails = validationDetails;
        this.validationPassed = validationPassed;
    }

    public static ReceiptExtraction failed(Long receiptId, int attemptNumber,
                                           String llmProvider, String llmModel,
                                           String rawResponse, String errorMessage,
                                           Integer durationMs) {

        ReceiptExtraction receiptExtraction = new ReceiptExtraction();
        receiptExtraction.receiptId = receiptId;
        receiptExtraction.attemptNumber = attemptNumber;
        receiptExtraction.llmProvider = llmProvider;
        receiptExtraction.llmModel = llmModel;
        receiptExtraction.rawResponse = rawResponse;
        receiptExtraction.errorMessage = errorMessage;
        receiptExtraction.durationMs = durationMs;
        receiptExtraction.parsedSuccessfully = false;
        receiptExtraction.createdAt = Instant.now();

        return receiptExtraction;
    }

    public static ReceiptExtraction succeeded(Long receiptId, int attemptNumber, String llmProvider,
                                              String llmModel, Integer durationMs,
                                              ExtractionResult extractionResult) {

        ReceiptExtraction receiptExtraction = new ReceiptExtraction();
        receiptExtraction.receiptId = receiptId;
        receiptExtraction.attemptNumber = attemptNumber;
        receiptExtraction.llmProvider = llmProvider;
        receiptExtraction.llmModel = llmModel;
        receiptExtraction.durationMs = durationMs;
        receiptExtraction.rawResponse = extractionResult.rawResponse();
        receiptExtraction.parsedSuccessfully = true;
        receiptExtraction.createdAt = Instant.now();

        receiptExtraction.merchantName = extractionResult.merchantName();
        receiptExtraction.receiptDate = extractionResult.receiptDate();
        receiptExtraction.tip = extractionResult.tip();
        receiptExtraction.tax = extractionResult.tax();
        receiptExtraction.subtotal = extractionResult.subtotal();
        receiptExtraction.totalAmount = extractionResult.totalAmount();
        receiptExtraction.confidenceScore = extractionResult.confidenceScore();

        return receiptExtraction;
    }
}
