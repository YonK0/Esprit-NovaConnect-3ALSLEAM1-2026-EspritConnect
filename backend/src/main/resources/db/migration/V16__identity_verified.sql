-- V14: optional identity verification
--
-- Identity verification (face + document upload) is no longer required at
-- signup — users go through email verification only and then sit in
-- PENDING_APPROVAL until an admin approves them. Admins can later request
-- identity verification on a per-user basis; the requested_at timestamp
-- drives the in-app banner on the user's next login.

ALTER TABLE users ADD COLUMN identity_verified BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE users ADD COLUMN identity_verification_requested_at TIMESTAMPTZ;

-- Backfill: any user who previously made it past the identity-verification
-- orchestrator (status ACTIVE with a face_embedding stored) is treated as
-- already identity-verified. Without this, every existing user would lose
-- their verification badge after the migration.
UPDATE users
   SET identity_verified = TRUE
 WHERE status::text = 'ACTIVE'
   AND face_embedding IS NOT NULL;
