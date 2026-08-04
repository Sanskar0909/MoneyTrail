package com.moneytrail.receipt;

import jakarta.persistence.*;
import jakarta.validation.constraints.NotNull;
import lombok.AllArgsConstructor;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

import java.math.BigDecimal;
import java.time.Instant;
import java.time.LocalDate;

@Entity
@Table(name = "receipts")
@NoArgsConstructor
@AllArgsConstructor
@Getter
@Setter
public class Receipt {
    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(nullable = false)
    private Long ownerId;

    private String merchantName;

    @Column(nullable = false)
    @Enumerated(EnumType.STRING)
    private ReceiptStatus status;

    @Column(nullable = false)
    private String storageKey;

    @Column(nullable = false)
    private String originalFilename;

    @Column(nullable = false)
    private String contentType;

    @Column(nullable = false)
    private Long fileSizeBytes;

    private LocalDate receiptDate;

    private BigDecimal totalAmount;

    @Column(nullable = false)
    private String currency = "INR";

    @Column(nullable = false)
    private Instant uploadedAt;
}
