package com.moneytrail.receipt;

import java.math.BigDecimal;
import java.time.LocalDate;

public record ReceiptUpdateRequest(
        String merchantName,
        LocalDate receiptDate,
        BigDecimal totalAmount
) {
}
