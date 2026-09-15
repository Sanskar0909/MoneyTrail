package com.moneytrail.receipt;

import java.math.BigDecimal;
import java.time.LocalDate;

public record ExtractionResult(
        String merchantName,
        LocalDate receiptDate,
        BigDecimal tip,
        BigDecimal tax,
        BigDecimal subtotal,
        BigDecimal totalAmount,
        BigDecimal confidenceScore,
        String rawResponse
) {

}
