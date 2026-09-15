package com.moneytrail.receipt;

import org.springframework.stereotype.Component;

import java.math.BigDecimal;
import java.time.LocalDate;

@Component
public class StubReceiptExtractionClient implements ReceiptExtractionClient {
    @Override
    public ExtractionResult processImage(byte[] image, String contentType) {
        ExtractionResult extractionResult = new ExtractionResult(
                "Test Store",
                LocalDate.now(),
                new BigDecimal("5.00"),      // tip
                new BigDecimal("18.00"),     // tax
                new BigDecimal("77.00"),     // subtotal
                new BigDecimal("100.00"),    // totalAmount
                new BigDecimal("0.95"),      // confidenceScore
                "{\"merchant\":\"Test Store\",\"total\":100.00}"
        );

        return extractionResult;
    }

    @Override
    public String provider() {
        return "Stub_provider";
    }

    @Override
    public String model() {
        return "Stub_model";
    }
}
