ALTER TABLE receipts ALTER COLUMN storage_key DROP NOT NULL;
ALTER TABLE receipts ALTER COLUMN original_filename DROP NOT NULL;
ALTER TABLE receipts ALTER COLUMN content_type DROP NOT NULL;
ALTER TABLE receipts ALTER COLUMN file_size_bytes DROP NOT NULL;

ALTER TABLE receipts ADD COLUMN source VARCHAR(20) NOT NULL DEFAULT 'UPLOAD'
    CHECK (source IN ('UPLOAD', 'MANUAL'));

ALTER TABLE receipts ADD CONSTRAINT receipts_upload_has_file CHECK (
    source = 'MANUAL'
    OR (storage_key IS NOT NULL AND original_filename IS NOT NULL AND content_type IS NOT NULL AND file_size_bytes IS NOT NULL)
    );