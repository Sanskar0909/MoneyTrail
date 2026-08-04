package com.moneytrail.receipt;

import java.math.BigDecimal;
import java.time.Instant;
import java.time.LocalDate;

/**
 * What the API returns for a receipt. Deliberately separate from the {@link Receipt} entity so
 * the database schema can change without breaking clients.
 */
public record ReceiptResponse(
        Long id,
        ReceiptStatus status,
        String originalFilename,
        String merchantName,
        LocalDate receiptDate,
        BigDecimal totalAmount,
        String currency,
        Instant uploadedAt
) {

    public static ReceiptResponse from(Receipt receipt) {
        return new ReceiptResponse(
                receipt.getId(),
                receipt.getStatus(),
                receipt.getOriginalFilename(),
                receipt.getMerchantName(),
                receipt.getReceiptDate(),
                receipt.getTotalAmount(),
                receipt.getCurrency(),
                receipt.getUploadedAt()
        );
    }
}
