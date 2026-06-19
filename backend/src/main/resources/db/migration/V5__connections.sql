-- Connections: directional request from requester → addressee, then accept/decline.

CREATE TABLE connections (
    id            UUID PRIMARY KEY,
    requester_id  UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    addressee_id  UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    status        VARCHAR(32) NOT NULL,
    created_at    TIMESTAMPTZ NOT NULL,
    updated_at    TIMESTAMPTZ NOT NULL,
    deleted_at    TIMESTAMPTZ,
    UNIQUE (requester_id, addressee_id),
    CHECK (requester_id <> addressee_id)
);
CREATE INDEX idx_connections_addressee ON connections (addressee_id, status);
CREATE INDEX idx_connections_requester ON connections (requester_id, status);
