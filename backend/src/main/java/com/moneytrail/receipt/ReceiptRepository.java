package com.moneytrail.receipt;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.List;

public interface ReceiptRepository extends JpaRepository<Receipt, Long> {

    List<Receipt> findByOwnerIdOrderByUploadedAtDesc(Long ownerId);

    List<Receipt> findByOwnerIdAndStatusOrderByUploadedAtDesc(Long ownerId, ReceiptStatus status);

    @Modifying(flushAutomatically = true, clearAutomatically = true)
    @Query(value = "UPDATE Receipt r SET r.status = :to WHERE r.status=:from AND r.id = :id")
    int compareAndSetStatus(@Param("id") Long receiptId, @Param("from") ReceiptStatus from, @Param("to") ReceiptStatus to);
}
