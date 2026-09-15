package com.moneytrail.receipt;

public interface ReceiptExtractionClient {
    ExtractionResult processImage(byte[] image, String contentType);
    String provider();
    String model();
}
