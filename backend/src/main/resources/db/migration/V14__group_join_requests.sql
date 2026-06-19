-- V14: persisted join requests for private groups.
-- One row per (group, user); status tracks owner decision.

CREATE TABLE group_join_requests (
    id           UUID PRIMARY KEY,
    group_id     UUID NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
    user_id      UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    status       VARCHAR(16) NOT NULL DEFAULT 'PENDING',
    decided_at   TIMESTAMPTZ,
    decided_by   UUID REFERENCES users(id) ON DELETE SET NULL,
    created_at   TIMESTAMPTZ NOT NULL,
    updated_at   TIMESTAMPTZ NOT NULL,
    deleted_at   TIMESTAMPTZ,
    UNIQUE (group_id, user_id)
);

CREATE INDEX idx_group_join_requests_group_status
    ON group_join_requests (group_id, status);
