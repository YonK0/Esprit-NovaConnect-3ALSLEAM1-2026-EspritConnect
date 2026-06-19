-- Verification flow (Phase 1).
-- Adds the audit table and two columns on users to track verification state.

ALTER TABLE users ADD COLUMN verified_at TIMESTAMPTZ;
ALTER TABLE users ADD COLUMN verification_attempts_count INT NOT NULL DEFAULT 0;
-- 128-d face embedding stored as raw bytes; reused later for re-auth flows.
ALTER TABLE users ADD COLUMN face_embedding BYTEA;

CREATE TABLE verification_attempts (
    id                       UUID PRIMARY KEY,
    user_id                  UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    step                     VARCHAR(32) NOT NULL,
    outcome                  VARCHAR(32) NOT NULL,
    id_file_url              VARCHAR(512),
    secondary_file_url       VARCHAR(512),
    extracted_id_name        VARCHAR(200),
    extracted_secondary_name VARCHAR(200),
    name_match_score         DOUBLE PRECISION,
    face_match_score         DOUBLE PRECISION,
    liveness_passed          BOOLEAN,
    attempt_number           INT NOT NULL DEFAULT 1,
    rejection_reason         TEXT,
    raw_response             JSONB,
    completed_at             TIMESTAMPTZ,
    created_at               TIMESTAMPTZ NOT NULL,
    updated_at               TIMESTAMPTZ NOT NULL,
    deleted_at               TIMESTAMPTZ
);
CREATE INDEX idx_va_user_completed ON verification_attempts (user_id, completed_at DESC);
CREATE INDEX idx_va_step           ON verification_attempts (step);
CREATE INDEX idx_va_outcome        ON verification_attempts (outcome);
