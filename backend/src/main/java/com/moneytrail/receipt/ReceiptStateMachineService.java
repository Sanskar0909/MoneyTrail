package com.moneytrail.receipt;

import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.*;

@Service
public class ReceiptStateMachineService {

    private static final EnumMap<ReceiptStatus, Set<ReceiptStatus>> ALLOWED = new EnumMap<>(Map.of(

            ReceiptStatus.UPLOADED, EnumSet.of(ReceiptStatus.PROCESSING),
            ReceiptStatus.PROCESSING, EnumSet.of(ReceiptStatus.NEEDS_REVIEW, ReceiptStatus.FAILED, ReceiptStatus.PROCESSING),
            ReceiptStatus.NEEDS_REVIEW, EnumSet.of(ReceiptStatus.CONFIRMED),
            ReceiptStatus.CONFIRMED, EnumSet.of(ReceiptStatus.NEEDS_REVIEW),
            ReceiptStatus.EXTRACTED, EnumSet.noneOf(ReceiptStatus.class),
            ReceiptStatus.FAILED, EnumSet.noneOf(ReceiptStatus.class)
    ));

    private final ReceiptRepository receiptRepository;

    public ReceiptStateMachineService(ReceiptRepository receiptRepository) {
        this.receiptRepository = receiptRepository;
    }

    public boolean isLegal(ReceiptStatus from, ReceiptStatus to) {
        return ALLOWED.getOrDefault(from, EnumSet.noneOf(ReceiptStatus.class)).contains(to);
    }

    @Transactional
    public boolean transition(Long receiptId, ReceiptStatus from, ReceiptStatus to) {
        if(!isLegal(from, to))
            throw new IllegalStateException("Cannot transition from " + from + " to " + to);

        return receiptRepository.compareAndSetStatus(receiptId, from, to) == 1;
    }
}
