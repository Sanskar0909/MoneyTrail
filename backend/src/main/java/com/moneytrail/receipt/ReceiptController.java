package com.moneytrail.receipt;

import org.springframework.core.io.Resource;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.multipart.MultipartFile;

import java.util.List;
import java.util.Optional;

@RestController
@RequestMapping("/api/receipts")
public class ReceiptController {

    private final ReceiptService receiptService;

    public ReceiptController(ReceiptService receiptService) {
        this.receiptService = receiptService;
    }

    @PostMapping
    @ResponseStatus(HttpStatus.CREATED)
    public ReceiptResponse addReceipt(@RequestParam("file") MultipartFile file) {
        return receiptService.addReceipt(file);
    }

    @GetMapping
    public List<ReceiptResponse> listReceipts() {
        return receiptService.listReceipts();
    }

    @GetMapping("/{id}")
    public ReceiptDetailResponse getReceipt(@PathVariable("id") Long receiptId) {
        return receiptService.getReceipt(receiptId);
    }

    @GetMapping("/{id}/image")
    public ResponseEntity<byte[]> getReceiptImage(@PathVariable("id") Long receiptId) {
        ReceiptImage receiptImage = receiptService.getReceiptImage(receiptId);

        return ResponseEntity.ok()
                .contentType(MediaType.parseMediaType(receiptImage.contentType()))
                .body(receiptImage.image());
    }

    @PatchMapping("/{id}")
    public ReceiptDetailResponse updateReceipt(@PathVariable("id") Long receiptId, @RequestBody ReceiptUpdateRequest receiptUpdateRequest) {
        return receiptService.updateReceipt(receiptId, receiptUpdateRequest);
    }

    @PostMapping("/{id}/confirm")
    public ReceiptDetailResponse confirmReceipt(@PathVariable("id") Long receiptId) {
        return receiptService.confirmReceipt(receiptId);
    }
}
