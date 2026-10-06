package com.moneytrail.receipt;

import org.springframework.data.jpa.repository.JpaRepository;

import java.util.Optional;

public interface ReceiptExtractionRepository extends JpaRepository<ReceiptExtraction, Long> {

    Optional<ReceiptExtraction> findFirstByReceiptIdAndParsedSuccessfullyTrueOrderByAttemptNumberDesc(Long receiptId);
}
