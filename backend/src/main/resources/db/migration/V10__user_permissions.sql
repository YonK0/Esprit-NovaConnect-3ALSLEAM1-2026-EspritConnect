-- V10: Per-user fine-grained permission revocations.
--
-- Model: store ONLY the revocations, not the grants. Every action has a
-- default permission inferred from the user's role (e.g. RECRUITER can
-- post jobs, MENTOR can offer mentorship). The admin uses this table to
-- DENY a specific user a default permission they would otherwise have.
--
-- Why "revoke only" rather than "explicit allow":
--   1. Smaller table — most users have no rows here at all.
--   2. Adding a new permission code doesn't require backfilling rows
--      for every existing user.
--   3. Audit-friendly: every row represents an explicit admin decision.
--
-- Permission codes are kept as strings (not an enum) so we can add new
-- codes without a DB migration. The Java side declares an enum for
-- compile-time safety; the table only persists the string name.

CREATE TABLE user_permission_revocations (
    user_id          UUID         NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    permission_code  VARCHAR(64)  NOT NULL,
    revoked_at       TIMESTAMPTZ  NOT NULL DEFAULT now(),
    revoked_by       UUID         REFERENCES users(id) ON DELETE SET NULL,
    reason           VARCHAR(500),
    PRIMARY KEY (user_id, permission_code)
);

CREATE INDEX idx_uperm_user ON user_permission_revocations (user_id);
