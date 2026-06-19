-- V9: Admin-driven password reset.
--
-- Adds a one-shot reset token + expiry on users so admins can trigger
-- "send password reset email" without coupling to a SMTP provider yet
-- (the dev MailService just logs the link). A separate token field from
-- ev_token because the two flows can run independently: a user might
-- request a reset before verifying email.
ALTER TABLE users
    ADD COLUMN pwd_reset_token       VARCHAR(128),
    ADD COLUMN pwd_reset_expires_at  TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_users_pwd_reset_token
    ON users (pwd_reset_token)
    WHERE pwd_reset_token IS NOT NULL;
