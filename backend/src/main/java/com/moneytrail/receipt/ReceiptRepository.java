package com.moneytrail.receipt;

import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;

public interface ReceiptRepository extends JpaRepository<Receipt, Long> {

    List<Receipt> findByOwnerIdOrderByUploadedAtDesc(Long ownerId);

    List<Receipt> findByOwnerIdAndStatusOrderByUploadedAtDesc(Long ownerId, ReceiptStatus status);
}
