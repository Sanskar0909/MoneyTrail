package com.moneytrail.receipt;

import jakarta.validation.constraints.Digits;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.PastOrPresent;
import jakarta.validation.constraints.Positive;
import jakarta.validation.constraints.Size;

import java.math.BigDecimal;
import java.time.LocalDate;

/**
 * An entry typed in by hand. It is saved as CONFIRMED with no review step, so the rules a
 * reviewer would have enforced are enforced here instead.
 */
public record ManualEntryRequest(
        @NotBlank @Size(max = 255) String merchantName,
        @NotNull @PastOrPresent LocalDate receiptDate,
        // The column is NUMERIC(12,2): 12 digits in all, 2 of them after the point.
        @NotNull @Positive @Digits(integer = 10, fraction = 2) BigDecimal totalAmount
) {
}
