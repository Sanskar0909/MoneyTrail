-- MoneyTrail initial schema.
-- Money: NUMERIC(12,2), never float. Timestamps: TIMESTAMPTZ, always UTC.
-- Status/enum columns: VARCHAR + CHECK (not native Postgres ENUM) so adding a new
-- state later is a trivial migration instead of an ALTER TYPE.

CREATE TABLE users (
    id            BIGSERIAL PRIMARY KEY,
    email         VARCHAR(255) NOT NULL UNIQUE,
    display_name  VARCHAR(255),
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE categories (
    id                 BIGSERIAL PRIMARY KEY,
    owner_id           BIGINT REFERENCES users(id),
    parent_category_id BIGINT REFERENCES categories(id),
    name               VARCHAR(100) NOT NULL,
    is_system_default  BOOLEAN NOT NULL DEFAULT false,
    created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT uq_categories_owner_name UNIQUE (owner_id, name)
);

CREATE TABLE receipts (
    id                       BIGSERIAL PRIMARY KEY,
    owner_id                 BIGINT NOT NULL REFERENCES users(id),
    status                   VARCHAR(20) NOT NULL DEFAULT 'UPLOADED'
        CHECK (status IN ('UPLOADED','PROCESSING','EXTRACTED','NEEDS_REVIEW','CONFIRMED','FAILED')),
    storage_key              VARCHAR(500) NOT NULL,
    original_filename        VARCHAR(255) NOT NULL,
    content_type             VARCHAR(100) NOT NULL,
    file_size_bytes          BIGINT NOT NULL,
    merchant_name             VARCHAR(255),
    merchant_name_normalized VARCHAR(255),
    receipt_date             DATE,
    total_amount             NUMERIC(12,2),
    currency                 VARCHAR(3) NOT NULL DEFAULT 'INR',
    category_id              BIGINT REFERENCES categories(id),
    uploaded_at               TIMESTAMPTZ NOT NULL DEFAULT now(),
    processing_started_at    TIMESTAMPTZ,
    extracted_at              TIMESTAMPTZ,
    confirmed_at              TIMESTAMPTZ,
    failed_at                 TIMESTAMPTZ,
    retry_count               INT NOT NULL DEFAULT 0,
    last_error                TEXT,
    created_at                TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at                TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_receipts_owner_status ON receipts(owner_id, status);
CREATE INDEX idx_receipts_owner_date ON receipts(owner_id, receipt_date);
CREATE INDEX idx_receipts_merchant_normalized ON receipts(merchant_name_normalized);

CREATE TABLE receipt_extractions (
    id                   BIGSERIAL PRIMARY KEY,
    receipt_id           BIGINT NOT NULL REFERENCES receipts(id) ON DELETE CASCADE,
    attempt_number       INT NOT NULL,
    llm_provider         VARCHAR(50) NOT NULL,
    llm_model            VARCHAR(100),
    raw_response         JSONB NOT NULL,
    parsed_successfully  BOOLEAN NOT NULL,
    -- Parsed values from this attempt. All NULL when parsing failed.
    -- subtotal/tax/tip exist so the math check has something to reconcile against.
    merchant_name        VARCHAR(255),
    receipt_date         DATE,
    subtotal             NUMERIC(12,2),
    tax                  NUMERIC(12,2),
    tip                  NUMERIC(12,2),
    total_amount         NUMERIC(12,2),
    confidence_score     NUMERIC(4,3),
    validation_passed    BOOLEAN,
    validation_details   JSONB,
    error_message        TEXT,
    duration_ms          INT,
    created_at           TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_receipt_extractions_receipt_attempt ON receipt_extractions(receipt_id, attempt_number);

CREATE TABLE receipt_line_items (
    id             BIGSERIAL PRIMARY KEY,
    receipt_id     BIGINT NOT NULL REFERENCES receipts(id) ON DELETE CASCADE,
    line_number    INT NOT NULL,
    description    VARCHAR(500) NOT NULL,
    quantity       NUMERIC(10,2) NOT NULL DEFAULT 1,
    unit_price     NUMERIC(12,2),
    amount         NUMERIC(12,2) NOT NULL,
    category_id    BIGINT REFERENCES categories(id),
    is_user_edited BOOLEAN NOT NULL DEFAULT false,
    created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_receipt_line_items_receipt_id ON receipt_line_items(receipt_id);

CREATE TABLE category_rules (
    id                       BIGSERIAL PRIMARY KEY,
    owner_id                 BIGINT NOT NULL REFERENCES users(id),
    merchant_name_normalized VARCHAR(255) NOT NULL,
    category_id              BIGINT NOT NULL REFERENCES categories(id),
    match_type                VARCHAR(20) NOT NULL DEFAULT 'EXACT'
        CHECK (match_type IN ('EXACT','CONTAINS')),
    times_applied              INT NOT NULL DEFAULT 0,
    created_at                 TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at                 TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT uq_category_rules_owner_merchant UNIQUE (owner_id, merchant_name_normalized)
);

CREATE TABLE field_corrections (
    id            BIGSERIAL PRIMARY KEY,
    receipt_id    BIGINT NOT NULL REFERENCES receipts(id) ON DELETE CASCADE,
    owner_id      BIGINT NOT NULL REFERENCES users(id),
    field_name    VARCHAR(100) NOT NULL,
    old_value     TEXT,
    new_value     TEXT,
    corrected_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_field_corrections_receipt_id ON field_corrections(receipt_id);

CREATE TABLE processing_jobs (
    id             BIGSERIAL PRIMARY KEY,
    receipt_id     BIGINT NOT NULL REFERENCES receipts(id) ON DELETE CASCADE,
    job_type       VARCHAR(30) NOT NULL DEFAULT 'EXTRACT_RECEIPT',
    status         VARCHAR(20) NOT NULL DEFAULT 'PENDING'
        CHECK (status IN ('PENDING','RUNNING','SUCCEEDED','FAILED')),
    attempt_count  INT NOT NULL DEFAULT 0,
    max_attempts   INT NOT NULL DEFAULT 3,
    next_retry_at  TIMESTAMPTZ,
    last_error     TEXT,
    locked_by      VARCHAR(100),
    locked_at      TIMESTAMPTZ,
    created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_processing_jobs_poll ON processing_jobs(status, next_retry_at)
    WHERE status IN ('PENDING','FAILED');

CREATE TABLE monthly_summaries (
    id             BIGSERIAL PRIMARY KEY,
    owner_id       BIGINT NOT NULL REFERENCES users(id),
    year           INT NOT NULL,
    month          INT NOT NULL CHECK (month BETWEEN 1 AND 12),
    summary_text   TEXT NOT NULL,
    stats_snapshot JSONB NOT NULL,
    llm_provider   VARCHAR(50) NOT NULL,
    llm_model      VARCHAR(100),
    generated_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT uq_monthly_summaries_owner_period UNIQUE (owner_id, year, month)
);

CREATE INDEX idx_monthly_summaries_owner_period ON monthly_summaries(owner_id, year, month);
