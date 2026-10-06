package com.moneytrail.receipt;

import java.math.BigDecimal;
import java.time.Instant;
import java.time.LocalDate;
import java.util.Optional;

public record ReceiptDetailResponse(
        Long id,
        ReceiptStatus status,
        String originalFilename,
        String merchantName,
        LocalDate receiptDate,
        BigDecimal totalAmount,
        String currency,
        Instant uploadedAt,
        Extraction extraction
) {
    public record Extraction(
        BigDecimal subtotal,
        BigDecimal tax,
        BigDecimal tip,
        BigDecimal confidenceScore) {
    }

    public static ReceiptDetailResponse from(Receipt receipt, Optional<ReceiptExtraction> receiptExtraction) {

        Extraction extraction1 = null;

        if(receiptExtraction.isPresent()) {
            ReceiptExtraction receiptExtractionGet = receiptExtraction.get();
            extraction1 = new Extraction(
                    receiptExtractionGet.getSubtotal(),
                    receiptExtractionGet.getTax(),
                    receiptExtractionGet.getTip(),
                    receiptExtractionGet.getConfidenceScore()
            );
        }

        return new ReceiptDetailResponse(
                receipt.getId(),
                receipt.getStatus(),
                receipt.getOriginalFilename(),
                receipt.getMerchantName(),
                receipt.getReceiptDate(),
                receipt.getTotalAmount(),
                receipt.getCurrency(),
                receipt.getUploadedAt(),
                extraction1
        );
    }
}
